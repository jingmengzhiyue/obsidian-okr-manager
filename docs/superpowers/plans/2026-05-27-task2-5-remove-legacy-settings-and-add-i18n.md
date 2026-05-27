# Task2-5 Remove Legacy Settings And Add i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy `checkInsDir` setting and migrate the main UI, notices, and objective deadline strings onto a shared i18n layer with `en` and `zh-CN`, defaulting and falling back to `en`.

**Architecture:** Add a small translation module with locale normalization, message dictionaries, interpolation, and an overridable runtime locale. Thread the translator through the plugin manager and UI entry points, then replace hard-coded strings in settings, dashboard, detail renderer, modals, and status helpers with translation keys. Lock behavior with focused tests for locale fallback, translated deadline/status labels, and settings defaults.

**Tech Stack:** TypeScript, Obsidian plugin API, Node test runner via `node --import jiti/register --test`

---

### Task 1: Lock Legacy Settings And i18n Behavior With Tests

**Files:**
- Modify: `tests/okr-utils.test.mjs`

- [ ] **Step 1: Write failing tests for locale fallback and settings cleanup**

```javascript
test("resolveLocale falls back to en for unknown locales", () => {
  assert.equal(resolveLocale("fr-FR"), "en");
});

test("DEFAULT_SETTINGS no longer exposes checkInsDir", () => {
  assert.equal("checkInsDir" in DEFAULT_SETTINGS, false);
});

test("getObjectiveDeadlineState returns translated labels", () => {
  const state = getObjectiveDeadlineState(
    { id: "O1", title: "Launch", status: "active", due: "2026-05-29" },
    "2026-05-27",
    createI18n("en"),
  );
  assert.equal(state.label, "Due in 2 days");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL because `resolveLocale`/`createI18n` do not exist yet and `DEFAULT_SETTINGS` still includes `checkInsDir`.

### Task 2: Add Shared i18n Infrastructure

**Files:**
- Create: `src/i18n/index.ts`
- Modify: `src/types.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Implement locale normalization and dictionaries**

```typescript
export type SupportedLocale = "en" | "zh-CN";

export function resolveLocale(input?: string | null): SupportedLocale {
  if (!input) return "en";
  return input.toLowerCase() === "zh-cn" ? "zh-CN" : input.toLowerCase() === "en" ? "en" : "en";
}
```

- [ ] **Step 2: Remove `checkInsDir` from settings types/defaults and drop legacy merge**

```typescript
export interface OKRPluginSettings {
  rootDir: string;
  defaultPeriodType: OKRPeriodType;
  autoComputeProgress: boolean;
  showDashboardOnStartup: boolean;
}
```

- [ ] **Step 3: Detect locale on plugin load and expose translator**

```typescript
const locale = detectLocale(this.app);
this.i18n = createI18n(locale);
this.manager = new OKRManager(this.app, this.settings, this.i18n);
```

- [ ] **Step 4: Run tests to verify the shared i18n core works**

Run: `npm test`
Expected: PASS for locale fallback/default settings assertions, with UI migration tests still pending or not yet added.

### Task 3: Migrate Main UI Strings

**Files:**
- Modify: `src/settings/SettingsTab.ts`
- Modify: `src/views/DashboardView.ts`
- Modify: `src/views/OKRDetailRenderer.ts`
- Modify: `src/utils/objectiveStatus.ts`
- Modify: `src/modals/ConfirmModal.ts`
- Modify: `src/modals/CheckInModal.ts`
- Modify: `src/modals/NewObjectiveModal.ts`
- Modify: `src/modals/NewKRModal.ts`
- Modify: `src/modals/EditObjectiveModal.ts`
- Modify: `src/modals/EditKRModal.ts`
- Modify: `src/modals/PostponeObjectiveModal.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Inject the translator into status helpers and UI entry points**

```typescript
const deadlineState = getObjectiveDeadlineState(obj, undefined, this.manager.getI18n());
```

- [ ] **Step 2: Replace hard-coded labels, buttons, notices, and error strings with translation keys**

```typescript
text: this.t("dashboard.empty.description")
new Notice(this.t("notice.dashboardLoadFailedWithReason", { message: error.message }))
```

- [ ] **Step 3: Keep behavior unchanged apart from locale-sensitive text**

```typescript
menu.addItem((item) => item.setTitle(t("actions.editObjective")).onClick(...));
```

- [ ] **Step 4: Run tests to catch regressions after the migration**

Run: `npm test`
Expected: PASS for the existing utility tests plus the new translated deadline assertions.

### Task 4: Update Version Metadata And Final Verification

**Files:**
- Modify: `package.json`
- Modify: `manifest.json`
- Modify: `versions.json`

- [ ] **Step 1: Bump the plugin/package version consistently**

```json
{
  "version": "0.1.5"
}
```

- [ ] **Step 2: Run repository verification commands**

Run: `npm run build`
Expected: exit code 0

Run: `npm run lint`
Expected: exit code 0

Run: `npm test`
Expected: exit code 0

- [ ] **Step 3: Run editor diagnostics**

Run: VS Code diagnostics for recently edited files
Expected: no new actionable TypeScript or lint diagnostics
