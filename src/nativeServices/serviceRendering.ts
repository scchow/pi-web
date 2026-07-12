import { join } from "node:path";
import type {
  NativeServiceId,
  NativeServicePlan,
  NativeServicePlanService,
  NativeServiceShellName,
} from "./servicePlan.js";

export function renderSystemdUnit(
  plan: NativeServicePlan,
  service: NativeServicePlanService,
): string {
  assertPlanService(plan, service);
  assertBackend(plan, "systemd");
  const workingDirectory = service.workingDirectory === null
    ? ""
    : `WorkingDirectory=${systemdQuotedValue(service.workingDirectory)}\n`;
  const restart = service.restart === "on-failure"
    ? "Restart=on-failure\nRestartSec=2\n"
    : "Restart=no\n";
  return `[Unit]
Description=${service.description}
${systemdDependencyLine(plan, "After", service.after)}${systemdDependencyLine(plan, "Wants", service.wants)}[Service]
Type=simple
${workingDirectory}${systemdEnvironmentLines(service.environment)}ExecStart=/usr/bin/env ${plan.shell.executable} -lc ${systemdServiceShellQuote(plan.shell.name, service.shellCommand)}
${restart}
[Install]
WantedBy=default.target
`;
}

export function renderLaunchdPlist(
  plan: NativeServicePlan,
  service: NativeServicePlanService,
  logDirectory: string,
): string {
  assertPlanService(plan, service);
  assertBackend(plan, "launchd");
  const programArguments = ["/usr/bin/env", plan.shell.executable, "-lc", service.shellCommand];
  const workingDirectory = service.workingDirectory === null
    ? ""
    : plistString("WorkingDirectory", service.workingDirectory);
  const keepAlive = service.restart === "on-failure"
    ? "  <key>KeepAlive</key>\n  <dict>\n    <key>SuccessfulExit</key>\n    <false/>\n  </dict>\n"
    : "";
  const logPath = join(logDirectory, service.manager.logName);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${plistString("Label", service.manager.launchdLabel)}${plistProgramArguments(programArguments)}${workingDirectory}${plistEnvironment(service.environment)}  <key>RunAtLoad</key>
  <true/>
${keepAlive}${plistString("StandardOutPath", logPath)}${plistString("StandardErrorPath", logPath)}</dict>
</plist>
`;
}

function assertPlanService(plan: NativeServicePlan, service: NativeServicePlanService): void {
  if (!plan.services.includes(service)) {
    throw new Error(`Cannot render ${service.id}; it is not a member of the supplied native service plan.`);
  }
}

function assertBackend(plan: NativeServicePlan, expected: "systemd" | "launchd"): void {
  if (plan.backend.kind !== expected) {
    throw new Error(`Cannot render ${expected} service from a ${plan.backend.kind} native service plan.`);
  }
}

function systemdDependencyLine(
  plan: NativeServicePlan,
  name: "After" | "Wants",
  ids: readonly NativeServiceId[],
): string {
  if (ids.length === 0) return "";
  const names = ids.map((id) => {
    const dependency = plan.services.find((service) => service.id === id);
    if (dependency === undefined) throw new Error(`Service ${id} is not present in the native service plan.`);
    return dependency.manager.systemdName;
  });
  return `${name}=${names.join(" ")}\n`;
}

function systemdEnvironmentLines(environment: Readonly<Record<string, string>>): string {
  return Object.entries(environment)
    .map(([key, value]) => `Environment="${systemdEscape(key)}=${systemdEscape(value)}"\n`)
    .join("");
}

function systemdServiceShellQuote(shell: NativeServiceShellName, value: string): string {
  return shellQuote(shell, value.replaceAll("%", "%%").replaceAll("$", "$$"));
}

function systemdQuotedValue(value: string): string {
  return `"${systemdEscape(value)}"`;
}

function systemdEscape(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function plistProgramArguments(arguments_: readonly string[]): string {
  return `  <key>ProgramArguments</key>\n  <array>\n${arguments_.map((argument) => `    <string>${xmlEscape(argument)}</string>`).join("\n")}\n  </array>\n`;
}

function plistEnvironment(environment: Readonly<Record<string, string>>): string {
  const entries = Object.entries(environment);
  if (entries.length === 0) return "";
  return `  <key>EnvironmentVariables</key>\n  <dict>\n${entries.map(([key, value]) => plistString(key, value, "    ")).join("")}  </dict>\n`;
}

function plistString(key: string, value: string, indent = "  "): string {
  return `${indent}<key>${xmlEscape(key)}</key>\n${indent}<string>${xmlEscape(value)}</string>\n`;
}

function shellQuote(shell: NativeServiceShellName, value: string): string {
  return shell === "fish"
    ? `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`
    : `'${value.replaceAll("'", "'\\''")}'`;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
