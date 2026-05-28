# P0 Refresh And Scope Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix stale detail previews, constrain objective discovery to the configured OKR directory, and remove redundant dashboard refreshes without losing realtime updates.

**Architecture:** Keep realtime dashboard updates event-driven from `main.ts`, add explicit preview rerender hooks only for inline detail actions, and replace full-vault file enumeration in `OKRManager` with recursive lookup starting from the requested period folder. Add narrow unit tests around the new pure helpers so the current lightweight test harness can validate the behavior.

**Tech Stack:** TypeScript, Obsidian plugin API, node:test, ESLint, TypeScript compiler

---

### Task 1: Add failing tests for scoped lookup and preview rerender guards

**Files:**
- Modify: `tests/okr-utils.test.mjs`
- Test: `tests/okr-utils.test.mjs`

- [ ] **Step 1: Write the failing tests**

```javascript
test("collectMarkdownFilesFromTree only returns markdown files under the requested subtree", async () => {
  const managerModule = await import("../src/manager/OKRManager.ts");
  const { collectMarkdownFilesFromTree } = managerModule.default ?? managerModule;

  const tree = {
    children: [
      {
        path: "OKR/2026-Q2/O1.md",
        extension: "md",
        children: undefined,
      },
      {
        path: "OKR/2026-Q2/archive",
        children: [
          { path: "OKR/2026-Q2/archive/O2.md", extension: "md" },
          { path: "OKR/2026-Q2/archive/notes.txt", extension: "txt" },
        ],
      },
    ],
  };

  assert.deepEqual(
    collectMarkdownFilesFromTree(tree).map((file) => file.path),
    ["OKR/2026-Q2/O1.md", "OKR/2026-Q2/archive/O2.md"],
  );
});

test("shouldRerenderMarkdownPreview only rerenders the active source file", async () => {
  const detailModule = await import("../src/views/OKRDetailRenderer.ts");
  const { shouldRerenderMarkdownPreview } = detailModule.default ?? detailModule;

  assert.equal(
    shouldRerenderMarkdownPreview("OKR/2026-Q2/O1.md", "OKR/2026-Q2/O1.md"),
    true,
  );
  assert.equal(
    shouldRerenderMarkdownPreview("OKR/2026-Q2/O1.md", "OKR/2026-Q2/O2.md"),
    false,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with missing exports for `collectMarkdownFilesFromTree` and `shouldRerenderMarkdownPreview`

- [ ] **Step 3: Write minimal implementation hooks**

```typescript
export function collectMarkdownFilesFromTree(root: TFolder): TFile[] {
  // recurse through folder children and keep markdown files
}

export function shouldRerenderMarkdownPreview(
  activeFilePath: string | null,
  sourcePath: string,
): boolean {
  return activeFilePath === normalizePath(sourcePath);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS for the new cases

- [ ] **Step 5: Commit**

```bash
git add tests/okr-utils.test.mjs src/manager/OKRManager.ts src/views/OKRDetailRenderer.ts
git commit -m "test: cover scoped lookup and preview rerender guards"
```

### Task 2: Implement scoped objective file lookup in the manager

**Files:**
- Modify: `src/manager/OKRManager.ts`
- Test: `tests/okr-utils.test.mjs`

- [ ] **Step 1: Implement recursive period-folder lookup**

```typescript
private getObjectiveFiles(period: string): TFile[] {
  const periodFolder = this.app.vault.getAbstractFileByPath(this.getPeriodDir(period));
  if (!(periodFolder instanceof TFolder)) {
    return [];
  }

  return collectMarkdownFilesFromTree(periodFolder);
}
```

- [ ] **Step 2: Keep the helper narrow and reusable**

```typescript
export function collectMarkdownFilesFromTree(root: TFolder): TFile[] {
  const files: TFile[] = [];

  for (const child of root.children) {
    if (child instanceof TFile && child.extension === "md") {
      files.push(child);
      continue;
    }
    if (child instanceof TFolder) {
      files.push(...collectMarkdownFilesFromTree(child));
    }
  }

  return files;
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS and no regressions in existing utility tests

- [ ] **Step 4: Commit**

```bash
git add src/manager/OKRManager.ts tests/okr-utils.test.mjs
git commit -m "fix: scope objective discovery to period directory"
```

### Task 3: Rerender detail preview after successful inline actions

**Files:**
- Modify: `src/views/OKRDetailRenderer.ts`
- Modify: `src/modals/CheckInModal.ts`
- Modify: `src/modals/EditKRModal.ts`
- Modify: `src/modals/EditObjectiveModal.ts`
- Modify: `src/modals/NewKRModal.ts`
- Modify: `src/modals/PostponeObjectiveModal.ts`
- Test: `tests/okr-utils.test.mjs`

- [ ] **Step 1: Thread success callbacks into inline actions**

```typescript
const onDetailMutationComplete = () => {
  void this.refreshPreview(manager, ctx.sourcePath);
};

new CheckInModal(manager.getApp(), manager, {
  prefillKrId: krId,
  onComplete: onDetailMutationComplete,
}).open();
```

- [ ] **Step 2: Apply the same callback to edit, add, postpone, and delete flows**

```typescript
new EditKRModal(manager.getApp(), manager, keyResult, {
  onComplete: onDetailMutationComplete,
}).open();

await manager.deleteKeyResult(krId, period);
await this.refreshPreview(manager, ctx.sourcePath);
```

- [ ] **Step 3: Keep rerender logic guarded**

```typescript
export function shouldRerenderMarkdownPreview(
  activeFilePath: string | null,
  sourcePath: string,
): boolean {
  return activeFilePath !== null && normalizePath(activeFilePath) === normalizePath(sourcePath);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS including preview guard tests

- [ ] **Step 5: Commit**

```bash
git add src/views/OKRDetailRenderer.ts src/modals/CheckInModal.ts src/modals/EditKRModal.ts src/modals/EditObjectiveModal.ts src/modals/NewKRModal.ts src/modals/PostponeObjectiveModal.ts tests/okr-utils.test.mjs
git commit -m "fix: rerender detail preview after inline mutations"
```

### Task 4: Remove redundant dashboard refresh callbacks while keeping realtime events

**Files:**
- Modify: `src/main.ts`
- Modify: `src/views/DashboardView.ts`

- [ ] **Step 1: Remove redundant plugin command refresh callbacks**

```typescript
callback: () =>
  new NewKRModal(this.app, this.manager).open(),

callback: () =>
  new CheckInModal(this.app, this.manager).open(),
```

- [ ] **Step 2: Remove safe redundant dashboard modal callbacks**

```typescript
new CheckInModal(this.app, this.manager, {
  prefillKrId: kr.id,
}).open();

new EditKRModal(this.app, this.manager, kr).open();
```

- [ ] **Step 3: Preserve immediate refreshes that are not redundant**

```typescript
this.scheduleRender();
```

for delete confirmation success handlers, reorder success handlers, and explicit local UI state changes.

- [ ] **Step 4: Run tests and lint**

Run: `npm test`
Expected: PASS

Run: `npm run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/views/DashboardView.ts
git commit -m "fix: dedupe dashboard refresh triggers"
```

### Task 5: Update docs, versions, and perform full verification

**Files:**
- Modify: `README.md`
- Modify: `manifest.json`
- Modify: `package.json`
- Modify: `versions.json`

- [ ] **Step 1: Update roadmap to reflect completed P0 fixes**

```markdown
- [x] Refresh the current Markdown preview immediately after inline actions such as check-in, edit, delete, add key result, and postpone due date
- [x] Reduce duplicate dashboard refreshes triggered by both modal callbacks and vault metadata events
- [x] Replace full-vault objective discovery with directory-scoped lookup under the configured OKR root
```

- [ ] **Step 2: Bump release metadata to 1.0.0**

```json
{
  "version": "1.0.0"
}
```

and add:

```json
{
  "1.0.0": "1.4.4"
}
```

- [ ] **Step 3: Run full verification**

Run: `npm run build`
Expected: PASS

Run: `npm run lint`
Expected: PASS

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Run diagnostics**

Use editor diagnostics on each modified TypeScript file and resolve any introduced issues.

- [ ] **Step 5: Commit**

```bash
git add README.md manifest.json package.json versions.json
git commit -m "chore: release 1.0.0 with p0 reliability fixes"
```
