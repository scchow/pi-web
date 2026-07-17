import crypto from "node:crypto";
import type { AuthEvent, AuthInteraction, AuthPrompt } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { CommandOption, OAuthFlowState } from "../../shared/apiTypes.js";

/** The single runtime capability this service drives — narrowed for testable DI. */
type OAuthLoginRuntime = Pick<ModelRuntime, "login">;
type TimerHandle = ReturnType<typeof setTimeout>;

interface PendingOAuthRequest {
  requestId: string;
  allowEmpty: boolean;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
}

interface OAuthFlowRecord {
  flowId: string;
  state: OAuthFlowState;
  abort: AbortController;
  pending: PendingOAuthRequest | undefined;
  terminalAt?: number;
  cleanupTimer?: TimerHandle;
}

export interface OAuthLoginFlowServiceOptions {
  terminalTtlMs?: number;
  runningTtlMs?: number;
  now?: () => number;
}

const DEFAULT_TERMINAL_TTL_MS = 5 * 60 * 1000;
const DEFAULT_RUNNING_TTL_MS = 30 * 60 * 1000;

export class OAuthLoginFlowService {
  private readonly flows = new Map<string, OAuthFlowRecord>();
  private readonly terminalTtlMs: number;
  private readonly runningTtlMs: number;
  private readonly now: () => number;

  constructor(options: OAuthLoginFlowServiceOptions = {}) {
    this.terminalTtlMs = options.terminalTtlMs ?? DEFAULT_TERMINAL_TTL_MS;
    this.runningTtlMs = options.runningTtlMs ?? DEFAULT_RUNNING_TTL_MS;
    this.now = options.now ?? (() => Date.now());
  }

  start(options: {
    providerId: string;
    providerName: string;
    runtime: OAuthLoginRuntime;
    onComplete?: () => void;
  }): OAuthFlowState {
    const flowId = crypto.randomUUID();
    const abort = new AbortController();
    const record: OAuthFlowRecord = {
      flowId,
      abort,
      pending: undefined,
      state: {
        flowId,
        providerId: options.providerId,
        providerName: options.providerName,
        status: "running",
        progress: [],
      },
    };
    this.flows.set(flowId, record);
    this.scheduleRunningExpiry(record);

    // Adapt the pi-ai AuthInteraction contract onto the web-UI flow state:
    // `prompt()` returns the entered/selected string; `notify()` surfaces
    // out-of-band login events (auth URL, device code, progress).
    const interaction: AuthInteraction = {
      signal: abort.signal,
      prompt: (prompt) => this.handlePrompt(record, prompt),
      notify: (event) => { this.handleEvent(record, event); },
    };

    void options.runtime.login(options.providerId, "oauth", interaction)
      .then(() => {
        if (!this.isCurrentRunning(record)) return;
        record.pending = undefined;
        this.markTerminal(record, { ...withoutInteraction(record.state), status: "complete", progress: [...record.state.progress, "Login complete"] });
        options.onComplete?.();
      })
      .catch((error: unknown) => {
        if (this.flows.get(record.flowId) !== record) return;
        record.pending = undefined;
        if (record.state.status !== "running") return;
        this.markTerminal(record, { ...withoutInteraction(record.state), status: "error", error: error instanceof Error ? error.message : String(error) });
      });

    return this.get(flowId);
  }

  get(flowId: string): OAuthFlowState {
    const record = this.flows.get(flowId);
    if (record === undefined) throw new Error("OAuth login flow not found");
    return cloneState(record.state);
  }

  respond(flowId: string, requestId: string, value: string): OAuthFlowState {
    const record = this.flows.get(flowId);
    if (record === undefined) throw new Error("OAuth login flow not found");
    if (record.state.status !== "running") return cloneState(record.state);
    const pending = record.pending;
    if (pending?.requestId !== requestId) throw new Error("OAuth login request expired");
    if (!pending.allowEmpty && value.trim() === "") throw new Error("A value is required");
    record.pending = undefined;
    this.updateState(record, withoutInteraction(record.state));
    pending.resolve(value);
    return cloneState(record.state);
  }

  cancel(flowId: string): OAuthFlowState {
    const record = this.flows.get(flowId);
    if (record === undefined) throw new Error("OAuth login flow not found");
    if (record.state.status === "running") {
      record.abort.abort();
      const pending = record.pending;
      record.pending = undefined;
      this.markTerminal(record, { ...withoutInteraction(record.state), status: "cancelled", error: "Login cancelled" });
      pending?.reject(new Error("Login cancelled"));
    }
    return cloneState(record.state);
  }

  dispose(): void {
    for (const record of this.flows.values()) {
      this.clearTimer(record);
      record.abort.abort();
      const pending = record.pending;
      record.pending = undefined;
      pending?.reject(new Error("Login cancelled"));
    }
    this.flows.clear();
  }

  private handlePrompt(record: OAuthFlowRecord, prompt: AuthPrompt): Promise<string> {
    if (prompt.type === "select") {
      return this.waitForSelect(record, prompt.message, prompt.options, prompt.signal);
    }
    // `manual_code` is the paste-back path for callback-server flows; text/secret
    // are ordinary interactive entry. Both map to the single web-UI prompt shape.
    const kind = prompt.type === "manual_code" ? "manual" : "prompt";
    return this.waitForPrompt(record, {
      message: prompt.message,
      ...(prompt.placeholder === undefined ? {} : { placeholder: prompt.placeholder }),
      ...(prompt.signal === undefined ? {} : { signal: prompt.signal }),
    }, kind);
  }

  private handleEvent(record: OAuthFlowRecord, event: AuthEvent): void {
    if (!this.isCurrentRunning(record)) return;
    switch (event.type) {
      case "auth_url":
        this.updateState(record, { ...record.state, auth: { url: event.url, ...(event.instructions === undefined ? {} : { instructions: event.instructions }) } });
        return;
      // Device-code flows have no redirect URL; reuse the auth field so the web UI
      // shows the verification link and user code without a dedicated API shape.
      case "device_code":
        this.updateState(record, { ...record.state, auth: { url: event.verificationUri, instructions: `Enter code: ${event.userCode}` } });
        return;
      case "info":
      case "progress":
        this.updateState(record, { ...record.state, progress: [...record.state.progress, event.message] });
        return;
    }
  }

  private waitForPrompt(record: OAuthFlowRecord, prompt: { message: string; placeholder?: string; signal?: AbortSignal }, kind: "prompt" | "manual"): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.isCurrentRunning(record)) {
        reject(new Error("Login cancelled"));
        return;
      }
      if (prompt.signal?.aborted === true) {
        reject(new Error("Prompt cancelled"));
        return;
      }
      const requestId = crypto.randomUUID();
      record.pending = { requestId, allowEmpty: false, resolve, reject };
      this.bindPromptSignal(record, requestId, prompt.signal);
      const base = withoutInteraction(record.state);
      this.updateState(record, {
        ...base,
        prompt: {
          requestId,
          message: prompt.message,
          kind,
          ...(prompt.placeholder === undefined ? {} : { placeholder: prompt.placeholder }),
        },
      });
    });
  }

  private waitForSelect(record: OAuthFlowRecord, message: string, promptOptions: readonly { id: string; label: string; description?: string }[], signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.isCurrentRunning(record)) {
        reject(new Error("Login cancelled"));
        return;
      }
      if (signal?.aborted === true) {
        reject(new Error("Prompt cancelled"));
        return;
      }
      const requestId = crypto.randomUUID();
      const options: CommandOption[] = promptOptions.map((option) => ({ value: option.id, label: option.label }));
      record.pending = { requestId, allowEmpty: true, resolve, reject };
      this.bindPromptSignal(record, requestId, signal);
      const base = withoutInteraction(record.state);
      this.updateState(record, { ...base, select: { requestId, message, options } });
    });
  }

  // A prompt may carry its own AbortSignal (e.g. a manual_code prompt raced
  // against a callback server). When it fires, drop just that pending request
  // and clear the interaction from state — the overall login keeps running.
  private bindPromptSignal(record: OAuthFlowRecord, requestId: string, signal?: AbortSignal): void {
    if (signal === undefined) return;
    signal.addEventListener("abort", () => {
      const pending = record.pending;
      if (pending?.requestId !== requestId) return;
      record.pending = undefined;
      if (this.isCurrentRunning(record)) this.updateState(record, withoutInteraction(record.state));
      pending.reject(new Error("Prompt cancelled"));
    }, { once: true });
  }

  private isCurrentRunning(record: OAuthFlowRecord): boolean {
    return this.flows.get(record.flowId) === record && record.state.status === "running";
  }

  private updateState(record: OAuthFlowRecord, state: OAuthFlowState): void {
    record.state = state;
  }

  private markTerminal(record: OAuthFlowRecord, state: OAuthFlowState): void {
    this.updateState(record, state);
    record.terminalAt = this.now();
    this.scheduleTerminalEviction(record);
  }

  private scheduleRunningExpiry(record: OAuthFlowRecord): void {
    if (this.runningTtlMs <= 0) {
      this.expireRunningFlow(record);
      return;
    }
    this.setTimer(record, this.runningTtlMs, () => { this.expireRunningFlow(record); });
  }

  private scheduleTerminalEviction(record: OAuthFlowRecord): void {
    if (this.terminalTtlMs <= 0) {
      this.flows.delete(record.flowId);
      this.clearTimer(record);
      return;
    }
    this.setTimer(record, this.terminalTtlMs, () => {
      if (this.flows.get(record.flowId) !== record) return;
      if (record.terminalAt === undefined) return;
      if (this.now() - record.terminalAt < this.terminalTtlMs) {
        this.scheduleTerminalEviction(record);
        return;
      }
      this.flows.delete(record.flowId);
      this.clearTimer(record);
    });
  }

  private expireRunningFlow(record: OAuthFlowRecord): void {
    if (!this.isCurrentRunning(record)) return;
    record.abort.abort();
    const pending = record.pending;
    record.pending = undefined;
    this.markTerminal(record, { ...withoutInteraction(record.state), status: "error", error: "OAuth login flow expired" });
    pending?.reject(new Error("OAuth login flow expired"));
  }

  private setTimer(record: OAuthFlowRecord, delayMs: number, callback: () => void): void {
    this.clearTimer(record);
    record.cleanupTimer = setTimeout(callback, delayMs);
    unrefTimer(record.cleanupTimer);
  }

  private clearTimer(record: OAuthFlowRecord): void {
    if (record.cleanupTimer === undefined) return;
    clearTimeout(record.cleanupTimer);
    delete record.cleanupTimer;
  }
}

function withoutInteraction(state: OAuthFlowState): OAuthFlowState {
  const rest = { ...state };
  delete rest.prompt;
  delete rest.select;
  return rest;
}

function cloneState(state: OAuthFlowState): OAuthFlowState {
  return {
    ...state,
    progress: [...state.progress],
    ...(state.auth === undefined ? {} : { auth: { ...state.auth } }),
    ...(state.prompt === undefined ? {} : { prompt: { ...state.prompt } }),
    ...(state.select === undefined ? {} : { select: { ...state.select, options: state.select.options.map((option) => ({ ...option })) } }),
  };
}

function unrefTimer(timer: TimerHandle): void {
  if (typeof timer !== "object" || !("unref" in timer) || typeof timer.unref !== "function") return;
  timer.unref();
}
