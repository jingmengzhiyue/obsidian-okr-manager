import test from "node:test";
import assert from "node:assert/strict";

const sortModule = await import("../src/utils/sort.ts");
const objectiveStatusModule = await import("../src/utils/objectiveStatus.ts");
const i18nModule = await import("../src/i18n/index.ts");
const typesModule = await import("../src/types.ts");
const managerModule = await import("../src/manager/OKRManager.ts");
let fileTreeModule;
let previewRefreshModule;
let workspaceCompatModule;
let documentCompatModule;

try {
	fileTreeModule = await import("../src/utils/fileTree.ts");
} catch {
	fileTreeModule = {};
}

try {
	previewRefreshModule = await import("../src/utils/previewRefresh.ts");
} catch {
	previewRefreshModule = {};
}

try {
	workspaceCompatModule = await import("../src/utils/workspace.ts");
} catch {
	workspaceCompatModule = {};
}

try {
	documentCompatModule = await import("../src/utils/document.ts");
} catch {
	documentCompatModule = {};
}

const { normalizeKeyResultOrders, reorderKeyResultOrders } =
	sortModule.default ?? sortModule;
const { getObjectiveDeadlineState } =
	objectiveStatusModule.default ?? objectiveStatusModule;
const { createI18n, resolveLocale } = i18nModule.default ?? i18nModule;
const { DEFAULT_SETTINGS } = typesModule.default ?? typesModule;
const { OKRManager } = managerModule.default ?? managerModule;
const { collectMarkdownFilesFromTree } =
	fileTreeModule.default ?? fileTreeModule;
const { shouldRefreshActivePreview } =
	previewRefreshModule.default ?? previewRefreshModule;
const { revealLeafCompat } =
	workspaceCompatModule.default ?? workspaceCompatModule;
const { getElementDocument, isActiveElement } =
	documentCompatModule.default ?? documentCompatModule;

test("normalizeKeyResultOrders falls back to KR id when order values collide", () => {
	const items = [
		{ id: "O1-KR2", order: 0, title: "KR 2" },
		{ id: "O1-KR1", order: 0, title: "KR 1" },
		{ id: "O1-KR3", order: 2, title: "KR 3" },
	];

	const normalized = normalizeKeyResultOrders(items);

	assert.deepEqual(
		normalized.map((item) => item.id),
		["O1-KR1", "O1-KR2", "O1-KR3"],
	);
	assert.deepEqual(
		normalized.map((item) => item.order),
		[0, 1, 2],
	);
});

test("reorderKeyResultOrders moves a KR to the requested index and rewrites order", () => {
	const items = [
		{ id: "O1-KR1", order: 0 },
		{ id: "O1-KR2", order: 1 },
		{ id: "O1-KR3", order: 2 },
	];

	const reordered = reorderKeyResultOrders(items, 0, 2);

	assert.deepEqual(
		reordered.map((item) => item.id),
		["O1-KR2", "O1-KR3", "O1-KR1"],
	);
	assert.deepEqual(
		reordered.map((item) => item.order),
		[0, 1, 2],
	);
});

test("getObjectiveDeadlineState marks incomplete objectives as overdue", () => {
	const state = getObjectiveDeadlineState(
		{
			id: "O1",
			title: "Ship dashboard drag-and-drop",
			status: "active",
			due: "2026-05-20",
		},
		"2026-05-27",
		createI18n("zh-CN"),
	);

	assert.equal(state.tone, "overdue");
	assert.equal(state.showPostponeAction, true);
	assert.match(state.label, /已超期 7 天/);
});

test("getObjectiveDeadlineState suppresses overdue reminders for completed objectives", () => {
	const state = getObjectiveDeadlineState(
		{
			id: "O2",
			title: "Close launch checklist",
			status: "completed",
			due: "2026-05-20",
		},
		"2026-05-27",
		createI18n("zh-CN"),
	);

	assert.equal(state.tone, "normal");
	assert.equal(state.showPostponeAction, false);
	assert.equal(state.label, "截止 2026-05-20");
});

test("getObjectiveDeadlineState exposes due-soon objectives as postponable", () => {
	const state = getObjectiveDeadlineState(
		{
			id: "O3",
			title: "Finalize beta rollout",
			status: "active",
			due: "2026-05-29",
		},
		"2026-05-27",
		createI18n("zh-CN"),
	);

	assert.equal(state.tone, "due-soon");
	assert.equal(state.showPostponeAction, true);
	assert.equal(state.label, "2 天后截止");
});

test("resolveLocale supports en and zh-CN and falls back to en", () => {
	assert.equal(resolveLocale(undefined), "en");
	assert.equal(resolveLocale("en"), "en");
	assert.equal(resolveLocale("zh-CN"), "zh-CN");
	assert.equal(resolveLocale("zh-cn"), "zh-CN");
	assert.equal(resolveLocale("fr-FR"), "en");
});

test("DEFAULT_SETTINGS no longer contains the legacy checkInsDir field", () => {
	assert.equal("checkInsDir" in DEFAULT_SETTINGS, false);
});

test("collectMarkdownFilesFromTree only returns markdown files in the requested subtree", () => {
	assert.equal(typeof collectMarkdownFilesFromTree, "function");

	const files = collectMarkdownFilesFromTree({
		children: [
			{ path: "OKR/2026-Q2/O1.md", extension: "md" },
			{ path: "OKR/2026-Q2/notes.txt", extension: "txt" },
			{
				path: "OKR/2026-Q2/archive",
				children: [
					{ path: "OKR/2026-Q2/archive/O2.md", extension: "md" },
					{ path: "OKR/2026-Q2/archive/README.md", extension: "md" },
				],
			},
		],
	});

	assert.deepEqual(
		files.map((file) => file.path),
		[
			"OKR/2026-Q2/O1.md",
			"OKR/2026-Q2/archive/O2.md",
			"OKR/2026-Q2/archive/README.md",
		],
	);
});

test("shouldRefreshActivePreview only refreshes when active file matches the source path", () => {
	assert.equal(typeof shouldRefreshActivePreview, "function");
	assert.equal(
		shouldRefreshActivePreview("OKR/2026-Q2/O1.md", "OKR/2026-Q2/O1.md"),
		true,
	);
	assert.equal(
		shouldRefreshActivePreview("OKR/2026-Q2/O1.md", "OKR/2026-Q2/O2.md"),
		false,
	);
	assert.equal(shouldRefreshActivePreview(null, "OKR/2026-Q2/O1.md"), false);
});

test("getObjectiveDeadlineState returns English labels when locale is en", () => {
	const state = getObjectiveDeadlineState(
		{
			id: "O4",
			title: "Ship localization",
			status: "active",
			due: "2026-05-29",
		},
		"2026-05-27",
		createI18n("en"),
	);

	assert.equal(state.tone, "due-soon");
	assert.equal(state.label, "Due in 2 days");
	assert.equal(state.helpText, "Due date 2026-05-29");
});

test("revealLeafCompat prefers revealLeaf when available", async () => {
	assert.equal(typeof revealLeafCompat, "function");

	const calls = [];
	const leaf = { id: "dashboard" };
	const workspace = {
		async revealLeaf(target) {
			calls.push(["revealLeaf", target]);
		},
		setActiveLeaf(target, params) {
			calls.push(["setActiveLeaf", target, params]);
		},
	};

	await revealLeafCompat(workspace, leaf);

	assert.deepEqual(calls, [["revealLeaf", leaf]]);
});

test("revealLeafCompat falls back to setActiveLeaf for older workspaces", async () => {
	assert.equal(typeof revealLeafCompat, "function");

	const calls = [];
	const leaf = { id: "dashboard" };
	const workspace = {
		setActiveLeaf(target, params) {
			calls.push(["setActiveLeaf", target, params]);
		},
	};

	await revealLeafCompat(workspace, leaf);

	assert.deepEqual(calls, [["setActiveLeaf", leaf, { focus: true }]]);
});

test("getElementDocument and isActiveElement use the element document context", () => {
	assert.equal(typeof getElementDocument, "function");
	assert.equal(typeof isActiveElement, "function");

	const docA = { activeElement: null, name: "A" };
	const docB = { activeElement: null, name: "B" };
	const inputA = { doc: docA, id: "input-a" };
	const inputB = { doc: docB, id: "input-b" };
	docA.activeElement = inputA;
	docB.activeElement = inputB;

	assert.equal(getElementDocument(inputA), docA);
	assert.equal(getElementDocument({ doc: docB }, docA), docB);
	assert.equal(getElementDocument(undefined, docA), docA);
	assert.equal(isActiveElement(inputA), true);
	assert.equal(isActiveElement(inputB), true);
	assert.equal(isActiveElement(inputA, docB), false);
});

test("recordCheckIn locates duplicate KR ids within the selected period", async () => {
	const manager = new OKRManager({}, DEFAULT_SETTINGS, createI18n("en"));
	let receivedPeriod;
	manager.findObjectiveEntryByKRId = async (_krId, period) => {
		receivedPeriod = period;
		if (period !== "2026-Q2") {
			return null;
		}

		return {
			file: { path: "OKR/2026-Q2/O1.md" },
			objective: {
				id: "O1",
				period: "2026-Q2",
				periodType: "quarter",
				title: "Q2 objective",
				description: "",
				owner: "Team",
				status: "active",
				progress: 20,
				created: "2026-04-01",
				due: "2026-06-30",
				filePath: "OKR/2026-Q2/O1.md",
				keyResults: [
					{
						id: "O1-KR1",
						objectiveId: "O1",
						period: "2026-Q2",
						periodType: "quarter",
						order: 0,
						title: "Q2 KR",
						description: "",
						owner: "Team",
						unit: "number",
						current: 2,
						target: 10,
						progress: 20,
						status: "active",
						confidence: "medium",
						created: "2026-04-01",
						due: "2026-06-30",
						filePath: "OKR/2026-Q2/O1.md",
						checkIns: [],
					},
				],
			},
		};
	};
	manager.writeObjective = async () => {};

	await manager.recordCheckIn({
		krId: "O1-KR1",
		period: "2026-Q2",
		date: "2026-05-01",
		progress: 25,
		note: "",
		blocker: "",
	});

	assert.equal(receivedPeriod, "2026-Q2");
});

test("recordCheckIn preserves the exact current value entered by the user", async () => {
	const manager = new OKRManager({}, DEFAULT_SETTINGS, createI18n("en"));
	let writtenObjective;
	manager.findObjectiveEntryByKRId = async () => ({
		file: { path: "OKR/2026-Q2/O1.md" },
		objective: {
			id: "O1",
			period: "2026-Q2",
			periodType: "quarter",
			title: "Q2 objective",
			description: "",
			owner: "Team",
			status: "active",
			progress: 20,
			created: "2026-04-01",
			due: "2026-06-30",
			filePath: "OKR/2026-Q2/O1.md",
			keyResults: [
				{
					id: "O1-KR1",
					objectiveId: "O1",
					period: "2026-Q2",
					periodType: "quarter",
					order: 0,
					title: "Q2 KR",
					description: "",
					owner: "Team",
					unit: "number",
					current: 2,
					target: 10,
					progress: 20,
					status: "active",
					confidence: "medium",
					created: "2026-04-01",
					due: "2026-06-30",
					filePath: "OKR/2026-Q2/O1.md",
					checkIns: [],
				},
			],
		},
	});
	manager.writeObjective = async (_file, objective) => {
		writtenObjective = objective;
	};

	await manager.recordCheckIn({
		krId: "O1-KR1",
		period: "2026-Q2",
		date: "2026-05-01",
		current: 2.5,
		progress: 25,
		note: "",
		blocker: "",
	});

	assert.equal(writtenObjective.keyResults[0].current, 2.5);
});
