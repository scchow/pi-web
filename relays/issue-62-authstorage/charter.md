# Relay charter — issue-62-authstorage

## Relay identity
- **Name:** `issue-62-authstorage`
- **Root path:** `relays/issue-62-authstorage/` (in the repo, on branch
  `fix/issue-62-authstorage`, worktree `/srv/dev/pi-web-issue-62`)
- **Packet files:** `charter.md`, `status.md`, `log.md` (this directory).

## Background (read once, do not re-derive)
The full technical assessment lives at the worktree root:
`ASSESSMENT-issue-62.md`. Read it once at the start of your leg for the API
migration details; do not re-investigate the SDK from scratch. Short version:
Pi `@earendil-works/pi-coding-agent` 0.80.8 removed the `AuthStorage` export and
replaced the auth/model plumbing with an async `ModelRuntime` + pi-ai
`CredentialStore` model. Pi Web imports `AuthStorage` statically and crashes at
module load with any Pi 0.80.8+. The agreed fix is a **clean migration to the
new `ModelRuntime` API** (no dual-version shim) plus dependency-range
correction, tests, and a changeset. Rationale and the per-file migration shape
are in `ASSESSMENT-issue-62.md` §5.

## Goal / finish line
Pi Web builds, typechecks, lints, and passes its full test suite against Pi
`@earendil-works/pi-coding-agent` **0.80.8+** (target the installed 0.80.8/0.80.10
line), with:
1. No remaining import or use of the removed `AuthStorage` export (and no
   reliance on `ModelRegistry.create(authStorage)` / `.inMemory(authStorage)` /
   `modelRegistry.authStorage`).
2. Auth, OAuth login, API-key save/logout, provider enumeration, and the
   Anthropic subscription warning all working through the new `ModelRuntime` /
   `readStoredCredential` / pi-ai `CredentialStore` APIs.
3. `package.json` peerDependencies and devDependencies for the three
   `@earendil-works/*` packages corrected so npm cannot resolve an unsupported
   release (target range `>=0.80.8 <0.81`; devDeps on a matching `^0.80.8`).
4. A `.changeset/*.md` fragment describing the user-visible fix (no direct
   `CHANGELOG.md` edit).
5. `npm run verify` (typecheck + lint + knip + test) passing.

Finish line reached = all of the above true and committed on the branch. **Do
not open a PR** (out of scope for this relay).

## Sizing — one leg
One leg = **one coherent slice** from the plan below that leaves the tree in a
committed, describable state. Prefer the pre-broken-out slices in `status.md`.
A leg does not have to leave `npm run verify` fully green (the migration is
interdependent), but it MUST:
- leave a clear, honest `status.md` describing what compiles/what doesn't yet,
- commit its work with a clear message,
- not expand scope beyond its slice ("just a bit more" is the main failure mode
  here — the auth surfaces are interconnected; resist rewriting everything in
  one leg).

If a slice turns out bigger than expected, split it and hand off mid-plan with
an updated `status.md` — that is expected and fine.

## Suggested slice breakdown (task selection default)
Follow `status.md`'s named next task. If none is named, pick the lowest-numbered
incomplete slice here:

0. **Bootstrap:** `npm install` in the worktree pinning the three `@earendil-works/*`
   packages to 0.80.8+ (e.g. `npm i -D @earendil-works/pi-coding-agent@0.80.8
   @earendil-works/pi-ai@0.80.8 @earendil-works/pi-agent-core@0.80.8`), and
   correct the peerDependencies range to `>=0.80.8 <0.81`. Confirm the crash
   reproduces / the new exports resolve. Commit. (Install in the worktree, NOT
   `/tmp` — `/tmp` has a disk quota problem, see assessment §8.)
1. **`authService.ts` core migration:** move to `ModelRuntime` (async
   construction via `ModelRuntime.create({ authPath, modelsPath })`), migrate
   saveApiKey/logout/refresh/credential access. Propagate async construction to
   `sessiond.ts`. (Session-daemon path — see restart note.)
2. **`authProviderOptions.ts` migration:** rederive login/logout provider
   options from `runtime.getProviders()` + `listCredentials()` /
   `getProviderAuthStatus()`; update its structural interface + test double.
3. **`oauthLoginFlowService.ts` migration:** reimplement against pi-ai
   `AuthInteraction` (`prompt`/`notify`) instead of `OAuthLoginCallbacks`; wire
   `runtime.login(providerId, "oauth", interaction)`. (Riskiest slice — verify
   prompt/select/device-code/auth_url mapping.)
4. **`piSessionService.ts` migration:** pass `modelRuntime` to
   `createAgentSessionServices`; update `PiAgentSession` type; switch
   `anthropicSubscriptionWarning` to `readStoredCredential`.
5. **Tests + testSupport:** migrate all test doubles to `InMemoryCredentialStore`
   + `ModelRuntime.create`; get `npm run verify` green. Follow the testing-guide
   skill.
6. **Changeset + final verify + cleanup:** add `.changeset/*.md`; run full
   `npm run verify`; remove scratch (`ASSESSMENT` stays, `/srv/dev/pi-inspect`
   is outside the repo). Confirm goal, hand off to a final confirmation/stop.

Slices may merge or split. 1–4 depend on 0. Slice 5 finalizes; slice 6 closes.

## Handover
When handing off, `spawn_session` **once** with a prompt whose first line is:
`Relay "issue-62-authstorage" leg <N> begins now.` followed by the standard
Relay handoff body pointing at:
- `relays/issue-62-authstorage/charter.md`
- `relays/issue-62-authstorage/status.md`

Tell the next runner not to read `log.md` end-to-end. Make all work durable
(update `status.md`, append `log.md`, commit) **before** spawning.

## Intervention signal — stop and get the human when:
- The new SDK API does not actually provide an operation the migration needs
  (e.g. no viable credential persistence path for API-key save), i.e. the
  assessment's assumed mapping is wrong.
- A slice would require changing the charter's goal or the agreed "clean
  migration, no shim" decision.
- `npm install` / registry access fails and cannot be resolved in-leg.
- Charter churn: if you find yourself needing to edit this charter to proceed,
  stop and involve the human instead.
To raise it: set a clear `## BLOCKED` section at the top of `status.md`, append a
`log.md` entry explaining the blocker and what decision is needed, do **not**
spawn the next leg, and end your run.

## Reading discipline
Read, in order: this `charter.md`, then `status.md`, then `ASSESSMENT-issue-62.md`
(once), then only the specific `src/server/sessions/*` files your slice touches.
Do **not** read `log.md` end-to-end — only targeted entries if `status.md` points
you there. Do not re-extract SDK tarballs unless the assessment is contradicted
by reality.

## Standing constraints (project conventions)
- Session-daemon changes (`sessiond.ts`, session runtime / auth construction
  loaded by the daemon) require the human to **manually restart the sessiond
  service** to take effect. Call this out in `status.md`/handoff whenever a leg
  changes that path so the human knows a restart is pending.
- Follow the skills: `code-quality-architecture` (DI, async boundaries,
  testable seams), `testing-guide` (test layers, no over-mocking), and
  `changeset-changelog` (changeset not CHANGELOG edit).
- Keep changes scoped to the fix; do not opportunistically refactor unrelated
  code.
