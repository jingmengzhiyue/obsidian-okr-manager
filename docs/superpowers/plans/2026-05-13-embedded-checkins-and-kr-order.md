# 嵌入式进度记录与 KR 排序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 KR 支持手动上下排序、同一天多次记录进度，并把进度历史嵌入 Objective 文件中，同时统一提示文案并同步插件版本号。

**Architecture:** 以 Objective 文件作为唯一数据源，在每个 KR 节点上新增排序字段与历史记录数组，移除对旧 `Check-ins` 独立文件的读取依赖。UI 层只负责触发排序与记录操作，数据层统一负责重排、历史追加、进度回写和缓存失效，以保持实时刷新和较低 I/O 成本。

**Tech Stack:** TypeScript、Obsidian Plugin API、YAML frontmatter、esbuild、ESLint

---

### Task 1: 重构数据模型为嵌入式历史记录

**Files:**
- Modify: `src/types.ts`
- Modify: `src/constants.ts`
- Modify: `src/manager/FileParser.ts`
- Modify: `src/manager/OKRManager.ts`

- [ ] **Step 1: 为 KR 与 Check-in 定义新结构**

```ts
export interface CheckIn {
	id: string;
	krId: string;
	date: string;
	progress: number;
	delta: number;
	note: string;
	blocker: string;
	recordedAt: string;
}

export interface KeyResult {
	// existing fields...
	order: number;
	checkIns: CheckIn[];
}
```

- [ ] **Step 2: 调整 frontmatter 读写**

```ts
[FRONTMATTER_KEY_RESULTS]: objective.keyResults.map((keyResult) => ({
	...this.serializeKeyResult(keyResult),
	order: keyResult.order,
	checkIns: keyResult.checkIns.map((checkIn) => this.serializeCheckIn(checkIn)),
}));
```

- [ ] **Step 3: 改写解析排序规则**

```ts
return value
	.map((item, index) => this.parseKeyResultEntry(item, context, index))
	.filter((item): item is KeyResult => item !== null)
	.sort((left, right) => left.order - right.order);
```

- [ ] **Step 4: 保证新建 KR 自动追加到末尾**

```ts
const nextOrder =
	existing.reduce((max, keyResult) => Math.max(max, keyResult.order), -1) + 1;
```

- [ ] **Step 5: 运行构建验证数据模型改造未破坏类型**

Run: `npm run build`
Expected: PASS with no TypeScript errors

### Task 2: 用嵌入式历史替换旧 Check-ins 记录流程

**Files:**
- Modify: `src/manager/OKRManager.ts`
- Modify: `src/modals/CheckInModal.ts`
- Modify: `src/views/OKRDetailRenderer.ts`

- [ ] **Step 1: 改写记录进度逻辑为追加数组**

```ts
const nextCheckIn: CheckIn = {
	id: `${params.krId}-${Date.now()}`,
	krId: params.krId,
	date: params.date,
	progress,
	delta,
	note: params.note.trim(),
	blocker: params.blocker.trim(),
	recordedAt: new Date().toISOString(),
};
```

- [ ] **Step 2: 同一天允许多次记录**

```ts
const updatedCheckIns = [...item.checkIns, nextCheckIn].sort(
	(left, right) => right.recordedAt.localeCompare(left.recordedAt),
);
```

- [ ] **Step 3: 移除对旧独立 Check-ins 文件的读取依赖**

```ts
async getCheckIns(krId: string): Promise<CheckIn[]> {
	const found = await this.findObjectiveEntryByKRId(krId);
	return found?.objective.keyResults.find((item) => item.id === krId)?.checkIns ?? [];
}
```

- [ ] **Step 4: 精简 CheckInModal 提交参数**

```ts
await this.manager.recordCheckIn({
	krId: this.krId,
	date: this.date,
	progress: this.progress,
	note: this.note,
	blocker: this.blocker,
});
```

- [ ] **Step 5: 运行构建验证记录链路**

Run: `npm run build`
Expected: PASS and no errors about `CheckIn` / `checkIns`

### Task 3: 增加 KR 上下排序能力

**Files:**
- Modify: `src/manager/OKRManager.ts`
- Modify: `src/views/DashboardView.ts`
- Modify: `src/views/OKRDetailRenderer.ts`
- Modify: `styles.css`

- [ ] **Step 1: 在 Manager 中增加重排方法**

```ts
async moveKeyResult(krId: string, period: string, direction: "up" | "down"): Promise<void> {
	// swap adjacent order values within the same objective
}
```

- [ ] **Step 2: 在 Dashboard 的 KR 行中加上移/下移按钮**

```ts
const moveUpButton = right.createEl("button", { cls: "okr-row-action-btn", text: "上移" });
const moveDownButton = right.createEl("button", { cls: "okr-row-action-btn", text: "下移" });
```

- [ ] **Step 3: 在详情页 KR 表格中加上移/下移按钮**

```ts
buttonsCell.createEl("button", {
	cls: "okr-btn-secondary okr-inline-move-up-btn",
	text: "上移",
});
```

- [ ] **Step 4: 操作完成后触发当前视图刷新**

```ts
await manager.moveKeyResult(krId, period, "up");
new Notice("已上移关键结果");
```

- [ ] **Step 5: 运行 lint 验证按钮与事件绑定**

Run: `npm run lint`
Expected: PASS

### Task 4: 统一提示文案并去除旧接口残留

**Files:**
- Modify: `src/modals/CheckInModal.ts`
- Modify: `src/views/DashboardView.ts`
- Modify: `src/views/OKRDetailRenderer.ts`
- Modify: `src/settings/SettingsTab.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: 统一界面提示为中文**

```ts
new Notice(`已记录进度：${this.krId} ${this.progress}%`);
new Notice(`记录进度失败：${message}`);
```

- [ ] **Step 2: 调整设置页文案，弱化旧 Check-ins 目录概念**

```ts
name: "进度记录目录（已弃用）"
desc: "旧独立进度记录目录，当前版本不再写入新文件。"
```

- [ ] **Step 3: 移除或停用旧 Check-ins 目录相关读取入口**

```ts
// keep setting for backward safety but do not read legacy standalone files
return [];
```

- [ ] **Step 4: 同步版本号**

```json
"version": "0.1.2"
```

- [ ] **Step 5: 运行构建并确认版本文件一致**

Run: `npm run build`
Expected: PASS and `manifest.json` / `package.json` / `versions.json` stay aligned

### Task 5: 回归验证

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`
- Modify: `versions.json`

- [ ] **Step 1: 验证新建 KR 后顺序稳定**

Run: `npm run build`
Expected: PASS and no ordering-related errors

- [ ] **Step 2: 验证同一天多次记录不会报错**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: 验证实时刷新链路**

Run: `npm run build`
Expected: PASS and no TypeScript errors around dashboard refresh handlers

- [ ] **Step 4: 检查编辑文件诊断**

Run: VS Code diagnostics on modified files
Expected: 0 diagnostics

- [ ] **Step 5: 准备提交**

```bash
git add src/types.ts src/constants.ts src/manager/FileParser.ts src/manager/OKRManager.ts src/modals/CheckInModal.ts src/views/DashboardView.ts src/views/OKRDetailRenderer.ts src/settings/SettingsTab.ts styles.css manifest.json package.json versions.json
git commit -m "feat: embed check-ins and add kr ordering"
```
