import type { PiWebPlugin } from "@jmfederico/pi-web/plugin-api";
import { ACTIONS_CONFIG_PATH } from "./config.js";
import { actionsPanelBadge, defineActionsPanelElement } from "./actionsPanelElement.js";
import { terminalCommandRunsFromContext } from "./piWebInternal.js";

const plugin: PiWebPlugin = {
  apiVersion: 1,
  name: "Workspace Actions",
  activate: ({ pluginId, html }) => {
    defineActionsPanelElement();

    return {
      contributions: {
        actions: [
          {
            id: "workspace.open-actions",
            title: "Open Workspace Actions",
            description: `Open the workspace Actions tab. Configure actions in ${ACTIONS_CONFIG_PATH}.`,
            group: "Workspace",
            enabled: (context) => context.state.selectedWorkspace !== undefined,
            run: (context) => {
              if (context.state.selectedWorkspace === undefined) return;
              context.selectWorkspaceTool(`${pluginId}:workspace.actions`);
            },
          },
        ],
        workspacePanels: [
          {
            id: "workspace.actions",
            title: "Actions",
            order: 40,
            badge: ({ workspace }) => actionsPanelBadge(workspace),
            render: (context) => html`<pi-web-actions-panel .workspace=${context.workspace} .terminalCommandRuns=${terminalCommandRunsFromContext(context)} .openTerminal=${context.openTerminal}></pi-web-actions-panel>`,
          },
        ],
      },
    };
  },
};

export default plugin;
