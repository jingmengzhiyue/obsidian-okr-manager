import test from "node:test";
import assert from "node:assert/strict";

const repositoryModule = await import("../src/manager/ReviewRepository.ts");
const managerModule = await import("../src/manager/OKRManager.ts");
const parserModule = await import("../src/manager/FileParser.ts");
const reviewUtilsModule = await import("../src/utils/review.ts");
const typesModule = await import("../src/types.ts");
const i18nModule = await import("../src/i18n/index.ts");

const { ReviewRepository } = repositoryModule.default ?? repositoryModule;
const { OKRManager } = managerModule.default ?? managerModule;
const { FileParser } = parserModule.default ?? parserModule;
const {
	createEmptyReviewSections,
	getReviewFileName,
	hasRequiredReviewContent,
	isValidPeriodReviewType,
} = reviewUtilsModule.default ?? reviewUtilsModule;
const { DEFAULT_SETTINGS } = typesModule.default ?? typesModule;
const { createI18n } = i18nModule.default ?? i18nModule;

function sections(type = "weekly") {
	const values = createEmptyReviewSections();
	values.summary = "Clear summary";
	if (type === "weekly") {
		values.wins = "Shipped the first milestone";
		values.blockers = "No external blocker";
		values["next-steps"] = "Validate with users";
	} else if (type === "mid-cycle") {
		values.achievements = "Reached the midpoint";
		values.risks = "Capacity";
		values.adjustments = "Reduce scope";
		values.decisions = "Keep the due date";
	} else {
		values.outcomes = "Delivered the core workflow";
		values.worked = "Small iterations";
		values["did-not-work"] = "Late validation";
		values.lessons = "Validate earlier";
		values["follow-ups"] = "Schedule the next experiment";
	}
	return values;
}

function health(score = 90, status = "on-track") {
	return {
		score,
		status,
		expectedProgress: 50,
		reasons: score < 80 ? ["behind-schedule"] : [],
	};
}

function snapshot() {
	return {
		capturedAt: "2026-05-15T09:00:00.000Z",
		objectives: [
			{
				id: "O1",
				title: "Launch review workflows",
				status: "active",
				progress: 45,
				health: health(75, "at-risk"),
				keyResults: [
					{
						id: "O1-KR1",
						title: "Ship repository",
						status: "active",
						weight: 2,
						normalizedWeight: 66.7,
						progress: 50,
						health: health(),
					},
				],
			},
		],
	};
}

function review(overrides = {}) {
	return {
		id: "123e4567-e89b-42d3-a456-426614174000",
		period: "2026-Q2",
		periodType: "quarter",
		type: "weekly",
		reviewDate: "2026-05-15",
		createdAt: "2026-05-15T09:00:00.000Z",
		updatedAt: "2026-05-15T09:00:00.000Z",
		filePath: "OKR/2026-Q2/Reviews/weekly-2026-05-15.md",
		sections: sections(),
		snapshot: snapshot(),
		...overrides,
	};
}

function repository() {
	const app = { vault: {} };
	return new ReviewRepository(app, DEFAULT_SETTINGS, new FileParser(app));
}

test("review file names enforce weekly dates and singleton type names", () => {
	assert.equal(getReviewFileName("weekly", "2026-05-15"), "weekly-2026-05-15.md");
	assert.equal(getReviewFileName("mid-cycle", "2026-05-15"), "mid-cycle.md");
	assert.equal(getReviewFileName("retrospective", "2026-05-15"), "retrospective.md");
});

test("review required fields differ by workflow type", () => {
	assert.equal(isValidPeriodReviewType("weekly"), true);
	assert.equal(isValidPeriodReviewType("invalid"), false);
	assert.equal(hasRequiredReviewContent("weekly", sections("weekly")), true);
	assert.equal(hasRequiredReviewContent("mid-cycle", sections("mid-cycle")), true);
	assert.equal(hasRequiredReviewContent("retrospective", sections("retrospective")), true);
	const incomplete = sections("retrospective");
	incomplete.lessons = "";
	assert.equal(hasRequiredReviewContent("retrospective", incomplete), false);
});

test("manager rejects an invalid review type at its public boundary", async () => {
	const manager = new OKRManager({}, DEFAULT_SETTINGS, createI18n("en"));
	await assert.rejects(
		manager.createPeriodReview({
			period: "2026-Q2",
			type: "invalid",
			reviewDate: "2026-05-15",
			sections: sections(),
		}),
		/invalid/i,
	);
});

test("review metadata, snapshot, and managed sections round-trip", () => {
	const repo = repository();
	const source = review();
	const frontmatter = repo.serializeReview(source);
	const content = [
		"# Weekly review",
		"<!-- OKR-REVIEW-SNAPSHOT-START -->",
		repo.buildSnapshotBlock(source.snapshot),
		"<!-- OKR-REVIEW-SNAPSHOT-END -->",
		"<!-- OKR-REVIEW-CONTENT-START -->",
		repo.buildSectionsBlock(source.type, source.sections),
		"<!-- OKR-REVIEW-CONTENT-END -->",
	].join("\n");
	const parsed = repo.parseReview(
		frontmatter,
		content,
		source.filePath,
		source.period,
	);
	assert.equal(parsed.type, "weekly");
	assert.equal(parsed.sections.summary, "Clear summary");
	assert.deepEqual(parsed.snapshot, source.snapshot);
	assert.match(content, /\| O1-KR1 Ship repository \| 2 \(66\.7%\)/);
});

test("updating a review preserves its immutable snapshot and custom Markdown", () => {
	const repo = repository();
	const source = review();
	const originalBlock = repo.buildSectionsBlock(source.type, source.sections);
	const withCustomText = [
		"# Weekly review",
		"<!-- OKR-REVIEW-CONTENT-START -->",
		originalBlock,
		"<!-- OKR-REVIEW-CONTENT-END -->",
		"",
		"## Personal notes",
		"",
		"Keep this paragraph.",
	].join("\n");
	const nextSections = sections();
	nextSections.summary = "Updated summary";
	const updated = repo.replaceManagedBlock(
		withCustomText,
		"<!-- OKR-REVIEW-CONTENT-START -->",
		"<!-- OKR-REVIEW-CONTENT-END -->",
		repo.buildSectionsBlock(source.type, nextSections),
	);
	const parsed = repo.parseReview(
		repo.serializeReview(source),
		updated,
		source.filePath,
		source.period,
	);
	assert.equal(parsed.sections.summary, "Updated summary");
	assert.deepEqual(parsed.snapshot, source.snapshot);
	assert.match(updated, /Keep this paragraph\./);
});

test("repository rejects duplicate weekly dates and singleton reviews", async () => {
	const repo = repository();
	repo.listReviews = async () => [review()];
	await assert.rejects(
		repo.createReview(review()),
		/already exists/,
	);
	repo.listReviews = async () => [
		review({ type: "mid-cycle", filePath: "OKR/2026-Q2/Reviews/mid-cycle.md" }),
	];
	await assert.rejects(
		repo.createReview(review({ type: "mid-cycle", sections: sections("mid-cycle") })),
		/already exists/,
	);
});

test("manager captures a snapshot only when a review is created", async () => {
	const manager = new OKRManager({}, DEFAULT_SETTINGS, createI18n("en"));
	manager.assertPeriodWritable = async () => {};
	manager.getPeriodInfo = async () => ({
		period: "2026-Q2",
		periodType: "quarter",
		status: "open",
		createdAt: "",
		rollovers: [],
	});
	manager.getObjectiveSummaries = async () => [
		{
			id: "O1",
			period: "2026-Q2",
			periodType: "quarter",
			title: "Objective",
			description: "",
			owner: "Team",
			status: "active",
			progress: 50,
			created: "2026-04-01",
			due: "2026-06-30",
			filePath: "OKR/2026-Q2/O1.md",
			keyResults: [],
		},
	];
	let createdInput;
	manager.reviewRepository.createReview = async (input) => {
		createdInput = input;
		return { ...input, filePath: "OKR/2026-Q2/Reviews/weekly-2026-05-15.md" };
	};
	const created = await manager.createPeriodReview({
		period: "2026-Q2",
		type: "weekly",
		reviewDate: "2026-05-15",
		sections: sections(),
	});
	assert.equal(created.snapshot.objectives[0].id, "O1");
	assert.equal(createdInput.snapshot, created.snapshot);
});

test("review mutations reject read-only periods", async () => {
	const manager = new OKRManager({}, DEFAULT_SETTINGS, createI18n("en"));
	manager.assertPeriodWritable = async () => {
		throw new Error("read-only");
	};
	await assert.rejects(
		manager.createPeriodReview({
			period: "2026-Q2",
			type: "weekly",
			reviewDate: "2026-05-15",
			sections: sections(),
		}),
		/read-only/,
	);
});

test("closing a period without a retrospective requires explicit authorization", async () => {
	const manager = new OKRManager({}, DEFAULT_SETTINGS, createI18n("en"));
	manager.getPeriodInfo = async () => ({
		period: "2026-Q2",
		periodType: "quarter",
		status: "open",
		createdAt: "",
		rollovers: [],
	});
	manager.hasPeriodReview = async () => false;
	manager.getRolloverCandidates = async () => [];
	await assert.rejects(
		manager.closePeriod({ period: "2026-Q2", selections: [] }),
		/retrospective/i,
	);
});
