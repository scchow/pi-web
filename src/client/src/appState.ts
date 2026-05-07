import type { CommandResult, Project, SessionActivity, SessionInfo, SessionStatus, Workspace } from "./api";
import type { ChatLine } from "./components/shared";

export interface AppState {
  projects: Project[];
  workspaces: Workspace[];
  sessions: SessionInfo[];
  messages: ChatLine[];
  selectedProject?: Project;
  selectedWorkspace?: Workspace;
  selectedSession?: SessionInfo;
  status?: SessionStatus;
  activity?: SessionActivity;
  sessionStatuses: Record<string, SessionStatus>;
  sessionActivities: Record<string, SessionActivity>;
  commandDialog?: Extract<CommandResult, { type: "select" }>;
  error: string;
}

export function initialAppState(): AppState {
  return {
    projects: [],
    workspaces: [],
    sessions: [],
    messages: [],
    sessionStatuses: {},
    sessionActivities: {},
    error: "",
  };
}
