# Relay status — issue-62-authstorage

## Current position
Relay planned and packet created. Assessment complete and committed
(`ASSESSMENT-issue-62.md`). No fix work has started. The worktree has **no
`node_modules` installed yet** — the first implementation leg must install deps
(pinned to Pi 0.80.8+) before anything typechecks.

## Leg tracking
- **Last completed leg:** 0 (planning — this packet + assessment).
- **Next leg to run:** 1.

## Next task
Run **charter slice 0 (Bootstrap)** as leg 1:
1. In the worktree (`/srv/dev/pi-web-issue-62`), install deps pinning the three
   `@earendil-works/*` packages to 0.80.8+ (0.80.8 or current 0.80.10):
   `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`,
   `@earendil-works/pi-agent-core`. Install in the worktree, **not `/tmp`**
   (`/tmp` has a disk-quota problem; see assessment §8).
2. Correct `package.json`: peerDependencies for the three packages
   `>=0.80.0 <1` → `>=0.80.8 <0.81`; devDependencies `^0.80.6` → `^0.80.8`.
3. Confirm the new export surface resolves (`readStoredCredential`,
   `ModelRuntime` present; `AuthStorage` gone) — e.g. a quick node/tsx check or
   just observe the typecheck errors now point at the migration sites.
4. Commit (e.g. `chore(deps): require pi 0.80.8+ and correct dep ranges (issue #62)`).
5. Update this `status.md` + append `log.md`, then hand off to leg 2 (charter
   slice 1: `authService.ts` core migration).

If slice 0 is already done when you arrive, apply the charter's task-selection
policy: pick the lowest-numbered incomplete slice (1 → 6).

## Relevant context for the next runner
- **Plan of record:** `ASSESSMENT-issue-62.md` (root) — read once. §5 has the
  per-file migration shape; §3 has the exact new API shapes; §6 the dep ranges.
- **Files to change** (all under `src/server/sessions/` unless noted):
  `authService.ts`, `authProviderOptions.ts`, `oauthLoginFlowService.ts`,
  `piSessionService.ts`, plus `src/server/sessiond.ts` (async auth
  construction), and the test/support files listed in assessment §2.
- **New API cheat-sheet:** `ModelRuntime.create({ authPath, modelsPath,
  credentials? }): Promise<ModelRuntime>`; credential persistence via the
  pi-ai `CredentialStore.modify` path; `runtime.login(providerId, type,
  AuthInteraction)`; `runtime.logout`; `runtime.getProviders()` /
  `listCredentials()` / `getProviderAuthStatus()`; `readStoredCredential(
  providerId, authPath?)` for the sync anthropic warning; pi-ai
  `InMemoryCredentialStore` for tests.
- **Decision already made:** clean migration, **no dual-version compat shim**
  (assessment §4/§5). Do not reopen this without the intervention signal.

## Progress documentation expectations
Every leg: update this `status.md` (current position, leg tracking, next task,
context, blockers), append a concise `log.md` entry, make work durable, and
commit before handing off. Hand off with `spawn_session` **once** per the
charter's Handover section.

## Blockers / intervention state
None currently. Known constraints:
- **Sessiond restart pending** once slices touching `sessiond.ts` / session
  runtime land — the human must manually restart the sessiond service; note it
  here when it applies.
- `/tmp` disk-quota issue observed during assessment — do dependency installs in
  the worktree.
