# P0 Refresh And Scope Fixes Design

## Goal

Implement three P0 reliability fixes for the Obsidian OKR plugin:

- make inline detail actions rerender the current Markdown preview after successful mutations
- scope objective discovery to the configured OKR root and period directory instead of scanning the full vault
- reduce duplicate dashboard refreshes by keeping metadata and file events as the primary realtime refresh path

## Current Problems

### Inline detail actions

`OKRDetailRenderer` already rerenders the preview after KR move up and move down, but the other inline actions open modals or confirm flows without an equivalent success callback. As a result, the objective file changes on disk, yet the active Markdown preview may remain stale until Obsidian rerenders for some unrelated reason.

### Objective discovery scope

`OKRManager.getObjectiveFiles()` currently calls `vault.getFiles()` and filters by path prefix. This still performs a full-vault file enumeration and then narrows the result. The lookup should start from the configured OKR root and requested period directory so work scales with the target OKR directory instead of the whole vault.

### Duplicate dashboard refreshes

The plugin currently refreshes the dashboard from both modal `onComplete` callbacks and metadata or vault events. For create, edit, delete, postpone, and check-in operations this can lead to double renders in quick succession. The metadata and file events should remain the source of truth for realtime refreshes because they also capture changes made outside the dashboard UI.

## Chosen Approach

### 1. Add explicit detail-view success hooks

For inline detail actions in `OKRDetailRenderer`, pass an `onComplete` callback into modals or call a shared success helper from confirm handlers. The helper rerenders the active Markdown preview only when the active preview corresponds to the source objective file.

Covered actions:

- check-in
- edit key result
- delete key result
- add key result
- edit objective
- delete objective
- postpone objective

### 2. Replace full-vault file enumeration with directory walking

Add a directory-scoped objective file lookup in `OKRManager`:

- resolve the period folder under the configured OKR root
- if the folder does not exist, return an empty list
- recursively collect Markdown files only from that folder subtree

This preserves support for nested folders under a period while avoiding unrelated vault traversal.

### 3. Keep metadata and file events as the dashboard refresh backbone

Retain refresh calls in `main.ts` for:

- `metadataCache.changed`
- `vault.delete`
- `vault.rename`

Remove redundant dashboard refresh callbacks where the same file mutation already produces one of those events:

- plugin command callbacks in `main.ts` for new KR and check-in
- dashboard modal callbacks for check-in, edit KR, edit objective, add KR, postpone objective

Keep local dashboard refreshes where they are not duplicated by those modal callbacks or are tied to immediate optimistic UI behavior:

- manual period switching
- collapse or expand
- drag-and-drop reorder follow-up
- missing-file recovery
- delete confirmations that currently perform the refresh inline after the awaited mutation
- new objective modal entry points if needed for immediate visibility after navigation, though metadata events should still cover the durable refresh

## Testing Strategy

Add focused automated tests where practical:

- unit tests for new directory-scoped file collection in `OKRManager`
- unit tests for preview rerender guard logic extracted from `OKRDetailRenderer`
- unit tests for dashboard refresh deduplication behavior by checking which callbacks remain wired

Because the existing test harness is lightweight `node:test`, prefer small pure helpers over DOM-heavy integration tests.

## Risks And Mitigations

- Obsidian event timing may differ slightly between update and delete flows
  - Mitigation: keep file and metadata event refreshes in place and only remove callbacks that are clearly redundant
- Preview rerender can miss if the active view is not the same source file
  - Mitigation: preserve the existing source-path check and centralize it in one helper
- Period folders may contain nested non-Markdown files
  - Mitigation: recurse folders and filter strictly to `.md`
