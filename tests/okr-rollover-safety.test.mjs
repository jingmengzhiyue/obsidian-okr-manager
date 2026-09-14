import test from "node:test";
import assert from "node:assert/strict";
const module = await import("../src/utils/period.ts");
const { getIncompleteObjectives } = module.default ?? module;

function objective(keyResults) {
	return { id: "O1", status: "active", keyResults };
}
function kr(id, overrides = {}) {
	return { id, status: "active", unit: "number", current: 40, target: 100, progress: 40, ...overrides };
}

test("automatic rollover compares raw values rather than rounded display progress", () => {
	const source = objective([kr("O1-KR1", { current: 199, target: 200, progress: 100 })]);
	assert.equal(getIncompleteObjectives([source], new Set(), true).length, 1);
	assert.equal(getIncompleteObjectives([source], new Set(), false).length, 0);
	assert.equal(getIncompleteObjectives([objective([kr("O1-KR1", { current: 200, target: 200, progress: 100 })])], new Set(), true).length, 0);
});

test("partial rollover leaves unselected and newly added KRs eligible", () => {
	const source = objective([kr("O1-KR1"), kr("O1-KR2"), kr("O1-KR3")]);
	const candidates = getIncompleteObjectives([source], new Set(), true, new Set(["O1-KR1"]));
	assert.deepEqual(candidates[0].keyResults.map(item => item.id), ["O1-KR2", "O1-KR3"]);
	assert.equal(getIncompleteObjectives([source], new Set(), true, new Set(source.keyResults.map(item => item.id))).length, 0);
});


test("rerendering close selections after writing a review preserves checked and disabled states", async () => {
	const { runtime } = await import("./helpers/runtime.mjs");
	const modal = new runtime.ClosePeriodModal({}, { getI18n: () => ({ t: key => key }) }, "2026-Q2");
	const checkboxes = () => modal.contentEl.all().filter(element => element.type === "checkbox");
	modal.candidates = [{ objective: objective([]), keyResults: [kr("O1-KR1"), kr("O1-KR2")] }];
	modal.hasRetrospective = true;
	modal.selectedObjectives.add("O1");
	modal.selectedKeyResults.add("O1-KR1");
	modal.selectedKeyResults.add("O1-KR2");
	modal.renderForm();
	let [parent, first] = checkboxes();
	first.checked = false;
	first.events.change.forEach(handler => handler());
	parent.checked = false;
	parent.events.change.forEach(handler => handler());
	modal.renderForm();
	let boxes = checkboxes();
	assert.deepEqual(boxes.map(box => box.checked), [false, false, true]);
	assert.deepEqual(boxes.map(box => box.disabled), [false, true, true]);
	assert.deepEqual(modal.buildSelections(), []);
	boxes[0].checked = true;
	boxes[0].events.change.forEach(handler => handler());
	assert.deepEqual(modal.buildSelections(), [{ objectiveId: "O1", keyResultIds: ["O1-KR2"] }]);
});
