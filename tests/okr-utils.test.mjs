import test from "node:test";
import assert from "node:assert/strict";

const sortModule = await import("../src/utils/sort.ts");
const objectiveStatusModule = await import("../src/utils/objectiveStatus.ts");
const validationModule = await import("../src/utils/validation.ts");
const i18nModule = await import("../src/i18n/index.ts");
const typesModule = await import("../src/types.ts");
const managerModule = await import("../src/manager/OKRManager.ts");
const fileParserModule = await import("../src/manager/FileParser.ts");
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
const {
	isValidCheckInFields,
	isValidKeyResultValues,
	isValidPostponeDate,
} = validationModule.default ?? validationModule;
const { createI18n, detectLocale, resolveLocale } =
	i18nModule.default ?? i18nModule;
const { DEFAULT_SETTINGS } = typesModule.default ?? typesModule;
const { OKRManager } = managerModule.default ?? managerModule;
const { FileParser } = fileParserModule.default ?? fileParserModule;
const { collectMarkdownFilesFromTree } =
	fileTreeModule.default ?? fileTreeModule;
const { shouldRefreshActivePreview } =
	previewRefreshModule.default ?? previewRefreshModule;
const { revealLeafCompat } =
	workspaceCompatModule.default ?? workspaceCompatModule;
const { getElementDocument, isActiveElement } =
	documentCompatModule.default ?? documentCompatModule;

function createTestObjective(overrides = {}) {
	const {
		keyResult: keyResultOverrides,
		keyResults: keyResultList,
		...objectiveOverrides
	} = overrides;
	const keyResult = {
		id: "O1-KR1",
		objectiveId: "O1",
		period: "2026-Q2",
		periodType: "quarter",
		order: 0,
		title: "Raise review coverage",
		description: "",
		owner: "Team",
		unit: "number",
		current: 4,
		target: 10,
		progress: 40,
		status: "active",
		confidence: "medium",
		created: "2026-04-01",
		due: "2026-06-30",
		filePath: "OKR/2026-Q2/O1.md",
		checkIns: [],
		...(keyResultOverrides ?? {}),
	};

	return {
		id: "O1",
		period: "2026-Q2",
		periodType: "quarter",
		title: "Improve quality",
		description: "",
		owner: "Team",
		status: "active",
		progress: 40,
		created: "2026-04-01",
		due: "2026-06-30",
		filePath: "OKR/2026-Q2/O1.md",
		keyResults: keyResultList ?? [keyResult],
		...objectiveOverrides,
	};
}

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

test("getObjectiveDeadlineState suppresses overdue reminders for cancelled objectives", () => {
	const state = getObjectiveDeadlineState(
		{
			id: "O2",
			title: "Cancelled launch",
			status: "cancelled",
			due: "2026-05-20",
		},
		"2026-05-27",
		createI18n("en"),
	);

	assert.equal(state.tone, "normal");
	assert.equal(state.showPostponeAction, false);
});

test("week periods use the ISO week-numbering year at year boundaries", () => {
	const parser = new FileParser({});
	assert.equal(
		parser.formatDateToPeriod(new Date(2024, 11, 30), "week"),
		"2025-W01",
	);
	assert.equal(
		parser.formatDateToPeriod(new Date(2021, 0, 1), "week"),
		"2020-W53",
	);
});

test("mixed period types sort by their chronological start", () => {
	const parser = new FileParser({});
	assert.ok(
		parser.getPeriodSortValue("2026-W20") <
			parser.getPeriodSortValue("2026-Q4"),
	);
	assert.equal(parser.getDueForPeriod("2027-Q4", "quarter"), "2027-12-31");
	assert.equal(parser.isValidPeriod("2026-W53", "week"), true);
	assert.equal(parser.isValidPeriod("2027-W53", "week"), false);
});

test("form validation rejects zero targets and invalid boolean values", () => {
	assert.equal(isValidKeyResultValues("number", 0, 0), false);
	assert.equal(isValidKeyResultValues("number", 1.5, 3), true);
	assert.equal(isValidKeyResultValues("boolean", 1, 1), true);
	assert.equal(isValidKeyResultValues("boolean", 2, 1), false);
	assert.equal(isValidKeyResultValues("boolean", 1, 2), false);
	assert.equal(
		isValidCheckInFields("2026-05-01", "0", "50", "boolean"),
		false,
	);
	assert.equal(
		isValidCheckInFields("2026-05-01", "1", "100", "boolean"),
		true,
	);
});

test("check-in and postpone validation enforce submission rules", () => {
	assert.equal(isValidCheckInFields("2026-05-01", "1.5", "50"), true);
	assert.equal(isValidCheckInFields("", "1.5", "50"), false);
	assert.equal(isValidCheckInFields("2026-05-01", "", "50"), false);
	assert.equal(isValidCheckInFields("2026-05-01", "1.5", "50.5"), false);
	assert.equal(isValidPostponeDate("2026-05-01", "2026-05-02"), true);
	assert.equal(isValidPostponeDate("2026-05-01", "2026-05-01"), false);
	assert.equal(isValidPostponeDate("2026-05-01", "2026-04-30"), false);
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

test("detectLocale ignores localStorage values to avoid plugin data storage warnings", () => {
	const originalLocalStorage = globalThis.localStorage;
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: {
			getItem() {
				throw new Error("detectLocale should not read localStorage");
			},
		},
	});

	try {
		assert.doesNotThrow(() => detectLocale({}));
	} finally {
		if (originalLocalStorage === undefined) {
			delete globalThis.localStorage;
		} else {
			Object.defineProperty(globalThis, "localStorage", {
				configurable: true,
				value: originalLocalStorage,
			});
		}
	}
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
	manager.mutateObjective = async (_file, mutation) => {
		const entry = await manager.findObjectiveEntryByKRId(
			"O1-KR1",
			"2026-Q2",
		);
		return mutation(entry.objective);
	};

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
	manager.mutateObjective = async (_file, mutation) => {
		const entry = await manager.findObjectiveEntryByKRId();
		writtenObjective = mutation(entry.objective);
		return writtenObjective;
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

test("recordCheckIn preserves a percentage-driven update without integer rounding", async () => {
	const manager = new OKRManager({}, DEFAULT_SETTINGS, createI18n("en"));
	const objective = createTestObjective({
		keyResult: { current: 0, target: 3, progress: 0, checkIns: [] },
	});
	let writtenObjective;
	manager.findObjectiveEntryByKRId = async () => ({
		file: { path: objective.filePath },
		objective,
	});
	manager.mutateObjective = async (_file, mutation) => {
		writtenObjective = mutation(objective);
		return writtenObjective;
	};

	await manager.recordCheckIn({
		krId: "O1-KR1",
		period: "2026-Q2",
		date: "2026-05-01",
		progress: 50,
		note: "",
		blocker: "",
	});

	assert.equal(writtenObjective.keyResults[0].progress, 50);
	assert.equal(writtenObjective.keyResults[0].current, 1.5);
});

test("recordCheckIn rejects partial values for a Boolean key result", async () => {
	const manager = new OKRManager({}, DEFAULT_SETTINGS, createI18n("en"));
	const objective = createTestObjective({
		keyResult: {
			unit: "boolean",
			current: 0,
			target: 1,
			progress: 0,
			checkIns: [],
		},
	});
	manager.findObjectiveEntryByKRId = async () => ({
		file: { path: objective.filePath },
		objective,
	});
	manager.mutateObjective = async (_file, mutation) => mutation(objective);

	await assert.rejects(
		manager.recordCheckIn({
			krId: "O1-KR1",
			period: "2026-Q2",
			date: "2026-05-01",
			progress: 50,
			note: "Invalid partial completion",
			blocker: "",
		}),
		/Invalid check-in values/,
	);
});

test("manual progress mode preserves current and percentage independently", async () => {
	const manager = new OKRManager(
		{},
		{ ...DEFAULT_SETTINGS, autoComputeProgress: false },
		createI18n("en"),
	);
	const objective = createTestObjective();
	let writtenObjective;
	manager.findObjectiveEntryByKRId = async () => ({
		file: { path: objective.filePath },
		objective,
	});
	manager.mutateObjective = async (_file, mutation) => {
		writtenObjective = mutation(objective);
		return writtenObjective;
	};

	await manager.recordCheckIn({
		krId: "O1-KR1",
		period: "2026-Q2",
		date: "2026-05-01",
		current: 7,
		progress: 30,
		note: "Manual",
		blocker: "",
	});

	assert.equal(writtenObjective.keyResults[0].current, 7);
	assert.equal(writtenObjective.keyResults[0].progress, 30);
});

test("createKeyResult rejects an invalid target at the manager boundary", async () => {
	const manager = new OKRManager({}, DEFAULT_SETTINGS, createI18n("en"));

	await assert.rejects(
		manager.createKeyResult({
			objectiveId: "O1",
			period: "2026-Q2",
			title: "Invalid",
			description: "",
			owner: "Team",
			unit: "number",
			current: 0,
			target: 0,
			status: "active",
			confidence: "medium",
			created: "2026-04-01",
			due: "2026-06-30",
		}),
		/Invalid key result values/,
	);
});

test("createObjective rejects an invalid period at the manager boundary", async () => {
	const manager = new OKRManager({}, DEFAULT_SETTINGS, createI18n("en"));

	await assert.rejects(
		manager.createObjective({
			period: "2027-W53",
			periodType: "week",
			title: "Invalid period",
			description: "",
			owner: "Team",
			status: "active",
			created: "2027-12-01",
			due: "2027-12-31",
		}),
		/Invalid OKR period: 2027-W53/,
	);
});

test("concurrent recordCheckIn calls preserve both updates", async () => {
	let storedObjective = createTestObjective({
		keyResult: { current: 0, progress: 0, checkIns: [] },
	});
	let content = "objective";
	const file = { path: storedObjective.filePath };
	const app = {
		vault: {
			async process(_file, callback) {
				await new Promise((resolve) => setTimeout(resolve, 1));
				content = callback(content);
			},
		},
	};
	const manager = new OKRManager(app, DEFAULT_SETTINGS, createI18n("en"));
	manager.findObjectiveEntryByKRId = async () => ({
		file,
		objective: structuredClone(storedObjective),
	});
	manager.parser.parseObjectiveContent = () => structuredClone(storedObjective);
	manager.buildUpdatedObjectiveContent = (_content, objective) => {
		storedObjective = structuredClone(objective);
		return "objective";
	};

	await Promise.all([
		manager.recordCheckIn({
			krId: "O1-KR1",
			period: "2026-Q2",
			date: "2026-05-01",
			current: 1,
			progress: 10,
			note: "A",
			blocker: "",
		}),
		manager.recordCheckIn({
			krId: "O1-KR1",
			period: "2026-Q2",
			date: "2026-05-01",
			current: 2,
			progress: 20,
			note: "B",
			blocker: "",
		}),
	]);

	assert.deepEqual(
		storedObjective.keyResults[0].checkIns
			.map((item) => item.note)
			.sort(),
		["A", "B"],
	);
});

test("concurrent createKeyResult calls allocate distinct IDs", async () => {
	let storedObjective = createTestObjective({ keyResults: [], progress: 0 });
	let content = "objective";
	const file = { path: storedObjective.filePath };
	const app = {
		vault: {
			async process(_file, callback) {
				await new Promise((resolve) => setTimeout(resolve, 1));
				content = callback(content);
			},
		},
	};
	const manager = new OKRManager(app, DEFAULT_SETTINGS, createI18n("en"));
	manager.findObjectiveEntry = async () => ({ file, objective: storedObjective });
	manager.parser.parseObjectiveContent = () => structuredClone(storedObjective);
	manager.buildUpdatedObjectiveContent = (_content, objective) => {
		storedObjective = structuredClone(objective);
		return "objective";
	};
	const baseParams = {
		objectiveId: "O1",
		period: "2026-Q2",
		description: "",
		owner: "Team",
		unit: "number",
		current: 0,
		target: 10,
		status: "active",
		confidence: "medium",
		created: "2026-04-01",
		due: "2026-06-30",
	};

	const created = await Promise.all([
		manager.createKeyResult({ ...baseParams, title: "A" }),
		manager.createKeyResult({ ...baseParams, title: "B" }),
	]);

	assert.deepEqual(
		created.map((item) => item.id).sort(),
		["O1-KR1", "O1-KR2"],
	);
	assert.equal(storedObjective.keyResults.length, 2);
});

test("reorderKeyResult preserves check-in history on the moved key result", async () => {
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
			progress: 50,
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
					title: "First KR",
					description: "",
					owner: "Team",
					unit: "number",
					current: 5,
					target: 10,
					progress: 50,
					status: "active",
					confidence: "medium",
					created: "2026-04-01",
					due: "2026-06-30",
					filePath: "OKR/2026-Q2/O1.md",
					checkIns: [
						{
							id: "O1-KR1-1",
							krId: "O1-KR1",
							date: "2026-05-01",
							progress: 50,
							delta: 50,
							note: "Keep this history",
							blocker: "",
							recordedAt: "2026-05-01T00:00:00.000Z",
						},
					],
				},
				{
					id: "O1-KR2",
					objectiveId: "O1",
					period: "2026-Q2",
					periodType: "quarter",
					order: 1,
					title: "Second KR",
					description: "",
					owner: "Team",
					unit: "number",
					current: 0,
					target: 10,
					progress: 0,
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
	manager.mutateObjective = async (_file, mutation) => {
		const entry = await manager.findObjectiveEntryByKRId();
		writtenObjective = mutation(entry.objective);
		return writtenObjective;
	};

	await manager.reorderKeyResult("O1-KR1", "2026-Q2", 1);

	assert.deepEqual(
		writtenObjective.keyResults.map((item) => item.id),
		["O1-KR2", "O1-KR1"],
	);
	assert.deepEqual(writtenObjective.keyResults[1].checkIns, [
		{
			id: "O1-KR1-1",
			krId: "O1-KR1",
			date: "2026-05-01",
			progress: 50,
			delta: 50,
			note: "Keep this history",
			blocker: "",
			recordedAt: "2026-05-01T00:00:00.000Z",
		},
	]);
});

test("migrateLegacyProgressRecords rewrites objective files with legacy frontmatter check-ins", async () => {
	const file = { path: "OKR/2026-Q2/O1.md" };
	const manager = new OKRManager(
		{
			vault: {
				async read() {
					return [
						"---",
						"okr-type: objective",
						"---",
						"",
						"## 背景",
						"",
						"Legacy objective.",
					].join("\n");
				},
			},
		},
		DEFAULT_SETTINGS,
		createI18n("en"),
	);
	manager.getAllPeriods = async () => ["2026-Q2"];
	manager.getObjectiveFiles = () => [file];
	manager.parser.readFrontmatter = async () => ({
		"okr-type": "objective",
		"okr-id": "O1",
		"okr-period": "2026-Q2",
		"okr-period-type": "quarter",
		title: "Improve quality",
		owner: "Team",
		status: "active",
		progress: 40,
		created: "2026-04-01",
		due: "2026-06-30",
		"key-results": [
			{
				"okr-id": "O1-KR1",
				title: "Raise review coverage",
				owner: "Team",
				unit: "number",
				current: 4,
				target: 10,
				progress: 40,
				status: "active",
				confidence: "medium",
				created: "2026-04-01",
				due: "2026-06-30",
				order: 0,
				checkIns: [
					{
						id: "O1-KR1-1",
						date: "2026-05-01",
						progress: 40,
						delta: 40,
						note: "Legacy update",
						blocker: "",
						recordedAt: "2026-05-01T00:00:00.000Z",
					},
				],
			},
		],
	});
	let writtenObjective;
	manager.mutateObjective = async (_file, mutation) => {
		const frontmatter = await manager.parser.readFrontmatter(file);
		const content = await manager.app.vault.read(file);
		writtenObjective = mutation(
			manager.parser.parseObjective(file, frontmatter, content),
		);
		return writtenObjective;
	};

	const result = await manager.migrateLegacyProgressRecords();

	assert.deepEqual(result, { scanned: 1, migrated: 1 });
	assert.equal(writtenObjective.keyResults[0].checkIns[0].note, "Legacy update");
});

test("buildObjectiveFrontmatter stores KR current state without check-in history", () => {
	const parser = new FileParser({});
	const frontmatter = parser.buildObjectiveFrontmatter({
		id: "O1",
		period: "2026-Q2",
		periodType: "quarter",
		title: "Improve quality",
		description: "",
		owner: "Team",
		status: "active",
		progress: 40,
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
				title: "Raise review coverage",
				description: "",
				owner: "Team",
				unit: "number",
				current: 4,
				target: 10,
				progress: 40,
				status: "active",
				confidence: "medium",
				created: "2026-04-01",
				due: "2026-06-30",
				filePath: "OKR/2026-Q2/O1.md",
				checkIns: [
					{
						id: "O1-KR1-1",
						krId: "O1-KR1",
						date: "2026-05-01",
						progress: 40,
						delta: 40,
						note: "First update",
						blocker: "",
						recordedAt: "2026-05-01T00:00:00.000Z",
					},
				],
			},
		],
	});

	assert.equal(frontmatter["key-results"][0].checkIns, undefined);
	assert.equal(frontmatter["key-results"][0].current, 4);
	assert.equal(frontmatter["key-results"][0].target, 10);
	assert.equal(frontmatter["key-results"][0].order, 0);
});

test("parseObjective reads check-in history from markdown progress records", () => {
	const parser = new FileParser({});
	const objective = parser.parseObjective(
		{ path: "OKR/2026-Q2/O1.md" },
		{
			"okr-id": "O1",
			"okr-period": "2026-Q2",
			"okr-period-type": "quarter",
			title: "Improve quality",
			owner: "Team",
			status: "active",
			progress: 40,
			created: "2026-04-01",
			due: "2026-06-30",
			"key-results": [
				{
					"okr-id": "O1-KR1",
					title: "Raise review coverage",
					owner: "Team",
					unit: "number",
					current: 4,
					target: 10,
					progress: 40,
					status: "active",
					confidence: "medium",
					created: "2026-04-01",
					due: "2026-06-30",
					order: 0,
				},
			],
		},
		[
			"## 背景",
			"",
			"## 进度记录",
			"",
			"<!-- OKR-CHECKINS-START -->",
			"### O1-KR1 进度记录",
			"",
			"- **2026-05-01** 40% (+40) `O1-KR1-1`",
			"  - recordedAt: 2026-05-01T00:00:00.000Z",
			"  - note: First update",
			"  - blocker: None",
			"<!-- OKR-CHECKINS-END -->",
		].join("\n"),
	);

	assert.deepEqual(objective.keyResults[0].checkIns, [
		{
			id: "O1-KR1-1",
			krId: "O1-KR1",
			date: "2026-05-01",
			progress: 40,
			delta: 40,
			note: "First update",
			blocker: "None",
			recordedAt: "2026-05-01T00:00:00.000Z",
		},
	]);
});

test("syncCheckInsMarkdown replaces legacy-free body with readable progress records", () => {
	const parser = new FileParser({});
	const body = parser.syncCheckInsMarkdown("## 背景\n\nShip it.\n", {
		id: "O1",
		period: "2026-Q2",
		periodType: "quarter",
		title: "Improve quality",
		description: "",
		owner: "Team",
		status: "active",
		progress: 40,
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
				title: "Raise review coverage",
				description: "",
				owner: "Team",
				unit: "number",
				current: 4,
				target: 10,
				progress: 40,
				status: "active",
				confidence: "medium",
				created: "2026-04-01",
				due: "2026-06-30",
				filePath: "OKR/2026-Q2/O1.md",
				checkIns: [
					{
						id: "O1-KR1-1",
						krId: "O1-KR1",
						date: "2026-05-01",
						progress: 40,
						delta: 40,
						note: "First update",
						blocker: "",
						recordedAt: "2026-05-01T00:00:00.000Z",
					},
				],
			},
		],
	});

	assert.match(body, /## 进度记录/);
	assert.match(body, /### O1-KR1 进度记录/);
	assert.match(body, /- \*\*2026-05-01\*\* 40% \(\+40\) `O1-KR1-1`/);
	assert.match(body, /[ ]{2}- note: First update/);
	assert.doesNotMatch(body, /checkIns:/);
});

test("syncCheckInsMarkdown replaces an existing CRLF progress section", () => {
	const parser = new FileParser({});
	const existingBody = [
		"## 背景",
		"",
		"Ship it.",
		"",
		"## 进度记录",
		"",
		"<!-- OKR-CHECKINS-START -->",
		"旧内容",
		"<!-- OKR-CHECKINS-END -->",
		"",
	].join("\r\n");
	const body = parser.syncCheckInsMarkdown(existingBody, {
		id: "O1",
		period: "2026-Q2",
		periodType: "quarter",
		title: "Improve quality",
		description: "",
		owner: "Team",
		status: "active",
		progress: 0,
		created: "2026-04-01",
		due: "2026-06-30",
		filePath: "OKR/2026-Q2/O1.md",
		keyResults: [],
	});

	assert.equal(body.match(/OKR-CHECKINS-START/g).length, 1);
	assert.doesNotMatch(body, /旧内容/);
	assert.match(body, /暂无进度记录。/);
});

test("syncCheckInsMarkdown updates a renamed progress section without duplicate blocks", () => {
	const parser = new FileParser({});
	const oldCheckIn = {
		id: "O1-KR1-old",
		krId: "O1-KR1",
		date: "2026-05-01",
		progress: 40,
		delta: 40,
		note: "Old",
		blocker: "",
		recordedAt: "2026-05-01T00:00:00.000Z",
	};
	const initialObjective = createTestObjective({
		keyResult: { checkIns: [oldCheckIn] },
	});
	const renamed = parser
		.syncCheckInsMarkdown("## Background\n", initialObjective)
		.replace("## 进度记录", "## Progress log")
		.replace("### O1-KR1 进度记录", "### O1-KR1 Progress log");
	const updatedObjective = createTestObjective({
		keyResult: {
			checkIns: [
				{
					...oldCheckIn,
					id: "O1-KR1-new",
					date: "2026-05-02",
					progress: 50,
					delta: 10,
					note: "New",
					recordedAt: "2026-05-02T00:00:00.000Z",
				},
				oldCheckIn,
			],
		},
	});

	const result = parser.syncCheckInsMarkdown(renamed, updatedObjective);
	const parsed = parser.parseObjective(
		{ path: updatedObjective.filePath },
		parser.buildObjectiveFrontmatter(updatedObjective),
		result,
	);

	assert.equal(result.match(/OKR-CHECKINS-START/g)?.length, 1);
	assert.deepEqual(
		parsed.keyResults[0].checkIns.map((item) => item.id),
		["O1-KR1-new", "O1-KR1-old"],
	);
});

test("check-in markdown values preserve literal br tags and marker text", () => {
	const parser = new FileParser({});
	const note = "literal <br> and <!-- OKR-CHECKINS-END -->";
	const objective = createTestObjective({
		keyResult: {
			checkIns: [
				{
					id: "O1-KR1-special",
					krId: "O1-KR1",
					date: "2026-05-01",
					progress: 40,
					delta: 40,
					note,
					blocker: "line one\nline two",
					recordedAt: "2026-05-01T00:00:00.000Z",
				},
			],
		},
	});
	const body = parser.syncCheckInsMarkdown("## Background\n", objective);
	const parsed = parser.parseObjective(
		{ path: objective.filePath },
		parser.buildObjectiveFrontmatter(objective),
		body,
	);

	assert.equal(parsed.keyResults[0].checkIns[0].note, note);
	assert.equal(parsed.keyResults[0].checkIns[0].blocker, "line one\nline two");
});

test("parseObjective rejects invalid and duplicate IDs", () => {
	const parser = new FileParser({});
	const objective = createTestObjective();
	const frontmatter = parser.buildObjectiveFrontmatter(objective);

	assert.throws(
		() =>
			parser.parseObjective(
				{ path: objective.filePath },
				{ ...frontmatter, "okr-id": "invalid" },
			),
		/Invalid Objective ID/,
	);
	assert.throws(
		() =>
			parser.parseObjective(
				{ path: objective.filePath },
				{
					...frontmatter,
					"key-results": [
						frontmatter["key-results"][0],
						frontmatter["key-results"][0],
					],
				},
			),
		/Duplicate Key Result ID/,
	);
});

test("frontmatter extraction accepts CRLF line endings", () => {
	const parser = new FileParser({});
	const frontmatterText = parser.extractFrontmatterText(
		"---\r\nokr-type: objective\r\nokr-id: O1\r\n---\r\n\r\nBody",
	);

	assert.equal(frontmatterText, "okr-type: objective\r\nokr-id: O1");
});

test("getObjectives reports the path of invalid Objective files", async () => {
	const manager = new OKRManager(
		{ vault: { async read() { return "invalid"; } } },
		DEFAULT_SETTINGS,
		createI18n("en"),
	);
	manager.getObjectiveFiles = () => [
		{ path: "OKR/2026-Q2/broken.md" },
	];
	manager.parser.parseFrontmatterContent = () => {
		throw new Error("Invalid frontmatter");
	};

	await assert.rejects(
		manager.getObjectives("2026-Q2"),
		/OKR\/2026-Q2\/broken\.md.*Invalid frontmatter/,
	);
});

test("getObjectiveSummaries does not read Objective bodies", async () => {
	let bodyReadCount = 0;
	const app = {
		vault: {
			async read() {
				bodyReadCount += 1;
				throw new Error("summary loading must not read the body");
			},
		},
	};
	const manager = new OKRManager(app, DEFAULT_SETTINGS, createI18n("en"));
	const objective = createTestObjective();
	manager.getObjectiveFiles = () => [{ path: objective.filePath }];
	manager.parser.readFrontmatter = async () => ({
		"okr-type": "objective",
		...manager.parser.buildObjectiveFrontmatter(objective),
	});

	const summaries = await manager.getObjectiveSummaries("2026-Q2");

	assert.equal(bodyReadCount, 0);
	assert.equal(summaries[0].keyResults[0].id, "O1-KR1");
	assert.deepEqual(summaries[0].keyResults[0].checkIns, []);
});

test("getCheckIns reloads the Objective body instead of returning summary history", async () => {
	const history = [
		{
			id: "O1-KR1-1",
			krId: "O1-KR1",
			date: "2026-05-01",
			progress: 40,
			delta: 40,
			note: "Loaded from body",
			blocker: "",
			recordedAt: "2026-05-01T00:00:00.000Z",
		},
	];
	const summary = createTestObjective({ keyResult: { checkIns: [] } });
	const fullObjective = createTestObjective({
		keyResult: { checkIns: history },
	});
	const app = {
		vault: {
			async read() {
				return "full Objective body";
			},
		},
	};
	const manager = new OKRManager(app, DEFAULT_SETTINGS, createI18n("en"));
	manager.findObjectiveEntryByKRId = async () => ({
		file: { path: summary.filePath },
		objective: summary,
	});
	manager.parser.parseObjectiveContent = () => fullObjective;

	assert.deepEqual(await manager.getCheckIns("O1-KR1", "2026-Q2"), history);
});

test("frontmatter extraction requires an exact closing delimiter", () => {
	const parser = new FileParser({});
	const malformed = [
		"---",
		"okr-type: objective",
		"okr-id: O1",
		"---not-a-delimiter",
		"Body",
	].join("\n");

	assert.equal(parser.extractFrontmatterText(malformed), null);
});

test("getObjectiveSummaries rejects duplicate Objective IDs in one period", async () => {
	const manager = new OKRManager({}, DEFAULT_SETTINGS, createI18n("en"));
	const first = createTestObjective({ filePath: "OKR/2026-Q2/O1.md" });
	const duplicate = createTestObjective({
		title: "Duplicate",
		filePath: "OKR/2026-Q2/copied.md",
	});
	const files = [{ path: first.filePath }, { path: duplicate.filePath }];
	manager.getObjectiveFiles = () => files;
	manager.parser.readFrontmatter = async (file) =>
		({
			"okr-type": "objective",
			...manager.parser.buildObjectiveFrontmatter(
				file.path === first.filePath ? first : duplicate,
			),
		});

	await assert.rejects(
		manager.getObjectiveSummaries("2026-Q2"),
		/Duplicate Objective ID O1.*O1\.md.*copied\.md/,
	);
});

test("getObjectiveSummaries rejects a frontmatter period that differs from its folder", async () => {
	const manager = new OKRManager({}, DEFAULT_SETTINGS, createI18n("en"));
	const misplaced = createTestObjective({
		period: "2026-Q3",
		filePath: "OKR/2026-Q2/O1.md",
		keyResult: { period: "2026-Q3", filePath: "OKR/2026-Q2/O1.md" },
	});
	manager.getObjectiveFiles = () => [{ path: misplaced.filePath }];
	manager.parser.readFrontmatter = async () =>
		({
			"okr-type": "objective",
			...manager.parser.buildObjectiveFrontmatter(misplaced),
		});

	await assert.rejects(
		manager.getObjectiveSummaries("2026-Q2"),
		/period 2026-Q3.*folder period 2026-Q2/,
	);
});

test("an Objective mutation refreshes an existing summary without stale metadata", async () => {
	let storedObjective = createTestObjective();
	let content = "objective";
	let frontmatterReads = 0;
	const file = { path: storedObjective.filePath };
	const app = {
		vault: {
			async process(_file, callback) {
				content = callback(content);
			},
		},
	};
	const manager = new OKRManager(app, DEFAULT_SETTINGS, createI18n("en"));
	manager.getObjectiveFiles = () => [file];
	manager.parser.readFrontmatter = async () => {
		frontmatterReads += 1;
		return {
			"okr-type": "objective",
			...manager.parser.buildObjectiveFrontmatter(createTestObjective()),
		};
	};
	manager.findObjectiveEntryByKRId = async () => ({
		file,
		objective: createTestObjective({ keyResult: { checkIns: [] } }),
	});
	manager.parser.parseObjectiveContent = () => structuredClone(storedObjective);
	manager.buildUpdatedObjectiveContent = (_content, objective) => {
		storedObjective = structuredClone(objective);
		return "objective";
	};

	assert.equal((await manager.getObjectiveSummaries("2026-Q2"))[0].progress, 40);
	await manager.recordCheckIn({
		krId: "O1-KR1",
		period: "2026-Q2",
		date: "2026-05-02",
		current: 8,
		progress: 80,
		note: "Fresh",
		blocker: "",
	});
	const refreshed = await manager.getObjectiveSummaries("2026-Q2");

	assert.equal(refreshed[0].progress, 80);
	assert.equal(refreshed[0].keyResults[0].progress, 80);
	assert.equal(frontmatterReads, 1);
});

test("a delayed summary load cannot overwrite a newer mutation result", async () => {
	let storedObjective = createTestObjective();
	let content = "objective";
	let readCount = 0;
	let releaseFirstRead;
	let signalFirstRead;
	const firstReadStarted = new Promise((resolve) => {
		signalFirstRead = resolve;
	});
	const firstReadGate = new Promise((resolve) => {
		releaseFirstRead = resolve;
	});
	const file = { path: storedObjective.filePath };
	const app = {
		vault: {
			async process(_file, callback) {
				content = callback(content);
			},
		},
	};
	const manager = new OKRManager(app, DEFAULT_SETTINGS, createI18n("en"));
	manager.getObjectiveFiles = () => [file];
	manager.parser.readFrontmatter = async () => {
		readCount += 1;
		const frontmatter = {
			"okr-type": "objective",
			...manager.parser.buildObjectiveFrontmatter(createTestObjective()),
		};
		if (readCount === 1) {
			signalFirstRead();
			await firstReadGate;
		}
		return frontmatter;
	};
	manager.findObjectiveEntryByKRId = async () => ({
		file,
		objective: createTestObjective({ keyResult: { checkIns: [] } }),
	});
	manager.parser.parseObjectiveContent = () => structuredClone(storedObjective);
	manager.buildUpdatedObjectiveContent = (_content, objective) => {
		storedObjective = structuredClone(objective);
		return "objective";
	};

	const delayedLoad = manager.getObjectiveSummaries("2026-Q2");
	await firstReadStarted;
	await manager.getObjectiveSummaries("2026-Q2");
	await manager.recordCheckIn({
		krId: "O1-KR1",
		period: "2026-Q2",
		date: "2026-05-03",
		current: 9,
		progress: 90,
		note: "Newest",
		blocker: "",
	});
	releaseFirstRead();

	assert.equal((await delayedLoad)[0].progress, 90);
	assert.equal((await manager.getObjectiveSummaries("2026-Q2"))[0].progress, 90);
});

test("getObjectives parses frontmatter and body from the same file read", async () => {
	const objective = createTestObjective();
	const file = { path: objective.filePath };
	const fileContent = "fresh Objective content";
	const app = {
		vault: {
			async read() {
				return fileContent;
			},
		},
	};
	const manager = new OKRManager(app, DEFAULT_SETTINGS, createI18n("en"));
	manager.getObjectiveFiles = () => [file];
	manager.parser.readFrontmatter = async () => {
		throw new Error("full loading must parse the content it just read");
	};
	manager.parser.parseFrontmatterContent = (content) => {
		assert.equal(content, fileContent);
		return {
			"okr-type": "objective",
			...manager.parser.buildObjectiveFrontmatter(objective),
		};
	};

	const loaded = await manager.getObjectives("2026-Q2");

	assert.equal(loaded[0].id, "O1");
	assert.equal(loaded[0].keyResults[0].id, "O1-KR1");
});
