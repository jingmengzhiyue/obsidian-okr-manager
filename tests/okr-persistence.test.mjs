import test from "node:test";
import assert from "node:assert/strict";
import { runtime, createVault } from "./helpers/runtime.mjs";

const { OKRManager, DEFAULT_SETTINGS, createEmptyReviewSections } = runtime;

async function setup() {
	const vault = createVault();
	const manager = new OKRManager(vault.app, { ...DEFAULT_SETTINGS });
	const objective = await manager.createObjective({
		period: "2026-Q2", periodType: "quarter", title: "Objective", description: "Background",
		owner: "Team", status: "active", created: "2026-04-01", due: "2026-06-30",
	});
	const kr = await manager.createKeyResult({
		objectiveId: objective.id, period: objective.period, title: "KR", description: "",
		owner: "Team", unit: "number", current: 4, target: 10, weight: 1,
		status: "active", confidence: "high", created: "2026-04-01", due: "2026-06-30",
	});
	const file = vault.files.get(objective.filePath);
	return {
		...vault, manager, objective, kr, file,
		read: () => manager.getParser().parseObjectiveContent(file, vault.contents.get(file.path)),
		checkIn: (date, current, blocker = "") => manager.recordCheckIn({
			krId: kr.id, period: kr.period, date, current, progress: current * 10, note: "Update", blocker,
		}),
	};
}

test("full persistence retains custom Objective/KR fields and tags across a check-in", async () => {
	const h = await setup();
	const parser = h.manager.getParser();
	const fm = parser.parseFrontmatterContent(h.contents.get(h.file.path));
	fm.aliases = ["Launch"];
	fm.project = "Atlas";
	fm.tags = ["custom", "okr"];
	fm["key-results"][0].evidence = "[[Proof]]";
	h.contents.set(h.file.path, `---\n${runtime.stringifyYaml(fm)}---\n\nPersonal notes\n`);
	await h.checkIn("2026-05-01", 5);
	const saved = parser.parseFrontmatterContent(h.contents.get(h.file.path));
	assert.equal(saved.project, "Atlas");
	assert.deepEqual(saved.aliases, ["Launch"]);
	assert.equal(saved["key-results"][0].evidence, "[[Proof]]");
	assert.ok(saved.tags.includes("custom"));
	assert.match(h.contents.get(h.file.path), /Personal notes/);
	assert.equal(h.read().keyResults[0].checkIns.length, 1);
});

test("stale title-only KR edits preserve a newer check-in and reject conflicting values", async () => {
	const h = await setup();
	const base = h.read().keyResults[0];
	await h.checkIn("2026-05-01", 8);
	await h.manager.updateKeyResult(base.id, base.period, { ...base, title: "Renamed" }, base);
	assert.equal(h.read().keyResults[0].current, 8);
	assert.equal(h.read().keyResults[0].progress, 80);
	const before = h.contents.get(h.file.path);
	await assert.rejects(h.manager.updateKeyResult(base.id, base.period, { ...base, current: 6 }, base), /changed|conflict/i);
	assert.equal(h.contents.get(h.file.path), before);
});

test("stale target edits cannot silently reinterpret a newer current value", async () => {
	const h = await setup();
	const base = h.read().keyResults[0];
	await h.checkIn("2026-05-01", 8);
	const before = h.contents.get(h.file.path);
	await assert.rejects(h.manager.updateKeyResult(base.id, base.period, { ...base, target: 20 }, base), /changed|conflict/i);
	assert.equal(h.contents.get(h.file.path), before);
});

test("stale Objective postpone preserves new title/status and detects a competing deadline", async () => {
	const h = await setup();
	const base = h.read();
	await h.manager.updateObjective(base.id, base.period, { ...base, title: "New title", status: "on-hold" });
	await h.manager.updateObjective(base.id, base.period, { ...base, due: "2026-07-01" }, base);
	assert.equal(h.read().title, "New title");
	assert.equal(h.read().status, "on-hold");
	const before = h.contents.get(h.file.path);
	await assert.rejects(h.manager.updateObjective(base.id, base.period, { ...base, due: "2026-07-02" }, base), /changed|conflict/i);
	assert.equal(h.contents.get(h.file.path), before);
});

test("historical check-ins preserve newer current/progress/blocker and rebuild chronological deltas", async () => {
	const h = await setup();
	await h.checkIn("2026-06-01", 8, "Current blocker");
	await h.checkIn("2026-05-01", 4, "Old blocker");
	const kr = h.read().keyResults[0];
	assert.equal(kr.current, 8);
	assert.equal(kr.progress, 80);
	assert.equal(kr.hasBlocker, true);
	assert.deepEqual(kr.checkIns.map((item) => [item.date, item.delta]).sort(), [
		["2026-05-01", 40], ["2026-06-01", 40],
	]);
	await h.checkIn("2026-06-01", 9);
	assert.equal(h.read().keyResults[0].progress, 90);
	assert.equal(h.read().keyResults[0].hasBlocker, false);
});

test("malformed managed history blocks an unrelated write without changing file bytes", async () => {
	const h = await setup();
	await h.checkIn("2026-05-01", 5);
	const broken = h.contents.get(h.file.path).replace("50%", "not-a-number%");
	h.contents.set(h.file.path, broken);
	await assert.rejects(h.manager.updateObjective(h.objective.id, h.objective.period, { ...h.objective, title: "Rename" }), /Invalid|Unrecognized|Unknown/i);
	assert.equal(h.contents.get(h.file.path), broken);
});

test("independent stale review edits merge through Manager and keep literal dollar text", async () => {
	const h = await setup();
	const sections = createEmptyReviewSections();
	sections.summary = "Original";
	sections["next-steps"] = "Next";
	const review = await h.manager.createPeriodReview({ period: "2026-Q2", type: "weekly", reviewDate: "2026-05-01", sections });
	await h.manager.updatePeriodReview({ period: review.period, reviewId: review.id, sections: { ...sections, summary: "Literal $& and $$" }, baseSections: sections });
	await h.manager.updatePeriodReview({ period: review.period, reviewId: review.id, sections: { ...sections, wins: "Second editor" }, baseSections: sections });
	h.manager.clearAllCache();
	const saved = await h.manager.getPeriodReview(review.period, review.id);
	assert.equal(saved.sections.summary, "Literal $& and $$");
	assert.equal(saved.sections.wins, "Second editor");
	assert.deepEqual(saved.snapshot, review.snapshot);
	const before = h.contents.get(review.filePath);
	await assert.rejects(h.manager.updatePeriodReview({ period: review.period, reviewId: review.id, sections: { ...sections, summary: "Competing summary" }, baseSections: sections }), /changed|conflict/i);
	assert.equal(h.contents.get(review.filePath), before);
});

test("historic rollover references reserve deleted Objective and KR IDs after restart", async () => {
	const h = await setup();
	await h.manager.closePeriod({ period: "2026-Q2", targetPeriod: "2026-Q3", selections: [{ objectiveId: "O1", keyResultIds: ["O1-KR1"] }], allowMissingRetrospective: true });
	await h.manager.reopenPeriod("2026-Q2");
	await h.manager.deleteKeyResult("O1-KR1", "2026-Q2");
	const newKr = await h.manager.createKeyResult({ ...h.kr, title: "Unrelated KR" });
	assert.notEqual(newKr.id, "O1-KR1");
	await h.manager.deleteObjective("O1", "2026-Q2", true);
	const restarted = new OKRManager(h.app, { ...DEFAULT_SETTINGS });
	const created = await restarted.createObjective({ ...h.objective, title: "New Objective" });
	assert.notEqual(created.id, "O1");
	assert.ok((await restarted.getRolloverCandidates("2026-Q2")).some((item) => item.objective.id === created.id));
	await restarted.deleteObjective("O1", "2026-Q3", true);
	const replacement = await restarted.createObjective({ ...h.objective, period: "2026-Q3" });
	assert.notEqual(replacement.id, "O1");
});


test("real edit modals preserve later changes when submitting their opening snapshots", async () => {
	const h = await setup();
	const krEditor = new runtime.EditKRModal(h.app, h.manager, h.read().keyResults[0]);
	krEditor.onOpen();
	await h.checkIn("2026-05-01", 8);
	krEditor.titleValue = "Edited in modal";
	await krEditor.submit();
	assert.equal(h.read().keyResults[0].title, "Edited in modal");
	assert.equal(h.read().keyResults[0].current, 8);
	const base = h.read();
	const editor = new runtime.EditObjectiveModal(h.app, h.manager, base);
	const postpone = new runtime.PostponeObjectiveModal(h.app, h.manager, base);
	editor.onOpen();
	postpone.onOpen();
	await h.manager.updateObjective(base.id, base.period, { ...base, owner: "New owner" });
	editor.titleValue = "Objective modal title";
	await editor.submit();
	const postponeDate = postpone.contentEl.all().find((element) => element.type === "date");
	postponeDate.value = "2026-07-01";
	for (const handler of postponeDate.events.input ?? []) handler({});
	await postpone.submit();
	assert.equal(h.read().owner, "New owner");
	assert.equal(h.read().title, "Objective modal title");
	assert.equal(h.read().due, "2026-07-01");
});

test("review modal submits only changes relative to its opening sections", async () => {
	const h = await setup();
	const sections = { ...createEmptyReviewSections(), summary: "Original", "next-steps": "Next" };
	const review = await h.manager.createPeriodReview({ period: "2026-Q2", type: "weekly", reviewDate: "2026-05-01", sections });
	const editor = new runtime.ReviewEditorModal(h.app, h.manager, review.period, review.type, review);
	editor.onOpen();
	await h.manager.updatePeriodReview({ period: review.period, reviewId: review.id, sections: { ...sections, wins: "New win" } });
	editor.sections.summary = "Edited summary";
	await editor.submit();
	h.manager.clearAllCache();
	const saved = await h.manager.getPeriodReview(review.period, review.id);
	assert.equal(saved.sections.summary, "Edited summary");
	assert.equal(saved.sections.wins, "New win");
});

test("same-timestamp same-date check-ins retain insertion order across another save", async (t) => {
	const h = await setup();
	t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-05-01T12:00:00Z") });
	await h.checkIn("2026-05-01", 4);
	await h.checkIn("2026-05-01", 6);
	await h.checkIn("2026-05-01", 8);
	assert.deepEqual(h.read().keyResults[0].checkIns.map(item => [item.progress, item.delta]), [[80, 20], [60, 20], [40, 40]]);
	await h.checkIn("2026-04-01", 1);
	assert.equal(h.read().keyResults[0].current, 8);
	assert.deepEqual(h.read().keyResults[0].checkIns.filter(item => item.date === "2026-05-01").map(item => [item.progress, item.delta]), [[80, 20], [60, 20], [40, 30]]);
});

test("review snapshots reserve IDs even when the period has no rollover", async () => {
	const h = await setup();
	await h.manager.createPeriodReview({ period: "2026-Q2", type: "weekly", reviewDate: "2026-05-01", sections: { ...createEmptyReviewSections(), summary: "Summary", "next-steps": "Next" } });
	await h.manager.deleteObjective(h.objective.id, h.objective.period, true);
	const restarted = new OKRManager(h.app, { ...DEFAULT_SETTINGS });
	const created = await restarted.createObjective({ ...h.objective });
	assert.notEqual(created.id, h.objective.id);
});


test("failed rollover clears created files from caches so a retry can succeed", async () => {
	const h = await setup();
	const second = await h.manager.createObjective({ ...h.objective, title: "Second Objective" });
	const create = h.app.vault.create.bind(h.app.vault);
	let attempts = 0;
	h.app.vault.create = async (path, content) => {
		if (path.startsWith("OKR/2026-Q3/O") && ++attempts === 2) throw new Error("simulated failure");
		return create(path, content);
	};
	const input = { period: "2026-Q2", targetPeriod: "2026-Q3", selections: [{ objectiveId: h.objective.id, keyResultIds: [h.kr.id] }, { objectiveId: second.id, keyResultIds: [] }], allowMissingRetrospective: true };
	await assert.rejects(h.manager.closePeriod(input), /simulated failure/);
	assert.deepEqual(await h.manager.getObjectiveSummaries("2026-Q3"), []);
	h.app.vault.create = create;
	const result = await h.manager.closePeriod(input);
	assert.equal(result.createdObjectives.length, 2);
	assert.equal((await h.manager.getObjectiveSummaries("2026-Q3")).length, 2);
});


test("legacy records that cannot round trip are not removed during migration", async () => {
	const h = await setup();
	const fm = h.manager.getParser().parseFrontmatterContent(h.contents.get(h.file.path));
	fm["key-results"][0].checkIns = [{ id: "old", date: "May 1", progress: 20, delta: 20, note: "Keep this legacy note" }];
	const before = "---\n" + runtime.stringifyYaml(fm) + "---\n";
	h.contents.set(h.file.path, before);
	await assert.rejects(h.manager.updateObjective(h.objective.id, h.objective.period, { ...h.objective, title: "Renamed" }), /check-in/i);
	assert.equal(h.contents.get(h.file.path), before);
});
