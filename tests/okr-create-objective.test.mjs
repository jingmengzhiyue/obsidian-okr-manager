import test from "node:test";
import assert from "node:assert/strict";
import { runtime, createVault } from "./helpers/runtime.mjs";

const objective = { period: "2026-Q3", periodType: "quarter", title: "Plan", description: "", owner: "", status: "active", created: "2026-09-16", due: "2026-09-30" };
const draft = { title: "Result", description: "Notes", owner: "", unit: "number", weight: 0.05, current: 5, target: 10, confidence: "medium", due: "2026-10-10" };
function setup(autoComputeProgress = true) {
	const vault = createVault();
	return { ...vault, manager: new runtime.OKRManager(vault.app, { ...runtime.DEFAULT_SETTINGS, autoComputeProgress }) };
}
for (const count of [0, 1, 3]) test(`joint creation round trips ${count} KRs in one Objective file`, async () => {
	const h = setup();
	const result = await h.manager.createObjective(objective, Array.from({ length: count }, (_, i) => ({ ...draft, title: `KR ${i}` })));
	assert.equal(h.contents.size, 1);
	assert.equal(result.keyResults.length, count);
	h.manager.clearAllCache();
	const reread = (await h.manager.getObjectives(objective.period))[0];
	assert.deepEqual(reread.keyResults.map(kr => [kr.id, kr.objectiveId, kr.period, kr.order, kr.progress, kr.owner, kr.due, kr.weight]), Array.from({ length: count }, (_, i) => [`O1-KR${i + 1}`, "O1", objective.period, i, 50, "", draft.due, 0.05]));
	assert.equal(reread.progress, count ? 50 : 0);
});
test("invalid draft rejects the entire file before writing", async () => {
	for (const invalid of [{ target: 0 }, { weight: 0 }, { title: "" }, { due: "2026-02-30" }, { unit: "boolean", current: 2, target: 1 }]) {
		const h = setup();
		await assert.rejects(h.manager.createObjective(objective, [draft, { ...draft, ...invalid }]));
		assert.equal(h.contents.size, 0);
		assert.deepEqual(await h.manager.getObjectives(objective.period), []);
	}
});
test("write failure leaves no ghost and retry creates the complete object", async () => {
	const h = setup(); const create = h.app.vault.create;
	h.app.vault.create = async () => { throw new Error("disk full"); };
	await assert.rejects(h.manager.createObjective(objective, [draft]), /disk full/);
	assert.deepEqual(await h.manager.getObjectiveSummaries(objective.period), []);
	h.app.vault.create = create;
	const saved = await h.manager.createObjective(objective, [draft]);
	assert.equal(saved.id, "O1"); assert.equal(saved.keyResults.length, 1);
});
test("concurrent joint creates allocate unique IDs; manual progress starts at zero", async () => {
	const h = setup(false);
	const results = await Promise.all([h.manager.createObjective(objective, [draft]), h.manager.createObjective(objective, [draft])]);
	assert.equal(new Set(results.map(o => o.id)).size, 2);
	assert.equal(h.contents.size, 2);
	for (const result of results) { assert.equal(result.keyResults[0].progress, 0); assert.equal(result.progress, 0); }
});

test("joint creation respects read-only periods and snapshots before waiting for the lock", async () => {
	const h = setup();
	await h.manager.createObjective(objective);
	await h.manager.closePeriod({ period: objective.period, selections: [], allowUnfinishedWithoutRollover: true, allowMissingRetrospective: true });
	const before = new Map(h.contents);
	await assert.rejects(h.manager.createObjective(objective, [draft]), /read.only|closed/i);
	assert.deepEqual(h.contents, before);
	await h.manager.reopenPeriod(objective.period);
	const input = { ...objective }, krInput = { ...draft };
	const write = h.manager.createObjective(input, [krInput]);
	input.title = "Too late"; krInput.current = 100;
	const result = await write;
	assert.equal(result.title, objective.title);
	assert.equal(result.keyResults[0].current, draft.current);
});

test("joint creation preserves full KR fields and arbitrary positive relative weights", async () => {
	const h = setup();
	const drafts = [draft, { ...draft, title: "Boolean", unit: "boolean", current: 1, target: 1, weight: 2.5, owner: "Personal note", confidence: "high" }];
	const result = await h.manager.createObjective(objective, drafts);
	h.manager.clearAllCache();
	const saved = (await h.manager.getObjectives(objective.period))[0];
	for (const [index, kr] of saved.keyResults.entries()) {
		for (const [key, value] of Object.entries(drafts[index])) assert.equal(kr[key], value);
		assert.equal(kr.filePath, result.filePath);
		assert.equal(kr.created, objective.created);
		assert.equal(kr.periodType, objective.periodType);
		assert.equal(kr.status, "active");
		assert.deepEqual(kr.checkIns, []);
		assert.equal(kr.hasBlocker, false);
	}
	assert.equal(saved.keyResults[1].progress, 100);
});
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function emit(input, event = "input") { for (const listener of input.events[event] ?? []) listener({}); }
function input(modal, type, index = 0) { return modal.contentEl.all().filter(element => element.type === type)[index]; }
function enter(element, value, event = "input") { element.value = value; emit(element, event); }
function uiSetup({ initialPeriod, onComplete, createObjective, openLinkText, defaultPeriodType = "quarter" } = {}) {
 const parser = new runtime.FileParser(); parser.getCurrentPeriod = type => ({ quarter: "2026-Q3", month: "2026-09", year: "2026", week: "2026-W38" })[type];
 const calls = [];
 const manager = { getParser: () => parser, getSettings: () => ({ defaultPeriodType }), getI18n: () => ({ t: key => key }), createObjective: async (data, drafts) => { calls.push({ data, drafts }); return createObjective ? createObjective(data, drafts) : { ...data, filePath: "test.md" }; } };
 const app = { vault: { getAbstractFileByPath: () => new runtime.TFile("test.md") }, workspace: { openLinkText: openLinkText ?? (async () => {}) } };
 const modal = new runtime.NewObjectiveModal(app, manager, onComplete, initialPeriod); modal.onOpen();
 return { modal, calls, parser };
}
function fillObjective(modal) { enter(input(modal, "text", 1), "Objective"); }
function addDraft(modal, title = "KR") { modal.drafts.add(); const card = modal.drafts.cards.at(-1); enter(card.inputs.title, title); enter(card.inputs.targetValue, "10"); return card; }
function removeDraft(card) { emit(card.root.all().find(element => element.text === "modals.drafts.remove"), "click"); }
test("Objective modal honors dashboard period context and global default type", () => {
 const contextual = uiSetup({ initialPeriod: "2027-02" }).modal; assert.equal(contextual.period, "2027-02"); assert.equal(contextual.periodType, "month"); assert.equal(contextual.due, "2027-02-28");
 const global = uiSetup({ defaultPeriodType: "year" }).modal; assert.equal(global.period, "2026"); assert.equal(global.periodType, "year"); assert.equal(global.due, "2026-12-31");
});
test("manual Objective due including cleared value survives period changes and reset resumes following", () => {
 const { modal } = uiSetup({ initialPeriod: "2026-Q3" }); const period = input(modal, "text"), due = input(modal, "date");
 enter(due, "2027-01-12", "change"); enter(period, "2026-Q4"); assert.equal(due.value, "2027-01-12");
 enter(due, ""); enter(period, "2027-Q1"); assert.equal(due.value, "");
 const type = modal.contentEl.all().find(element => element.tag === "select"); enter(type, "month", "change"); assert.equal(due.value, "");
 emit(modal.contentEl.all().find(element => element.text === "modals.newObjective.resetDue"), "click"); assert.equal(due.value, "2026-09-30"); enter(period, "2026-10"); assert.equal(due.value, "2026-10-31");
});
test("Objective optional drafts are in memory; empty draft blocks and removing all permits Objective only", async () => {
 const { modal, calls } = uiSetup(); fillObjective(modal); assert.equal(modal.validate(), true); assert.equal(modal.drafts.snapshot().length, 0);
 modal.drafts.add(); assert.equal(modal.validate(), false); await modal.submit(); assert.equal(calls.length, 0);
 removeDraft(modal.drafts.cards[0]); assert.equal(modal.validate(), true); await modal.submit(); assert.equal(calls.length, 1); assert.deepEqual(calls[0].drafts, []);
});
test("draft inheritance respects overrides and clearing; removing middle card preserves identities and contents", () => {
 const { modal, calls } = uiSetup(); fillObjective(modal); const a = addDraft(modal, "A"), b = addDraft(modal, "B"), c = addDraft(modal, "C");
 enter(a.inputs.owner, ""); enter(a.inputs.dueDate, "2027-01-02"); enter(input(modal, "text", 2), "Parent"); enter(input(modal, "date"), "2026-11-15");
 assert.equal(a.inputs.owner.value, ""); assert.equal(a.inputs.dueDate.value, "2027-01-02"); assert.equal(c.inputs.owner.value, "Parent"); assert.equal(c.inputs.dueDate.value, "2026-11-15");
 const before = modal.drafts.snapshot(); removeDraft(b); assert.deepEqual(modal.drafts.cards.map(card => card.id), [a.id, c.id]); assert.deepEqual(modal.drafts.snapshot(), [before[0], before[2]]); assert.equal(c.summary.ownerDocument.activeElement, c.summary); assert.equal(calls.length, 0);
 enter(c.inputs.dueDate, ""); enter(input(modal, "date"), "2026-12-01"); assert.equal(c.inputs.dueDate.value, ""); assert.equal(modal.validate(), false);
});
test("cancelling Objective creation discards all drafts and fields when reopened", () => {
 const { modal, calls } = uiSetup(); fillObjective(modal); addDraft(modal); emit(modal.contentEl.all().find(element => element.cls === "okr-btn-cancel"), "click"); assert.equal(calls.length, 0); modal.onOpen(); assert.deepEqual(modal.drafts.snapshot(), []); assert.equal(modal.title, ""); assert.equal(modal.owner, "");
});
test("joint modal snapshots multiple drafts once and blocks double submit and cancelling a write", async () => {
 const gate = deferred(); let navigations = 0, completions = 0;
 const { modal, calls } = uiSetup({ createObjective: async data => { await gate.promise; return { ...data, filePath: "test.md" }; }, openLinkText: async () => { navigations++; }, onComplete: async () => { completions++; } });
 fillObjective(modal); addDraft(modal, "A"); addDraft(modal, "B"); const save = modal.submit(); await modal.submit(); modal.close(); assert.equal(modal.active, true); assert.equal(calls.length, 1); assert.equal(calls[0].drafts.length, 2); assert.equal(modal.contentEl.all().filter(el => ["input", "button", "select", "textarea"].includes(el.tag)).every(el => el.disabled), true);
 gate.resolve(); await save; assert.equal(modal.active, false); assert.equal(navigations, 1); assert.equal(completions, 1); assert.equal(calls[0].data.owner, "");
});
test("joint modal write failure preserves fields and drafts for retry", async () => {
 let fail = true; const { modal, calls } = uiSetup({ createObjective: async data => { if (fail) throw Error("disk"); return { ...data, filePath: "test.md" }; } }); fillObjective(modal); addDraft(modal, "Kept"); await modal.submit(); assert.equal(modal.validate(), true); assert.equal(modal.title, "Objective"); assert.equal(modal.drafts.snapshot()[0].title, "Kept"); fail = false; await modal.submit(); assert.equal(calls.length, 2); assert.equal(modal.saved, true);
});
for (const failure of ["navigation", "sync callback", "async callback"]) test(`joint modal ${failure} failure after persistence never permits duplicate creation`, async () => {
 const { modal, calls } = uiSetup({ openLinkText: failure === "navigation" ? async () => { throw Error("navigation"); } : undefined, onComplete: failure === "sync callback" ? () => { throw Error("sync"); } : failure === "async callback" ? async () => { throw Error("async"); } : undefined }); fillObjective(modal); addDraft(modal); await modal.submit(); await modal.submit(); assert.equal(calls.length, 1); assert.equal(modal.saved, true); assert.equal(modal.active, false);
});
