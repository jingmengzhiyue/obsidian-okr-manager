import test from "node:test";
import assert from "node:assert/strict";

const helperModule = await import("../src/utils/editConflict.ts");
const repositoryModule = await import("../src/manager/ReviewRepository.ts");
const { getEditPatch, EditConflictError } = helperModule.default ?? helperModule;
const { ReviewRepository } = repositoryModule.default ?? repositoryModule;

test("saving an old title edit preserves newer progress and confidence", () => {
	const base = { title: "Original", current: 40, progress: 40, confidence: "medium" };
	const latest = { ...base, current: 80, progress: 80, confidence: "high" };
	const desired = { ...base, title: "Renamed" };
	assert.deepEqual({ ...latest, ...getEditPatch(base, latest, desired) }, {
		...latest,
		title: "Renamed",
	});
});

test("concurrent edits of the same field fail without mutating either version", () => {
	const base = { title: "Original", due: "2026-06-01" };
	const latest = { ...base, due: "2026-08-01" };
	assert.throws(
		() => getEditPatch(base, latest, { ...base, due: "2026-07-01" }),
		(error) => error instanceof EditConflictError && error.fields[0] === "due",
	);
	assert.equal(latest.due, "2026-08-01");
	assert.equal(base.due, "2026-06-01");
});

test("independent review sections merge and identical concurrent edits are accepted", () => {
	const base = { summary: "Original", wins: "Initial" };
	const latest = { ...base, summary: "New summary" };
	assert.deepEqual({ ...latest, ...getEditPatch(base, latest, { ...base, wins: "New win" }) }, {
		summary: "New summary",
		wins: "New win",
	});
	assert.deepEqual(getEditPatch(base, latest, { summary: "New summary" }), {
		summary: "New summary",
	});
});

test("review managed blocks preserve literal replacement tokens and surrounding text", () => {
	const repository = new ReviewRepository({}, {}, {});
	const start = "<!-- OKR-REVIEW-CONTENT-START -->";
	const end = "<!-- OKR-REVIEW-CONTENT-END -->";
	const body = `Before\n${start}\nOriginal\n${end}\nAfter`;
	const text = "Literal $& and $' and $` and $$ and $1";
	assert.equal(repository.replaceManagedBlock(body, start, end, text),
		`Before\n${start}\n${text}\n${end}\nAfter`);
});
