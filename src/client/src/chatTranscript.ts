import { appendText, normalizeMessage, textMessage, withMessageMeta } from "./chatMessages";
import type { ChatLine } from "./components/shared";
import { appendShellChunk, finalizeShellMessage, shellStartMessage } from "./shellMessages";
import type { SessionUiEvent } from "./sessionSocket";

export function applyTranscriptEvent(messages: ChatLine[], event: SessionUiEvent): ChatLine[] | undefined {
  if (event.type === "message.append") return appendNormalized(messages, event.message);
  if (event.type === "assistant.delta") return appendText(messages, "assistant", event.text);
  if (event.type === "tool.start") return appendNormalized(messages, { role: "assistant", content: [{ type: "toolCall", name: event.toolName, arguments: event.args }] });
  if (event.type === "tool.end") return appendNormalized(messages, { role: "toolResult", toolName: event.toolName, content: event.content ?? [{ type: "text", text: event.text }], isError: event.isError });
  if (event.type === "shell.start") return [...messages, shellStartMessage(event.command, event.excludeFromContext)];
  if (event.type === "shell.chunk") return appendShellChunk(messages, event.chunk);
  if (event.type === "shell.end") return finalizeShellMessage(messages, event);
  if (event.type === "command.output") return [...messages, textMessage(event.level === "error" ? "system" : "tool", event.message)];
  if (event.type === "session.error") return [...messages, textMessage("system", event.message)];
  if (event.type === "message.end") return event.message === undefined ? undefined : applyMessageEndMeta(messages, event.message);
  return undefined;
}

function applyMessageEndMeta(messages: ChatLine[], rawMessage: unknown): ChatLine[] | undefined {
  const ended = normalizeMessage(rawMessage)[0];
  if (ended === undefined || ended.meta === undefined) return undefined;
  const index = findLastMatchingRole(messages, ended.role);
  if (index < 0) return undefined;
  return messages.map((message, i) => i === index ? withMessageMeta(message, rawMessage) : message);
}

function findLastMatchingRole(messages: ChatLine[], role: ChatLine["role"]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === role) return i;
  }
  return -1;
}

function appendNormalized(messages: ChatLine[], rawMessage: unknown): ChatLine[] {
  return normalizeMessage(rawMessage).reduce(appendLine, messages);
}

function appendLine(messages: ChatLine[], line: ChatLine): ChatLine[] {
  const last = messages.at(-1);
  if (last?.role === line.role) return [...messages.slice(0, -1), { ...last, parts: [...last.parts, ...line.parts] }];
  return [...messages, line];
}
