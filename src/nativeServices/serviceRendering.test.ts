import { describe, expect, it } from "vitest";
import {
  createDevelopmentNativeServicePlan,
  type NativeServicePlan,
  type NativeServicePlanService,
} from "./servicePlan.js";
import { renderLaunchdPlist, renderSystemdUnit } from "./serviceRendering.js";

function developmentPlan(kind: "systemd" | "launchd"): NativeServicePlan {
  return createDevelopmentNativeServicePlan({
    backend: { kind, label: kind },
    shell: {
      name: "zsh",
      executable: "/bin/zsh",
      source: "detected",
      detectedExecutable: "/bin/zsh",
    },
    environment: { PI_WEB_CONFIG: "/home/user/config with \"quote\".json" },
    workingDirectory: "/checkout with space",
    packageJsonPath: "/checkout with space/package.json",
  });
}

function planService(plan: NativeServicePlan, index: number): NativeServicePlanService {
  const service = plan.services[index];
  if (service === undefined) throw new Error(`Missing service at index ${String(index)}`);
  return service;
}

describe("native service rendering", () => {
  it("renders systemd entirely from the canonical plan", () => {
    const plan = developmentPlan("systemd");
    const unit = renderSystemdUnit(plan, planService(plan, 1));

    expect(unit).toContain("Description=PI WEB UI dev server");
    expect(unit).toContain("After=pi-web-sessiond.service\nWants=pi-web-sessiond.service");
    expect(unit).toContain('WorkingDirectory="/checkout with space"');
    expect(unit).toContain('Environment="PI_WEB_CONFIG=/home/user/config with \\"quote\\".json"');
    expect(unit).toContain("ExecStart=/usr/bin/env /bin/zsh -lc 'exec /usr/bin/env bash -c '\\''trap");
    expect(unit).toContain("Restart=no");
  });

  it("renders launchd entirely from the canonical plan", () => {
    const plan = developmentPlan("launchd");
    const plist = renderLaunchdPlist(plan, planService(plan, 0), "/logs");

    expect(plist).toContain("<string>com.pi-web.sessiond</string>");
    expect(plist).toContain("<string>/bin/zsh</string>");
    expect(plist).toContain("<string>exec npm run start:sessiond</string>");
    expect(plist).toContain("<key>WorkingDirectory</key>\n  <string>/checkout with space</string>");
    expect(plist).toContain("<key>PI_WEB_CONFIG</key>\n    <string>/home/user/config with &quot;quote&quot;.json</string>");
    expect(plist).toContain("<string>/logs/sessiond.log</string>");
    expect(plist).not.toContain("<key>KeepAlive</key>");
  });

  it("rejects a service from a different plan", () => {
    const first = developmentPlan("systemd");
    const second = developmentPlan("systemd");
    expect(() => renderSystemdUnit(first, planService(second, 0))).toThrow("not a member");
  });
});
