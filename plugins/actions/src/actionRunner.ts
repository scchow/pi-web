import type { Workspace } from "@jmfederico/pi-web/plugin-api";
import type { WorkspaceAction } from "./config.js";
import type { InternalTerminalCommandRunsRuntime } from "./piWebInternal.js";

export function runWorkspaceActionInTerminal(terminal: InternalTerminalCommandRunsRuntime, workspace: Workspace, action: WorkspaceAction): ReturnType<InternalTerminalCommandRunsRuntime["runCommand"]> {
  return terminal.runCommand({
    workspace,
    title: action.title,
    command: action.command,
    open: true,
    metadata: {
      "pi.plugin": "actions",
      "action.id": action.id,
    },
  });
}
