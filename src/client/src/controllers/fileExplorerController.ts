import { api } from "../api";
import { queryNamespace, setNamespacedQueryKey } from "../namespacedQueryArgs";
import type { GetState, SetState, UpdateUrl } from "./types";

const FILES_ROUTE_NAMESPACE = queryNamespace("core:workspace.files");

export class FileExplorerController {
  constructor(private readonly getState: GetState, private readonly setState: SetState, private readonly updateUrl: UpdateUrl) {}

  async refreshFiles(): Promise<void> {
    const project = this.getState().selectedProject;
    const workspace = this.getState().selectedWorkspace;
    if (project === undefined || workspace === undefined) return;
    try {
      const root = await api.workspaceTree(project.id, workspace.id);
      const expanded = { ...this.getState().expandedDirs };
      await Promise.all(Object.keys(expanded).map(async (path) => { expanded[path] = (await api.workspaceTree(project.id, workspace.id, path)).entries; }));
      this.setState({ fileTree: root.entries, expandedDirs: expanded, fileTreeStale: false, error: "" });
    } catch (error) {
      this.setState({ error: String(error) });
    }
  }

  async expandDir(path: string): Promise<void> {
    const project = this.getState().selectedProject;
    const workspace = this.getState().selectedWorkspace;
    if (project === undefined || workspace === undefined) return;
    if (this.getState().expandedDirs[path] !== undefined) {
      this.setState({ expandedDirs: omitKey(this.getState().expandedDirs, path) });
      return;
    }
    try {
      const response = await api.workspaceTree(project.id, workspace.id, path);
      this.setState({ expandedDirs: { ...this.getState().expandedDirs, [path]: response.entries }, error: "" });
    } catch (error) {
      this.setState({ error: String(error) });
    }
  }

  async selectFile(path: string): Promise<void> {
    this.setState({ selectedFilePath: path, selectedFileContent: undefined, workspaceTool: "core:workspace.files", mainView: this.getState().mainView === "chat" ? "chat" : "core:workspace.files" });
    setNamespacedQueryKey(FILES_ROUTE_NAMESPACE, "file", path);
    this.updateUrl({ replace: true });
    await this.restoreFile(path);
  }

  async restoreFile(path: string): Promise<void> {
    const project = this.getState().selectedProject;
    const workspace = this.getState().selectedWorkspace;
    if (project === undefined || workspace === undefined) return;
    this.setState({ selectedFilePath: path, selectedFileContent: undefined });
    try {
      this.setState({ selectedFileContent: await api.workspaceFile(project.id, workspace.id, path), error: "" });
    } catch (error) {
      this.setState({ error: String(error) });
    }
  }
}

function omitKey<T>(record: Record<string, T>, keyToOmit: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== keyToOmit));
}
