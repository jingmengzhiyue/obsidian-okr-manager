import type {
	HealthAssessment,
	HealthReason,
	KeyResult,
	Objective,
} from "../types";
import { diffLocalDates, getTodayLocalDate } from "./date";

const CONFIDENCE_PENALTY = {
	high: 0,
	medium: 5,
	low: 15,
} as const;

function clampScore(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}
	return Math.max(0, Math.min(100, Math.round(value)));
}

function getEffectiveWeight(keyResult: KeyResult): number {
	return Number.isFinite(keyResult.weight) && keyResult.weight > 0
		? keyResult.weight
		: 1;
}

function getHealthStatus(score: number): HealthAssessment["status"] {
	if (score >= 80) {
		return "on-track";
	}
	return score >= 60 ? "at-risk" : "off-track";
}

export function calculateExpectedProgress(
	created: string,
	due: string,
	asOf = getTodayLocalDate(),
): number | null {
	const totalDays = diffLocalDates(due, created);
	const elapsedDays = diffLocalDates(asOf, created);
	if (totalDays == null || elapsedDays == null || totalDays < 0) {
		return null;
	}
	if (totalDays === 0) {
		return elapsedDays < 0 ? 0 : 100;
	}
	const elapsed = Math.max(0, Math.min(totalDays, elapsedDays));
	return clampScore((elapsed / totalDays) * 100);
}

export function calculateKeyResultHealth(
	keyResult: KeyResult,
	asOf = getTodayLocalDate(),
): HealthAssessment {
	if (keyResult.status === "cancelled") {
		return {
			score: null,
			status: "not-applicable",
			expectedProgress: null,
			reasons: [],
		};
	}
	if (keyResult.status === "completed") {
		return {
			score: 100,
			status: "on-track",
			expectedProgress: 100,
			reasons: [],
		};
	}

	const expectedProgress = calculateExpectedProgress(
		keyResult.created,
		keyResult.due,
		asOf,
	);
	const reasons: HealthReason[] = [];
	const schedulePenalty =
		expectedProgress == null
			? 0
			: Math.max(0, expectedProgress - keyResult.progress);
	if (schedulePenalty > 0) {
		reasons.push("behind-schedule");
	}
	const confidencePenalty = CONFIDENCE_PENALTY[keyResult.confidence];
	if (keyResult.confidence === "medium") {
		reasons.push("medium-confidence");
	} else if (keyResult.confidence === "low") {
		reasons.push("low-confidence");
	}
	const blockerPenalty = keyResult.hasBlocker ? 20 : 0;
	if (keyResult.hasBlocker) {
		reasons.push("blocked");
	}
	const onHoldPenalty = keyResult.status === "on-hold" ? 25 : 0;
	if (keyResult.status === "on-hold") {
		reasons.push("on-hold");
	}

	let score = clampScore(
		100 - schedulePenalty - confidencePenalty - blockerPenalty - onHoldPenalty,
	);
	if (keyResult.status === "on-hold") {
		score = Math.min(score, 79);
	}
	const daysUntilDue = diffLocalDates(keyResult.due, asOf);
	if (daysUntilDue != null && daysUntilDue < 0 && keyResult.progress < 100) {
		score = Math.min(score, 59);
		reasons.push("overdue");
	}

	return {
		score,
		status: getHealthStatus(score),
		expectedProgress,
		reasons: [...new Set(reasons)],
	};
}

export function calculateObjectiveProgress(keyResults: KeyResult[]): number {
	const eligible = keyResults.filter(
		(keyResult) => keyResult.status !== "cancelled",
	);
	const totalWeight = eligible.reduce(
		(sum, keyResult) => sum + getEffectiveWeight(keyResult),
		0,
	);
	if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
		return 0;
	}
	return clampScore(
		eligible.reduce(
			(sum, keyResult) =>
				sum + clampScore(keyResult.progress) * getEffectiveWeight(keyResult),
			0,
		) / totalWeight,
	);
}

export function getNormalizedKeyResultWeight(
	keyResult: KeyResult,
	keyResults: KeyResult[],
): number {
	const eligible = keyResults.filter(
		(item) => item.status !== "cancelled",
	);
	const totalWeight = eligible.reduce(
		(sum, item) => sum + getEffectiveWeight(item),
		0,
	);
	if (
		keyResult.status === "cancelled" ||
		!Number.isFinite(totalWeight) ||
		totalWeight <= 0
	) {
		return 0;
	}
	return Math.round((getEffectiveWeight(keyResult) / totalWeight) * 1000) / 10;
}

export function calculateObjectiveHealth(
	objective: Objective,
	asOf = getTodayLocalDate(),
): HealthAssessment {
	if (objective.status === "cancelled") {
		return {
			score: null,
			status: "not-applicable",
			expectedProgress: null,
			reasons: [],
		};
	}
	if (objective.status === "completed") {
		return {
			score: 100,
			status: "on-track",
			expectedProgress: 100,
			reasons: [],
		};
	}

	const eligible = objective.keyResults
		.map((keyResult) => ({
			keyResult,
			health: calculateKeyResultHealth(keyResult, asOf),
		}))
		.filter(
			(item) =>
				item.health.score != null &&
				item.keyResult.status !== "cancelled",
		);
	const totalWeight = eligible.reduce(
		(sum, item) => sum + getEffectiveWeight(item.keyResult),
		0,
	);
	if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
		return {
			score: null,
			status: "not-applicable",
			expectedProgress: null,
			reasons: [],
		};
	}

	let score = clampScore(
		eligible.reduce(
			(sum, item) =>
				sum + item.health.score! * getEffectiveWeight(item.keyResult),
			0,
		) / totalWeight,
	);
	const expectedProgress = clampScore(
		eligible.reduce(
			(sum, item) =>
				sum +
				(item.health.expectedProgress ?? item.keyResult.progress) *
					getEffectiveWeight(item.keyResult),
			0,
		) / totalWeight,
	);
	const reasons = [...new Set(eligible.flatMap((item) => item.health.reasons))];
	if (objective.status === "on-hold") {
		score = Math.min(score, 79);
		reasons.push("on-hold");
	}
	const daysUntilDue = diffLocalDates(objective.due, asOf);
	if (daysUntilDue != null && daysUntilDue < 0 && objective.progress < 100) {
		score = Math.min(score, 59);
		reasons.push("overdue");
	}

	return {
		score,
		status: getHealthStatus(score),
		expectedProgress,
		reasons: [...new Set(reasons)],
	};
}
