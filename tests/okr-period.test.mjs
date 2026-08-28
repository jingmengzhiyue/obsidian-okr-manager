import test from "node:test";
import assert from "node:assert/strict";

const periodModule = await import("../src/utils/period.ts");
const managerModule = await import("../src/manager/OKRManager.ts");
const parserModule = await import("../src/manager/FileParser.ts");
const repositoryModule = await import("../src/manager/PeriodRepository.ts");
const typesModule = await import("../src/types.ts");
const i18nModule = await import("../src/i18n/index.ts");

const { getNextPeriod, getIncompleteObjectives, sanitizeTemplateFileName } =
	periodModule.default ?? periodModule;
const { OKRManager } = managerModule.default ?? managerModule;
const { FileParser } = parserModule.default ?? parserModule;
const { PeriodRepository } = repositoryModule.default ?? repositoryModule;
const { DEFAULT_SETTINGS } = typesModule.default ?? typesModule;
const { createI18n } = i18nModule.default ?? i18nModule;

function objective(overrides = {}) {
	const base = {
		id: "O1",
		period: "2026-Q2",
		periodType: "quarter",
		title: "Ship reliable lifecycle",
		description: "Keep existing data compatible",
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
				title: "Add close flow",
				description: "",
				owner: "Team",
				unit: "number",
				current: 4,
				target: 10,
				progress: 40,
				status: "active",
				confidence: "high",
				created: "2026-04-01",
				due: "2026-06-30",
				filePath: "OKR/2026-Q2/O1.md",
				checkIns: [
					{
						id: "check-1",
						krId: "O1-KR1",
						date: "2026-05-01",
						progress: 40,
						delta: 40,
						note: "Started",
						blocker: "",
						recordedAt: "2026-05-01T00:00:00.000Z",
					},
				],
			},
		],
	};
	return { ...base, ...overrides };
}

function periodInfo(period, status = "open", rollovers = []) {
	return {
		period,
		periodType: "quarter",
		status,
		createdAt: "",
		rollovers,
	};
}

test("next period handles week, month, quarter, year and ISO week 53", () => {
	assert.equal(getNextPeriod("2020-W53", "week"), "2021-W01");
	assert.equal(getNextPeriod("2026-12", "month"), "2027-01");
	assert.equal(getNextPeriod("2026-Q4", "quarter"), "2027-Q1");
	assert.equal(getNextPeriod("2026", "year"), "2027");
	assert.equal(getNextPeriod("2026-Q5", "quarter"), null);
});

test("legacy folders are implicitly open and period cache invalidates by reserved path", async () => {
	const app = { vault: {} };
	const repository = new PeriodRepository(
		app,
		DEFAULT_SETTINGS,
		new FileParser(app),
	);
	const info = await repository.getPeriodInfo("2026-Q2");
	assert.equal(info.status, "open");
	assert.equal(repository.periodCache.size, 1);
	assert.equal(repository.invalidatePath("OKR/2026-Q2/_period.md"), true);
	assert.equal(repository.periodCache.size, 0);
	repository.templateCache.set("OKR/Templates/Q.md", {});
	assert.equal(repository.invalidatePath("OKR/Templates/Q.md"), true);
	assert.equal(repository.templateCache.size, 0);
});

test("period metadata rejects malformed state and mismatched folders with the path", () => {
	const app = { vault: {} };
	const repository = new PeriodRepository(
		app,
		DEFAULT_SETTINGS,
		new FileParser(app),
	);
	const valid = {
		"okr-type": "period",
		"okr-period": "2026-Q2",
		"okr-period-type": "quarter",
		status: "open",
		"created-at": "2026-04-01T00:00:00.000Z",
		rollovers: [],
	};
	assert.throws(
		() => repository.parsePeriodInfo({ ...valid, status: "invalid" }, "OKR/2026-Q2/_period.md", "2026-Q2"),
		/OKR\/2026-Q2\/_period\.md/,
	);
	assert.throws(
		() => repository.parsePeriodInfo(valid, "OKR/2026-Q3/_period.md", "2026-Q3"),
		/OKR\/2026-Q3\/_period\.md/,
	);
});

test("incomplete candidates exclude finished items and previously rolled objectives", () => {
	const active = objective();
	const completed = objective({ id: "O2", status: "completed" });
	const noKeyResults = objective({ id: "O3", keyResults: [] });
	const candidates = getIncompleteObjectives(
		[active, completed, noKeyResults],
		new Set(["O3"]),
	);
	assert.deepEqual(candidates.map((item) => item.objective.id), ["O1"]);
	assert.deepEqual(candidates[0].keyResults.map((item) => item.id), ["O1-KR1"]);
});

test("template filenames are portable and reject empty unsafe names", () => {
	assert.equal(sanitizeTemplateFileName(" Q2: Launch / Growth. "), "Q2- Launch - Growth");
	assert.equal(sanitizeTemplateFileName("CON"), "_CON");
	assert.equal(sanitizeTemplateFileName("CON.txt"), "_CON.txt");
	assert.equal(sanitizeTemplateFileName("\u0000"), "-");
});

test("period templates never overwrite an existing safe filename", async () => {
	const app = {
		vault: {
			getAbstractFileByPath: () => ({ path: "OKR/Templates/Quarter.md" }),
		},
	};
	const repository = new PeriodRepository(
		app,
		DEFAULT_SETTINGS,
		new FileParser(app),
	);
	repository.ensureFolder = async () => {};
	await assert.rejects(
		repository.createTemplate({
			id: "123e4567-e89b-42d3-a456-426614174000",
			name: "Quarter",
			periodType: "quarter",
			createdAt: "2026-01-01T00:00:00.000Z",
			objectives: [],
		}),
		/already exists/,
	);
});

test("objective rollover origin round-trips and old objectives stay compatible", () => {
	const parser = new FileParser({});
	const rolled = objective({
		period: "2026-Q3",
		rolloverFrom: { period: "2026-Q2", objectiveId: "O1" },
	});
	const frontmatter = parser.buildObjectiveFrontmatter(rolled);
	assert.deepEqual(frontmatter["rollover-from"], {
		period: "2026-Q2",
		"objective-id": "O1",
	});
	const parsed = parser.parseObjective(
		{ path: "OKR/2026-Q3/O2.md" },
		frontmatter,
	);
	assert.deepEqual(parsed.rolloverFrom, {
		period: "2026-Q2",
		objectiveId: "O1",
	});
	const legacy = { ...frontmatter };
	delete legacy["rollover-from"];
	assert.equal(
		parser.parseObjective({ path: "OKR/2026-Q3/O2.md" }, legacy).rolloverFrom,
		undefined,
	);
});

test("check-in parser reads multiple CRLF blocks and replaces duplicate IDs", () => {
	const parser = new FileParser({});
	const secondKeyResult = {
		...objective().keyResults[0],
		id: "O1-KR2",
		order: 1,
		title: "Second KR",
	};
	const source = objective({
		keyResults: [objective().keyResults[0], secondKeyResult],
	});
	const frontmatter = parser.buildObjectiveFrontmatter(source);
	const block = (krId, checkInId, progress, note) =>
		[
			"<!-- OKR-CHECKINS-START -->",
			`### ${krId} Progress`,
			`- **2026-05-01** ${progress}% (+${progress}) \`${checkInId}\``,
			"  - recordedAt: 2026-05-01T00:00:00.000Z",
			`  - note: ${note}`,
			"  - blocker: ",
			"<!-- OKR-CHECKINS-END -->",
		].join("\r\n");
	const content = [
		block("O1-KR1", "duplicate", 20, "old"),
		block("O1-KR1", "duplicate", 40, "new"),
		block("O1-KR2", "second", 60, "second"),
	].join("\r\n");
	const parsed = parser.parseObjective(
		{ path: "OKR/2026-Q2/O1.md" },
		frontmatter,
		content,
	);
	assert.equal(parsed.keyResults[0].checkIns.length, 1);
	assert.equal(parsed.keyResults[0].checkIns[0].progress, 40);
	assert.equal(parsed.keyResults[0].checkIns[0].note, "new");
	assert.equal(parsed.keyResults[1].checkIns[0].id, "second");
	assert.deepEqual(
		parser.parseObjective(
			{ path: "OKR/2026-Q2/O1.md" },
			frontmatter,
			"No progress blocks",
		).keyResults.flatMap((item) => item.checkIns),
		[],
	);
});

test("closing a period carries selected data, clears history, and writes metadata last", async () => {
	const manager = new OKRManager({}, DEFAULT_SETTINGS, createI18n("en"));
	const source = objective();
	const events = [];
	const infos = new Map([
		["2026-Q2", periodInfo("2026-Q2")],
		["2026-Q3", periodInfo("2026-Q3")],
	]);
	manager.getPeriodInfo = async (period) => infos.get(period);
	manager.getRolloverCandidates = async () => [
		{ objective: source, keyResults: source.keyResults },
	];
	manager.getObjectiveSummaries = async (period) =>
		period === "2026-Q3" ? [objective({ id: "O2", period: "2026-Q3" })] : [source];
	manager.assertPeriodWritable = async (period) => {
		if (infos.get(period).status !== "open") throw new Error("read-only");
	};
	manager.createObjectiveFile = async (created) => {
		events.push(["create", created]);
		return { path: created.filePath };
	};
	manager.periodRepository.writePeriodInfo = async (info) => {
		events.push(["metadata", info]);
		infos.set(info.period, info);
	};

	const result = await manager.closePeriod({
		period: "2026-Q2",
		targetPeriod: "2026-Q3",
		selections: [{ objectiveId: "O1", keyResultIds: ["O1-KR1"] }],
	});

	assert.equal(result.createdObjectives[0].id, "O3");
	assert.equal(result.createdObjectives[0].rolloverFrom.period, "2026-Q2");
	assert.equal(result.createdObjectives[0].keyResults[0].current, 4);
	assert.equal(result.createdObjectives[0].keyResults[0].progress, 40);
	assert.equal(result.createdObjectives[0].keyResults[0].status, "active");
	assert.deepEqual(result.createdObjectives[0].keyResults[0].checkIns, []);
	assert.equal(events.at(-1)[0], "metadata");
	assert.equal(events.at(-1)[1].status, "closed");
});

test("closing without rollover requires explicit authorization", async () => {
	const manager = new OKRManager({}, DEFAULT_SETTINGS, createI18n("en"));
	manager.getPeriodInfo = async (period) => periodInfo(period);
	manager.getRolloverCandidates = async () => [
		{ objective: objective(), keyResults: objective().keyResults },
	];
	await assert.rejects(
		manager.closePeriod({ period: "2026-Q2", selections: [] }),
		/Explicit confirmation/,
	);
});

test("a failed rollover removes files created by the same operation and leaves source open", async () => {
	const manager = new OKRManager({}, DEFAULT_SETTINGS, createI18n("en"));
	const first = objective();
	const second = objective({ id: "O2", filePath: "OKR/2026-Q2/O2.md" });
	const infos = new Map([
		["2026-Q2", periodInfo("2026-Q2")],
		["2026-Q3", periodInfo("2026-Q3")],
	]);
	manager.getPeriodInfo = async (period) => infos.get(period);
	manager.getRolloverCandidates = async () => [
		{ objective: first, keyResults: first.keyResults },
		{ objective: second, keyResults: second.keyResults },
	];
	manager.getObjectiveSummaries = async () => [];
	manager.assertPeriodWritable = async () => {};
	let attempts = 0;
	manager.createObjectiveFile = async (created) => {
		attempts += 1;
		if (attempts === 2) throw new Error("simulated create failure");
		return { path: created.filePath };
	};
	const rolledBack = [];
	manager.rollbackFiles = async (files) => {
		rolledBack.push(...files.map((file) => file.path));
		return [];
	};
	let metadataWrites = 0;
	manager.periodRepository.writePeriodInfo = async () => {
		metadataWrites += 1;
	};

	await assert.rejects(
		manager.closePeriod({
			period: "2026-Q2",
			targetPeriod: "2026-Q3",
			selections: [
				{ objectiveId: "O1", keyResultIds: ["O1-KR1"] },
				{ objectiveId: "O2", keyResultIds: ["O1-KR1"] },
			],
		}),
		/simulated create failure/,
	);
	assert.deepEqual(rolledBack, ["OKR/2026-Q3/O1.md"]);
	assert.equal(metadataWrites, 0);
	assert.equal(infos.get("2026-Q2").status, "open");
});

test("reopened periods keep rollover mappings and do not offer them twice", async () => {
	const manager = new OKRManager({}, DEFAULT_SETTINGS, createI18n("en"));
	const mapping = {
		sourceObjectiveId: "O1",
		sourceKeyResultIds: ["O1-KR1"],
		targetPeriod: "2026-Q3",
		targetObjectiveId: "O1",
	};
	manager.getPeriodInfo = async () => periodInfo("2026-Q2", "open", [mapping]);
	manager.getObjectiveSummaries = async () => [objective()];
	assert.deepEqual(await manager.getRolloverCandidates("2026-Q2"), []);
});

test("period writes reject closed and archived status", async () => {
	for (const status of ["closed", "archived"]) {
		const manager = new OKRManager({}, DEFAULT_SETTINGS, createI18n("en"));
		manager.getPeriodInfo = async () => periodInfo("2026-Q2", status);
		await assert.rejects(
			manager.assertPeriodWritable("2026-Q2"),
			/read-only/,
		);
	}
});

test("period status transitions enforce open, closed, and archived state machine", async () => {
	const manager = new OKRManager({}, DEFAULT_SETTINGS, createI18n("en"));
	let info = periodInfo("2026-Q2", "open", [
		{
			sourceObjectiveId: "O1",
			sourceKeyResultIds: ["O1-KR1"],
			targetPeriod: "2026-Q3",
			targetObjectiveId: "O1",
		},
	]);
	manager.getPeriodInfo = async () => info;
	manager.periodRepository.writePeriodInfo = async (next) => {
		info = next;
	};

	await assert.rejects(manager.archivePeriod("2026-Q2"), /cannot transition/);
	info = { ...info, status: "closed", closedAt: "2026-06-30T00:00:00.000Z" };
	await manager.archivePeriod("2026-Q2");
	assert.equal(info.status, "archived");
	assert.equal(info.rollovers.length, 1);
	await manager.unarchivePeriod("2026-Q2");
	assert.equal(info.status, "closed");
	await manager.reopenPeriod("2026-Q2");
	assert.equal(info.status, "open");
	assert.equal(info.closedAt, undefined);
});

test("period lock serializes ordinary writes before close", async () => {
	const manager = new OKRManager({}, DEFAULT_SETTINGS, createI18n("en"));
	let info = periodInfo("2026-Q2", "open");
	const events = [];
	manager.getPeriodInfo = async () => info;
	manager.getRolloverCandidates = async () => [];
	manager.periodRepository.writePeriodInfo = async (next) => {
		events.push("close");
		info = next;
	};
	let releaseWrite;
	const waitForRelease = new Promise((resolve) => {
		releaseWrite = resolve;
	});
	const write = manager.withPeriodLocks(["2026-Q2"], async () => {
		events.push("write-start");
		await waitForRelease;
		events.push("write-end");
	});
	await new Promise((resolve) => setTimeout(resolve, 0));
	const close = manager.closePeriod({
		period: "2026-Q2",
		selections: [],
	});
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.deepEqual(events, ["write-start"]);
	releaseWrite();
	await Promise.all([write, close]);
	assert.deepEqual(events, ["write-start", "write-end", "close"]);
});

test("template application resets structural state for every KR unit", async () => {
	const manager = new OKRManager({}, DEFAULT_SETTINGS, createI18n("en"));
	manager.getPeriodInfo = async (period) => periodInfo(period);
	manager.assertPeriodWritable = async () => {};
	manager.getObjectiveSummaries = async () => [];
	manager.periodRepository.getTemplate = async () => ({
		id: "template-1",
		name: "Quarter",
		periodType: "quarter",
		createdAt: "2026-01-01T00:00:00.000Z",
		filePath: "OKR/Templates/Quarter.md",
		objectives: [
			{
				title: "Reusable",
				description: "",
				owner: "Team",
				keyResults: ["number", "score", "percentage", "boolean"].map(
					(unit, order) => ({
						title: unit,
						description: "",
						owner: "Team",
						unit,
						target: unit === "boolean" ? 1 : 10,
						confidence: "medium",
						order,
					}),
				),
			},
		],
	});
	manager.createObjectiveFile = async (created) => ({ path: created.filePath });

	const [created] = await manager.applyPeriodTemplate({
		templateId: "template-1",
		targetPeriod: "2026-Q3",
	});
	assert.deepEqual(created.keyResults.map((item) => item.current), [0, 0, 0, 0]);
	assert.deepEqual(created.keyResults.map((item) => item.progress), [0, 0, 0, 0]);
	assert.ok(created.keyResults.every((item) => item.status === "active"));
});

test("template application rejects a non-empty target period", async () => {
	const manager = new OKRManager({}, DEFAULT_SETTINGS, createI18n("en"));
	manager.getPeriodInfo = async (period) => periodInfo(period);
	manager.assertPeriodWritable = async () => {};
	manager.periodRepository.getTemplate = async () => ({
		id: "123e4567-e89b-42d3-a456-426614174000",
		name: "Quarter",
		periodType: "quarter",
		createdAt: "2026-01-01T00:00:00.000Z",
		filePath: "OKR/Templates/Quarter.md",
		objectives: [],
	});
	manager.getObjectiveSummaries = async () => [objective({ period: "2026-Q3" })];
	await assert.rejects(
		manager.applyPeriodTemplate({
			templateId: "123e4567-e89b-42d3-a456-426614174000",
			targetPeriod: "2026-Q3",
		}),
		/without objectives/,
	);
});
