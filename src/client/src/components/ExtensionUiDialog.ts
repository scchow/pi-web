import { LitElement, css, html, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { ExtensionUiDialogRequest } from "../../../shared/apiTypes";

@customElement("extension-ui-dialog")
export class ExtensionUiDialog extends LitElement {
  @property({ attribute: false }) request?: ExtensionUiDialogRequest;
  @property({ attribute: false }) onResponse?: (requestId: string, response: Record<string, unknown>) => void;
  @property({ attribute: false }) onCancel?: () => void;

  @state() private inputValue = "";
  @state() private selectedOption: string | undefined;

  override willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("request")) {
      this.inputValue = "";
      this.selectedOption = undefined;
    }
  }

  override render(): TemplateResult {
    if (!this.request) return html``;

    const { kind, title } = this.request;
    const message = "message" in this.request ? this.request.message : undefined;
    const options = "options" in this.request ? this.request.options : undefined;
    const placeholder = "placeholder" in this.request ? this.request.placeholder : undefined;
    const prefill = "prefill" in this.request ? this.request.prefill : undefined;

    return html`
      <div class="prompt">
        <div class="header">
          <span class="icon">⚡</span>
          <span class="title">${title}</span>
        </div>
        ${message !== undefined && message !== "" ? html`<p class="message">${message}</p>` : null}
        ${kind === "select" && options ? this.renderSelect(options) : ""}
        ${kind === "confirm" ? this.renderConfirm() : ""}
        ${kind === "input" ? this.renderInput(placeholder) : ""}
        ${kind === "editor" ? this.renderEditor(prefill) : ""}
        ${kind === "input" || kind === "editor" ? html`
          <div class="actions">
            <button class="btn cancel" @click=${() => { this.handleCancel(); }}>Cancel</button>
            <button class="btn ok" ?disabled=${!this.isValid()} @click=${() => { this.handleConfirm(); }}>OK</button>
          </div>
        ` : ""}
      </div>
    `;
  }

  private renderSelect(options: string[]): TemplateResult {
    return html`
      <div class="options">
        ${options.map((option) => html`
          <button
            class="opt"
            ?active=${this.selectedOption === option}
            @click=${() => { this.selectedOption = option; this.handleConfirm(); }}
          >${option}</button>
        `)}
      </div>
    `;
  }

  private renderConfirm(): TemplateResult {
    return html`
      <div class="options">
        <button
          class="opt yes"
          ?active=${this.selectedOption === "yes"}
          @click=${() => { this.selectedOption = "yes"; this.handleConfirm(); }}
        >Allow</button>
        <button
          class="opt no"
          ?active=${this.selectedOption === "no"}
          @click=${() => { this.selectedOption = "no"; this.handleConfirm(); }}
        >Deny</button>
      </div>
    `;
  }

  private renderInput(placeholder?: string): TemplateResult {
    return html`
      <input
        class="text-input"
        type="text"
        placeholder=${placeholder ?? ""}
        .value=${this.inputValue}
        @input=${(event: Event) => { const target = event.target; if (target instanceof HTMLInputElement) this.inputValue = target.value; }}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === "Enter" && this.isValid()) {
            event.preventDefault();
            this.handleConfirm();
          }
        }}
      />
    `;
  }

  private renderEditor(prefill?: string): TemplateResult {
    return html`
      <textarea
        class="text-editor"
        .value=${prefill ?? ""}
        @input=${(event: Event) => { const target = event.target; if (target instanceof HTMLTextAreaElement) this.inputValue = target.value; }}
      ></textarea>
    `;
  }

  private isValid(): boolean {
    if (!this.request) return false;
    if (this.request.kind === "select") return this.selectedOption !== undefined;
    if (this.request.kind === "confirm") return this.selectedOption !== undefined;
    return true;
  }

  private handleConfirm(): void {
    if (!this.request || !this.isValid()) return;
    const { kind } = this.request;

    const response: Record<string, unknown> = kind === "select"
      ? { value: this.selectedOption }
      : kind === "confirm"
        ? { confirmed: this.selectedOption === "yes" }
        : { value: this.inputValue };

    this.onResponse?.(this.request.requestId, response);
  }

  private handleCancel(): void {
    if (!this.request) return;
    this.onResponse?.(this.request.requestId, { cancelled: true });
  }

  static override styles = css`
    :host {
      display: block;
      flex: 0 0 auto;
      padding: 0 16px 8px;
    }

    .prompt {
      border: 1px solid var(--pi-warning-border, #85450a);
      border-radius: 10px;
      background: var(--pi-warning-surface, #271f00);
      padding: 10px 12px;
      font-size: 13px;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--pi-warning, #f59e0b);
    }

    .icon {
      font-size: 14px;
    }

    .message {
      margin: 0 0 10px;
      font-size: 13px;
      line-height: 1.4;
      color: var(--pi-text, #e4e4e7);
      word-break: break-word;
    }

    .options {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .opt {
      padding: 6px 14px;
      border-radius: 6px;
      border: 1px solid var(--pi-border, #3f3f46);
      background: var(--pi-surface, #18181b);
      color: var(--pi-text, #e4e4e7);
      font-size: 13px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .opt:hover {
      background: var(--pi-hover, #27272a);
    }

    .opt[active] {
      background: var(--pi-selection-bg, #1e1b4b);
      border-color: var(--pi-accent-border, #6366f1);
    }

    .opt.yes {
      border-color: var(--pi-success-border, #16a34a);
      color: var(--pi-success, #22c55e);
    }

    .opt.yes:hover {
      background: var(--pi-success-bg, #052e16);
    }

    .opt.no {
      border-color: var(--pi-danger-border, #dc2626);
      color: var(--pi-danger, #ef4444);
    }

    .opt.no:hover {
      background: var(--pi-danger-bg, #450a0a);
    }

    .text-input {
      width: 100%;
      padding: 6px 10px;
      border: 1px solid var(--pi-border, #3f3f46);
      border-radius: 6px;
      background: var(--pi-input-bg, #27272a);
      color: var(--pi-text, #e4e4e7);
      font-size: 13px;
      box-sizing: border-box;
      margin-bottom: 8px;
    }

    .text-editor {
      width: 100%;
      min-height: 120px;
      padding: 6px 10px;
      border: 1px solid var(--pi-border, #3f3f46);
      border-radius: 6px;
      background: var(--pi-input-bg, #27272a);
      color: var(--pi-text, #e4e4e7);
      font-size: 13px;
      font-family: var(--pi-font-mono, monospace);
      resize: vertical;
      box-sizing: border-box;
      margin-bottom: 8px;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .btn {
      padding: 6px 14px;
      border-radius: 6px;
      border: 1px solid var(--pi-border, #3f3f46);
      background: var(--pi-surface, #18181b);
      color: var(--pi-text, #e4e4e7);
      font-size: 13px;
      cursor: pointer;
    }

    .btn:hover:not(:disabled) {
      background: var(--pi-hover, #27272a);
    }

    .btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .btn.ok {
      background: var(--pi-accent, #6366f1);
      border-color: var(--pi-accent, #6366f1);
      color: #fff;
    }
  `;
}
