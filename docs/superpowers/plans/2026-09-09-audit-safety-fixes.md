# Audit Safety Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Verify and fix the nine P0/P1 findings from the September audit on a local 1.4.1 branch, without pushing or releasing.

**Architecture:** Keep Markdown/YAML as the source of truth. Reject incomplete parsing before writes, preserve unknown properties, merge edits against their original values inside `vault.process`, and use business dates and actual measurements for check-in/rollover decisions. Retain existing public calls through optional baseline arguments and preserve old files.

**Tech Stack:** TypeScript, Obsidian API, Node test runner, esbuild, existing js-yaml test dependency (via the installed dependency tree).

## 1. Reproduce and protect persistence

Files: `src/manager/FileParser.ts`, `src/manager/OKRManager.ts`, `tests/okr-parser-safety.test.mjs`, integration test support.

- [x] Reproduce unknown properties disappearing, malformed KR data defaulting to empty/zero, and a `*` check-in bullet disappearing on save.
- [x] Preserve existing Objective and KR properties by ID; retain existing tags and supply defaults only when absent. Remove only obsolete legacy `checkIns` after successful migration.
- [x] Accept supported list markers; reject malformed managed records and malformed numeric fields with the source path before changing the file.
- [x] Verify read → mutate → serialize → read using a real YAML parser and an in-memory Vault.

## 2. Protect edits from stale forms

Files: edit/postpone/review modals, `src/utils/editConflict.ts`, both manager/review persistence paths, regression tests.

- [x] Reproduce a title-only stale KR save reverting a later check-in, and independent review section edits overwriting each other.
- [x] Pass the original form values as a baseline. Preserve unchanged fields from the latest file and reject conflicting changes before writing.
- [x] Parse the latest review within `vault.process`; preserve its snapshot and custom Markdown.
- [x] Replace managed review blocks with `body.replace(pattern, () => replacement)` so dollar sequences are literal.
- [x] Verify independent edits merge, conflicting edits leave bytes unchanged, and numeric field dependencies are protected.

## 3. Correct rollover decisions

Files: `src/utils/period.ts`, `src/modals/ClosePeriodModal.ts`, lifecycle methods in `src/manager/OKRManager.ts`, period tests.

- [x] Reproduce form redraw losing selection display, rounded 100% excluding unfinished measurements, partial rollover excluding remaining KRs, and deleted IDs colliding with historic mappings.
- [x] Restore checkbox state from selection sets, use actual numeric completion in automatic mode, and exclude only already-rolled KRs.
- [x] Reserve historically referenced IDs when allocating Objective numbers, without changing existing IDs or links.
- [x] Verify reopen/partial rollover, manual progress mode, and existing rollback/read-only behavior.

## 4. Correct historical check-ins

Files: check-in mutation in `src/manager/OKRManager.ts`, regression tests.

- [x] Reproduce an older business-date check-in replacing newer progress.
- [x] Keep current value/progress/blocker unchanged for historical inserts. Recompute deltas in business-date order; same-date submissions retain insertion ordering.
- [x] Verify first record, backfill, same-date updates, and unchanged Markdown round trips.

## 5. Validate and increment the local version

Files: `package.json`, lockfile, `manifest.json`, `versions.json`, README version references, `docs/releases/1.4.1.md`.

- [x] Reproduce each audited defect before fixing it; rerun targeted regressions after fixes. Additional compatibility checks were added after implementation.
- [x] Run `npm test`, `npx tsc --noEmit --skipLibCheck`, `npm run lint`, and `npm run build`.
- [x] Inspect the complete diff for unrelated edits, data-loss regressions, stale cache assumptions, and compatibility with old files.
- [x] Set the patch version to 1.4.1 consistently and document changed behavior and verification limits.
- [x] Leave all work on the local branch; do not push, tag, or publish.

## Completion evidence — 2026-09-10

- Branch: `codex/fix-audit-p0-p1-1.4.1`; version 1.4.1 across package, lockfile, manifest, and compatibility map. No commit, push, tag, or publication.
- Full suite: 113/113 passing. TypeScript checking, ESLint, production build, and `git diff --check` passed.
- Integration tests execute the actual Manager, repositories and edit modals using a test Vault/DOM adapter; they do not simulate real Obsidian event timing or multi-device synchronization.
- Final review reproduced two additional boundary failures before correcting them: rolled-back files remaining in caches, and legacy history producing unreadable Markdown during migration. Their new regressions failed before the changes and passed afterward.
- Existing CRLF fixtures now use valid empty managed content; conflicting duplicate records are explicitly rejected instead of silently replacing earlier records. Isolated lifecycle unit tests mock historical ID lookup; persistence tests exercise the real lookup across restarts and snapshots.
- `js-yaml` is declared directly for the test adapter, using the version already present in the lockfile. No production dependency was added.
- P2 feature suggestions and unrelated product changes were excluded. Actual desktop/mobile acceptance testing remains outstanding.
