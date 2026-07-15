import type { SessionRef } from "../../../shared/apiTypes";
import { resolveAppWebSocketUrl } from "../appUrl";

type SessionLookup = SessionRef | string;

interface TerminalSize {
  cols: number;
  rows: number;
}

function terminalSizeQuery(size: TerminalSize | undefined): string {
  return size === undefined ? "" : `?${new URLSearchParams({ cols: String(size.cols), rows: String(size.rows) }).toString()}`;
}

export function sessionEvents(session: SessionLookup, machineId = "local"): WebSocket {
  const cwd = typeof session === "string" ? undefined : session.cwd;
  const query = cwd === undefined || cwd === "" ? "" : `?${new URLSearchParams({ cwd }).toString()}`;
  const sessionId = typeof session === "string" ? session : session.id;
  return new WebSocket(resolveAppWebSocketUrl(`${machinePrefix(machineId)}/sessions/${encodeURIComponent(sessionId)}/events${query}`));
}

export function globalSessionEvents(machineId = "local"): WebSocket {
  return new WebSocket(resolveAppWebSocketUrl(`${machinePrefix(machineId)}/sessions/events`));
}

export function terminalSocket(projectId: string, workspaceId: string, terminalId: string, initialSize?: TerminalSize, machineId = "local"): WebSocket {
  return new WebSocket(resolveAppWebSocketUrl(`${machinePrefix(machineId)}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}/terminals/${encodeURIComponent(terminalId)}/socket${terminalSizeQuery(initialSize)}`));
}

export function machineTerminalSocket(terminalId: string, initialSize?: TerminalSize, machineId = "local"): WebSocket {
  return new WebSocket(resolveAppWebSocketUrl(`${machinePrefix(machineId)}/terminals/${encodeURIComponent(terminalId)}/socket${terminalSizeQuery(initialSize)}`));
}

export function realtimeEvents(machineId = "local"): WebSocket {
  return new WebSocket(resolveAppWebSocketUrl(`${machinePrefix(machineId)}/events`));
}

function machinePrefix(machineId: string): string {
  return `api/machines/${encodeURIComponent(machineId)}`;
}
