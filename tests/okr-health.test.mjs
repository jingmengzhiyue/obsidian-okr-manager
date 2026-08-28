import test from "node:test";
import assert from "node:assert/strict";

const healthModule = await import("../src/utils/health.ts");
const parserModule = await import("../src/manager/FileParser.ts");
const {
	calculateExpectedProgress,
	calculateKeyResultHealth,
	calculateObjectiveHealth,
	calculateObjectiveProgress,
	getNormalizedKeyResultWeight,
} = healthModule.default ?? healthModule;
const { FileParser } = parserModule.default ?? parserModule;

function keyResult(overrides = {}) {
	return {
		id: "O1-KR1",
		objectiveId: "O1",
		period: "2026-Q1",
		periodType: "quarter",
		order: 0,
		title: "Weighted result",
		description: "",
		owner: "Team",
		unit: "number",
		weight: 1,
		current: 40,
		target: 100,
		progress: 40,
		status: "active",
		confidence: "medium",
		created: "2026-01-01",
		due: "2026-01-11",
		filePath: "OKR/2026-Q1/O1.md",
		checkIns: [],
		hasBlocker: false,
		...overrides,
	};
}

function objective(keyResults, overrides = {}) {
	return {
		id: "O1",
		period: "2026-Q1",
		periodType: "quarter",
		title: "Objective",
		description: "",
		owner: "Team",
		status: "active",
		progress: calculateObjectiveProgress(keyResults),
		created: "2026-01-01",
		due: "2026-01-11",
		filePath: "OKR/2026-Q1/O1.md",
		keyResults,
		...overrides,
	};
}

test("objective progress uses relative KR weights and excludes cancelled KRs", () => {
	const keyResults = [
		keyResult({ progress: 20, weight: 2 }),
		keyResult({ id: "O1-KR2", progress: 80, weight: 1 }),
		keyResult({ id: "O1-KR3", progress: 100, weight: 10, status: "cancelled" }),
	];
	assert.equal(calculateObjectiveProgress(keyResults), 40);
	assert.equal(getNormalizedKeyResultWeight(keyResults[0], keyResults), 66.7);
	assert.equal(getNormalizedKeyResultWeight(keyResults[1], keyResults), 33.3);
	assert.equal(getNormalizedKeyResultWeight(keyResults[2], keyResults), 0);
});

test("missing in-memory weights remain compatible as relative weight one", () => {
	assert.equal(
		calculateObjectiveProgress([
			keyResult({ progress: 20, weight: undefined }),
			keyResult({ id: "O1-KR2", progress: 80, weight: undefined }),
		]),
		50,
	);
});

test("expected progress follows the created-to-due linear schedule", () => {
	assert.equal(calculateExpectedProgress("2026-01-01", "2026-01-11", "2025-12-31"), 0);
	assert.equal(calculateExpectedProgress("2026-01-01", "2026-01-11", "2026-01-06"), 50);
	assert.equal(calculateExpectedProgress("2026-01-01", "2026-01-11", "2026-01-12"), 100);
	assert.equal(calculateExpectedProgress("invalid", "2026-01-11", "2026-01-06"), null);
});

test("KR health deducts schedule, confidence, blocker, and on-hold penalties", () => {
	assert.deepEqual(calculateKeyResultHealth(keyResult(), "2026-01-06"), {
		score: 85,
		status: "on-track",
		expectedProgress: 50,
		reasons: ["behind-schedule", "medium-confidence"],
	});
	const risky = calculateKeyResultHealth(
		keyResult({ confidence: "low", hasBlocker: true, status: "on-hold" }),
		"2026-01-06",
	);
	assert.equal(risky.score, 30);
	assert.equal(risky.status, "off-track");
	assert.deepEqual(risky.reasons, [
		"behind-schedule",
		"low-confidence",
		"blocked",
		"on-hold",
	]);
});

test("completed, cancelled, and overdue KRs receive explicit health states", () => {
	assert.equal(
		calculateKeyResultHealth(keyResult({ status: "completed" }), "2026-01-06").score,
		100,
	);
	assert.equal(
		calculateKeyResultHealth(keyResult({ status: "cancelled" }), "2026-01-06").status,
		"not-applicable",
	);
	const overdue = calculateKeyResultHealth(
		keyResult({ progress: 99, confidence: "high" }),
		"2026-01-12",
	);
	assert.equal(overdue.score, 59);
	assert.equal(overdue.status, "off-track");
	assert.ok(overdue.reasons.includes("overdue"));
});

test("objective health aggregates KR health with the same relative weights", () => {
	const keyResults = [
		keyResult({ progress: 50, weight: 3, confidence: "high" }),
		keyResult({ id: "O1-KR2", progress: 0, weight: 1, confidence: "low", hasBlocker: true }),
	];
	const health = calculateObjectiveHealth(objective(keyResults), "2026-01-06");
	assert.equal(health.score, 79);
	assert.equal(health.status, "at-risk");
	assert.ok(health.reasons.includes("blocked"));
});

test("objective parser defaults missing weights and rejects explicit invalid weights", () => {
	const parser = new FileParser({});
	const base = objective([keyResult()]);
	const frontmatter = parser.buildObjectiveFrontmatter(base);
	delete frontmatter["key-results"][0].weight;
	assert.equal(
		parser.parseObjective({ path: base.filePath }, frontmatter).keyResults[0].weight,
		1,
	);
	frontmatter["key-results"][0].weight = 0;
	assert.throws(
		() => parser.parseObjective({ path: base.filePath }, frontmatter),
		/Invalid Key Result weight.*OKR\/2026-Q1\/O1\.md/,
	);
});
