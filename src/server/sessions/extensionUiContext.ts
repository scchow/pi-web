import crypto from "node:crypto";
import type { ExtensionUIDialogOptions, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { Theme } from "@earendil-works/pi-coding-agent";
import type { SessionEventHub } from "../realtime/sessionEventHub.js";
import type { SessionUiEvent } from "../../shared/apiTypes.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- empty theme stub for web mode
const emptyTheme: ExtensionUIContext["theme"] = Object.create(Theme.prototype);

/**
 * Pending dialog request waiting for a client response.
 */
export interface PendingExtensionUiRequest {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timeoutId?: ReturnType<typeof setTimeout>;
}

/**
 * Callback invoked when a pending request is created, to register it with the service.
 */
export type OnPendingRequestCallback = (requestId: string, entry: PendingExtensionUiRequest) => void;

/**
 * Create an ExtensionUIContext implementation that bridges extension UI calls
 * through pi-web's WebSocket event system.
 *
 * Dialog methods (select, confirm, input, editor) emit events to connected
 * clients and await a response. Fire-and-forget methods (notify, setStatus,
 * setWidget) emit events without waiting.
 */
export function createExtensionUIContext(
  sessionId: string,
  events: SessionEventHub,
  onPendingRequest?: OnPendingRequestCallback,
): ExtensionUIContext {
  const publish = (event: Record<string, unknown>) => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- SDK interface requires cast
    events.publish(sessionId, event as SessionUiEvent);
  };

  const createDialogPromise = <T>(
    type: string,
    defaultValue: T,
    request: Record<string, unknown>,
    parseResponse: (response: Record<string, unknown>) => T,
    opts?: ExtensionUIDialogOptions,
  ): Promise<T> => {
    // If signal is already aborted, return default immediately
    if (opts?.signal?.aborted === true) return Promise.resolve(defaultValue);

    const requestId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let signalHandler: (() => void) | undefined;

      const entry: PendingExtensionUiRequest = {
        resolve: (raw: Record<string, unknown>) => { resolve(parseResponse(raw)); },
        reject,
      };

      const cleanup = () => {
        if (timeoutId != null) clearTimeout(timeoutId);
        if (signalHandler != null && opts?.signal != null) opts.signal.removeEventListener("abort", signalHandler);
        // Remove from pending map via callback
        // The service handles this via its own map
      };

      const onAbort = () => {
        cleanup();
        resolve(defaultValue);
      };

      if (opts?.signal != null) {
        signalHandler = onAbort;
        opts.signal.addEventListener("abort", onAbort, { once: true });
      }

      if (opts?.timeout != null) {
        timeoutId = setTimeout(() => {
          cleanup();
          resolve(defaultValue);
        }, opts.timeout);
        entry.timeoutId = timeoutId;
      }

      // Register with the service's pending map
      if (onPendingRequest != null) onPendingRequest(requestId, entry);

      // Emit the UI request to connected clients
      publish({
        type: `extension_ui.${type}`,
        requestId,
        ...request,
        ...(opts?.timeout != null ? { timeout: opts.timeout } : {}),
      });
    });
  };

  const parseSelect = (r: Record<string, unknown>): string | undefined => {
    if (r["cancelled"] === true) return undefined;
    const value = r["value"];
    return typeof value === "string" ? value : undefined;
  };

  const parseConfirm = (r: Record<string, unknown>): boolean => {
    if (r["cancelled"] === true) return false;
    const confirmed = r["confirmed"];
    return typeof confirmed === "boolean" ? confirmed : false;
  };

  const parseInput = (r: Record<string, unknown>): string | undefined => {
    if (r["cancelled"] === true) return undefined;
    const value = r["value"];
    return typeof value === "string" ? value : undefined;
  };

  return {
    select: (title, options, opts) =>
      createDialogPromise("select", undefined, { title, options }, parseSelect, opts),

    confirm: (title, message, opts) =>
      createDialogPromise("confirm", false, { title, message }, parseConfirm, opts),

    input: (title, placeholder, opts) =>
      createDialogPromise("input", undefined, { title, ...(placeholder === undefined ? {} : { placeholder }) }, parseInput, opts),

    editor: (title, prefill) =>
      createDialogPromise("editor", undefined, { title, ...(prefill === undefined ? {} : { prefill }) }, parseInput),

    notify: (message, type) => {
      publish({
        type: "extension_ui.notify",
        message,
        ...(type === undefined ? {} : { notifyType: type }),
      });
    },

    onTerminalInput: () => () => { /* no-op */ },

    setStatus: () => {
      // No-op in web mode - no status bar
    },

    setWorkingMessage: () => {
      // No-op in web mode
    },
    setWorkingVisible: () => {
      // No-op in web mode
    },
    setWorkingIndicator: () => {
      // No-op in web mode
    },
    setHiddenThinkingLabel: () => {
      // No-op in web mode
    },

    setWidget: () => {
      // No-op in web mode - no widget area
    },

    setFooter: () => {
      // No-op in web mode
    },
    setHeader: () => {
      // No-op in web mode
    },
    setTitle: () => {
      // No-op in web mode
    },

    custom: () => {
      throw new Error("Custom dialogs not supported in web mode");
    },

    pasteToEditor: () => {
      // No-op in web mode
    },
    setEditorText: () => {
      // No-op in web mode
    },
    getEditorText: () => "",

    addAutocompleteProvider: () => {
      // No-op in web mode
    },
    setEditorComponent: () => {
      // No-op in web mode
    },
    getEditorComponent: () => undefined,

    get theme() {
      return emptyTheme;
    },

    getAllThemes: () => [],
    getTheme: () => undefined,
    setTheme: () => ({ success: false, error: "Theme switching not supported in web mode" }),

    getToolsExpanded: () => false,
    setToolsExpanded: () => {
      // No-op in web mode
    },
  };
}
