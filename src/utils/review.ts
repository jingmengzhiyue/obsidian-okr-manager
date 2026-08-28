import type {
	PeriodReviewType,
	ReviewSectionKey,
	ReviewSections,
} from "../types";

const ALL_SECTION_KEYS: ReviewSectionKey[] = [
	"summary",
	"wins",
	"blockers",
	"next-steps",
	"achievements",
	"risks",
	"adjustments",
	"decisions",
	"outcomes",
	"worked",
	"did-not-work",
	"lessons",
	"follow-ups",
];

const REVIEW_SECTION_KEYS: Record<PeriodReviewType, ReviewSectionKey[]> = {
	weekly: ["summary", "wins", "blockers", "next-steps"],
	"mid-cycle": [
		"summary",
		"achievements",
		"risks",
		"adjustments",
		"decisions",
	],
	retrospective: [
		"summary",
		"outcomes",
		"worked",
		"did-not-work",
		"lessons",
		"follow-ups",
	],
};

const REVIEW_TYPES = new Set<PeriodReviewType>([
	"weekly",
	"mid-cycle",
	"retrospective",
]);

const SECTION_TITLES: Record<ReviewSectionKey, string> = {
	summary: "Summary",
	wins: "Wins",
	blockers: "Blockers",
	"next-steps": "Next steps",
	achievements: "Achievements",
	risks: "Risks",
	adjustments: "Adjustments",
	decisions: "Decisions",
	outcomes: "Outcomes",
	worked: "What worked",
	"did-not-work": "What did not work",
	lessons: "Lessons",
	"follow-ups": "Follow-ups",
};

export function createEmptyReviewSections(): ReviewSections {
	return Object.fromEntries(ALL_SECTION_KEYS.map((key) => [key, ""])) as ReviewSections;
}

export function isValidPeriodReviewType(
	value: unknown,
): value is PeriodReviewType {
	return typeof value === "string" && REVIEW_TYPES.has(value as PeriodReviewType);
}

export function getReviewSectionKeys(
	type: PeriodReviewType,
): ReviewSectionKey[] {
	return [...REVIEW_SECTION_KEYS[type]];
}

export function getReviewSectionTitle(key: ReviewSectionKey): string {
	return SECTION_TITLES[key];
}

export function getReviewFileName(
	type: PeriodReviewType,
	reviewDate: string,
): string {
	return type === "weekly" ? `weekly-${reviewDate}.md` : `${type}.md`;
}

export function hasRequiredReviewContent(
	type: PeriodReviewType,
	sections: ReviewSections,
): boolean {
	const required: ReviewSectionKey[] =
		type === "weekly"
			? ["summary", "next-steps"]
			: type === "mid-cycle"
				? ["summary", "decisions"]
				: ["summary", "lessons", "follow-ups"];
	return required.every(
		(key) =>
			typeof sections[key] === "string" && sections[key].trim().length > 0,
	);
}
