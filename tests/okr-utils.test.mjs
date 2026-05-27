import test from "node:test";
import assert from "node:assert/strict";

const sortModule = await import("../src/utils/sort.ts");
const objectiveStatusModule = await import("../src/utils/objectiveStatus.ts");
const i18nModule = await import("../src/i18n/index.ts");
const typesModule = await import("../src/types.ts");

const { normalizeKeyResultOrders, reorderKeyResultOrders } =
	sortModule.default ?? sortModule;
const { getObjectiveDeadlineState } =
	objectiveStatusModule.default ?? objectiveStatusModule;
const { createI18n, resolveLocale } = i18nModule.default ?? i18nModule;
const { DEFAULT_SETTINGS } = typesModule.default ?? typesModule;

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
