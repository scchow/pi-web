import type { FastifyInstance, FastifyReply } from "fastify";
import { machineScopedPluginId, parseMachineScopedPluginId, type MachineScopedPluginIdParts } from "../../shared/machinePluginIds.js";
import { isPiWebPluginId } from "../../shared/pluginIds.js";
import { RemoteMachineRequestError, type MachineClient } from "./machineClient.js";
import { MachineService } from "./machineService.js";

interface RemotePluginManifestEntry {
  id: string;
  module: string;
  source?: string;
  scope?: string;
}

interface RemotePluginManifest {
  plugins: RemotePluginManifestEntry[];
}

interface MachinePluginProxyMachines {
  remoteClient(id: string): Promise<MachineClient | undefined>;
}

const MACHINE_PLUGIN_MANIFEST_TIMEOUT_MS = 10_000;

const SAFE_RESPONSE_HEADERS = new Set([
  "content-type",
  "content-length",
  "cache-control",
  "last-modified",
  "etag",
  "content-security-policy",
  "x-content-type-options",
]);

export function registerMachinePluginProxyRoutes(app: FastifyInstance, machines: MachinePluginProxyMachines = new MachineService()): void {
  app.get<{ Params: { machineId: string } }>("/api/machines/:machineId/pi-web-plugins/manifest.json", async (request, reply) => {
    if (request.params.machineId === "local") return { plugins: [] };

    const client = await machines.remoteClient(request.params.machineId);
    if (client === undefined) return reply.code(404).send({ error: "Machine not found" });

    try {
      const response = await client.requestJson("GET", "/pi-web-plugins/manifest.json", undefined, { timeoutMs: MACHINE_PLUGIN_MANIFEST_TIMEOUT_MS });
      if (response.statusCode === 404) return { plugins: [] };
      if (response.statusCode < 200 || response.statusCode >= 300) return await reply.code(response.statusCode).send(response.body);
      return rewriteRemotePluginManifest(request.params.machineId, parseRemoteManifest(response.body));
    } catch (error) {
      return sendGatewayError(reply, request.params.machineId, error);
    }
  });
}

export async function proxyMachinePluginAsset(machines: MachinePluginProxyMachines, scopedPluginId: string, assetPath: string, requestUrl: string, reply: FastifyReply): Promise<boolean> {
  const remotePlugin = parseMachineScopedPluginId(scopedPluginId);
  if (remotePlugin === undefined) return false;

  const client = await machines.remoteClient(remotePlugin.machineId);
  if (client === undefined) {
    await reply.code(404).send({ error: "Machine not found" });
    return true;
  }

  try {
    const upstream = await client.request("GET", remotePluginAssetRequestPath(remotePlugin, assetPath, requestUrl));
    reply.code(upstream.statusCode);
    applySafeHeaders(reply, upstream.headers);
    if (upstream.body === undefined) await reply.send();
    else await reply.send(upstream.body);
    return true;
  } catch (error) {
    sendGatewayError(reply, remotePlugin.machineId, error);
    return true;
  }
}

function rewriteRemotePluginManifest(machineId: string, manifest: RemotePluginManifest): RemotePluginManifest {
  return {
    plugins: manifest.plugins.flatMap((plugin) => {
      const modulePath = remotePluginModulePath(plugin.id, plugin.module);
      if (modulePath === undefined) return [];
      return [{
        ...plugin,
        module: `/pi-web-plugins/${encodeURIComponent(machineScopedPluginId(machineId, plugin.id))}/${modulePath.path}${modulePath.query}`,
      }];
    }),
  };
}

function remotePluginModulePath(pluginId: string, module: string): { path: string; query: string } | undefined {
  if (!isPiWebPluginId(pluginId)) return undefined;
  try {
    const url = new URL(module, "http://pi-web.local");
    const prefix = `/pi-web-plugins/${encodeURIComponent(pluginId)}/`;
    if (url.pathname.startsWith(prefix)) {
      return { path: url.pathname.slice(prefix.length), query: url.search };
    }
    if (!module.startsWith("/") && !/^https?:\/\//iu.test(module)) {
      const [path, query = ""] = module.split("?", 2);
      if (path !== undefined && path !== "") return { path, query: query === "" ? "" : `?${query}` };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function remotePluginAssetRequestPath(remotePlugin: MachineScopedPluginIdParts, assetPath: string, requestUrl: string): string {
  const query = requestUrl.includes("?") ? requestUrl.slice(requestUrl.indexOf("?")) : "";
  return `/pi-web-plugins/${encodeURIComponent(remotePlugin.pluginId)}/${encodePathSegments(assetPath)}${query}`;
}

function encodePathSegments(path: string): string {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function parseRemoteManifest(value: unknown): RemotePluginManifest {
  if (!isRecord(value) || !Array.isArray(value["plugins"])) throw new Error("Invalid remote PI WEB plugin manifest");
  return {
    plugins: value["plugins"].map((entry) => {
      if (!isRecord(entry) || typeof entry["id"] !== "string" || !isPiWebPluginId(entry["id"]) || typeof entry["module"] !== "string" || entry["module"] === "") {
        throw new Error("Invalid remote PI WEB plugin manifest entry");
      }
      return {
        id: entry["id"],
        module: entry["module"],
        ...(typeof entry["source"] === "string" ? { source: entry["source"] } : {}),
        ...(typeof entry["scope"] === "string" ? { scope: entry["scope"] } : {}),
      };
    }),
  };
}

function applySafeHeaders(reply: FastifyReply, headers: Record<string, string | string[] | undefined>): void {
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (!SAFE_RESPONSE_HEADERS.has(name.toLowerCase())) continue;
    reply.header(name, value);
  }
}

function sendGatewayError(reply: FastifyReply, machineId: string, error: unknown): FastifyReply {
  const statusCode = error instanceof RemoteMachineRequestError ? error.statusCode : 502;
  const label = statusCode === 504 ? "Remote machine timeout" : "Remote machine unavailable";
  return reply.code(statusCode).send({
    error: label,
    machineId,
    statusCode,
    detail: error instanceof Error ? error.message : String(error),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
