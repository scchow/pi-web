import type { QualifiedContributionId } from "./plugins/types";

interface AppRouteLocation {
  machineId: string | undefined;
  projectId: string | undefined;
  workspaceId: string | undefined;
  sessionId: string | undefined;
}

export interface WorkspaceRouteIdentity {
  machineId: string;
  projectId: string;
  workspaceId: string;
}

/** Route values after plugin-contributed workspace panel aliases are resolved. */
export interface AppRoute extends AppRouteLocation {
  tool: QualifiedContributionId | undefined;
  view: "chat" | QualifiedContributionId | undefined;
}

/** Raw URL route. Tool and view values remain unresolved until machine plugins load. */
export interface ParsedAppRoute extends AppRouteLocation {
  tool: string | undefined;
  view: string | undefined;
}

export type WorkspacePanelRouteResolver = (value: string) => QualifiedContributionId | undefined;

export function readRoute(): ParsedAppRoute {
  const params = new URLSearchParams(window.location.search);
  return {
    machineId: nonEmpty(params.get("machine")),
    projectId: nonEmpty(params.get("project")),
    workspaceId: nonEmpty(params.get("workspace")),
    sessionId: nonEmpty(params.get("session")),
    tool: nonEmpty(params.get("tool")),
    view: nonEmpty(params.get("view")),
  };
}

export function resolveAppRoute(route: ParsedAppRoute, resolveWorkspacePanel: WorkspacePanelRouteResolver): AppRoute {
  return {
    machineId: route.machineId,
    projectId: route.projectId,
    workspaceId: route.workspaceId,
    sessionId: route.sessionId,
    tool: route.tool === undefined ? undefined : resolveWorkspacePanelRouteValue(route.tool, resolveWorkspacePanel),
    view: route.view === "chat"
      ? "chat"
      : route.view === undefined
        ? undefined
        : resolveWorkspacePanelRouteValue(route.view, resolveWorkspacePanel),
  };
}

export function resolveWorkspacePanelRouteValue(value: string, resolveWorkspacePanel: WorkspacePanelRouteResolver): QualifiedContributionId | undefined {
  return resolveWorkspacePanel(value) ?? (isQualifiedContributionId(value) ? value : undefined);
}

export function routeMatchesWorkspaceIdentity(
  route: Pick<ParsedAppRoute, "machineId" | "projectId" | "workspaceId">,
  identity: WorkspaceRouteIdentity,
): boolean {
  return (route.machineId ?? "local") === identity.machineId
    && route.projectId === identity.projectId
    && route.workspaceId === identity.workspaceId;
}

/** Shape of the history state pi-web writes for its route entries. */
export interface PiWebHistoryState {
  /** False once the initial document entry has been taken over by writeRoute. */
  initial?: boolean | undefined;
}

export function readHistoryState(): PiWebHistoryState {
  const state: unknown = window.history.state;
  if (typeof state !== "object" || state === null) return {};
  let initial: boolean | undefined;
  for (const [key, value] of Object.entries(state)) {
    if (key === "initial" && typeof value === "boolean") initial = value;
  }
  return { initial };
}

/**
 * True when the current history entry is still the app's initial document URL
 * (no query parameters). The route is written with pushState for every
 * selection change, so this distinguishes "the user has not navigated yet"
 * from a real navigation; back on the initial entry must not be consumed as
 * one.
 */
export function isInitialHistoryEntry(): boolean {
  return window.location.search === "";
}

export function writeRoute(route: ParsedAppRoute, options?: { replace?: boolean | undefined }): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("machine");
  url.searchParams.delete("project");
  url.searchParams.delete("workspace");
  url.searchParams.delete("session");
  url.searchParams.delete("tool");
  url.searchParams.delete("view");
  if (route.machineId !== undefined && route.machineId !== "" && route.machineId !== "local") url.searchParams.set("machine", route.machineId);
  if (route.projectId !== undefined && route.projectId !== "") url.searchParams.set("project", route.projectId);
  if (route.workspaceId !== undefined && route.workspaceId !== "") url.searchParams.set("workspace", route.workspaceId);
  if (route.sessionId !== undefined && route.sessionId !== "") url.searchParams.set("session", route.sessionId);
  if (route.tool !== undefined && route.tool !== "") url.searchParams.set("tool", route.tool);
  if (route.view !== undefined && route.view !== "") url.searchParams.set("view", route.view);
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  // The initial document entry is the app's base state: overwrite it instead of
  // stacking navigation entries on top, so the browser back button never has to
  // unwind the very first selection.
  const replace = options?.replace === true || readHistoryState().initial === true || isInitialHistoryEntry();
  if (replace) window.history.replaceState({ ...readHistoryState(), initial: false }, "", url);
  else window.history.pushState({}, "", url);
}

function nonEmpty(value: string | null): string | undefined {
  return value === null || value === "" ? undefined : value;
}

function isQualifiedContributionId(value: string): value is QualifiedContributionId {
  return /^[a-z][a-z0-9.-]*:[a-z][a-z0-9.-]*$/u.test(value);
}
