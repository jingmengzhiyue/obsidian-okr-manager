import {
	MONTH_PERIOD_PATTERN,
	QUARTER_PERIOD_PATTERN,
	WEEK_PERIOD_PATTERN,
	YEAR_PERIOD_PATTERN,
} from "../constants";
import type {
	KeyResult,
	Objective,
	OKRPeriodType,
	RolloverCandidate,
} from "../types";

export function getNextPeriod(
	period: string,
	periodType: OKRPeriodType,
): string | null {
	switch (periodType) {
		case "week": {
			if (!WEEK_PERIOD_PATTERN.test(period)) {
				return null;
			}
			const [yearText, weekText] = period.split("-W");
			const year = Number(yearText);
			const week = Number(weekText);
			const januaryFourth = new Date(Date.UTC(year, 0, 4));
			const januaryFourthDay = januaryFourth.getUTCDay() || 7;
			const monday = new Date(
				Date.UTC(year, 0, 4 - (januaryFourthDay - 1) + (week - 1) * 7),
			);
			monday.setUTCDate(monday.getUTCDate() + 7);
			return formatIsoWeek(monday);
		}
		case "month": {
			if (!MONTH_PERIOD_PATTERN.test(period)) {
				return null;
			}
			const [yearText, monthText] = period.split("-");
			const next = new Date(Date.UTC(Number(yearText), Number(monthText), 1));
			return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
		}
		case "quarter": {
			if (!QUARTER_PERIOD_PATTERN.test(period)) {
				return null;
			}
			const [yearText, quarterText] = period.split("-Q");
			const year = Number(yearText);
			const quarter = Number(quarterText);
			return quarter === 4 ? `${year + 1}-Q1` : `${year}-Q${quarter + 1}`;
		}
		case "year":
			return YEAR_PERIOD_PATTERN.test(period) ? String(Number(period) + 1) : null;
	}
}

export function isIncompleteKeyResult(keyResult: KeyResult): boolean {
	return (
		(keyResult.status === "active" || keyResult.status === "on-hold") &&
		keyResult.progress < 100
	);
}

export function getIncompleteObjectives(
	objectives: Objective[],
	alreadyRolledObjectiveIds: ReadonlySet<string> = new Set(),
): RolloverCandidate[] {
	return objectives.flatMap((objective) => {
		if (
			alreadyRolledObjectiveIds.has(objective.id) ||
			(objective.status !== "active" && objective.status !== "on-hold")
		) {
			return [];
		}

		const keyResults = objective.keyResults.filter(isIncompleteKeyResult);
		if (objective.keyResults.length > 0 && keyResults.length === 0) {
			return [];
		}
		return [{ objective, keyResults }];
	});
}

export function sanitizeTemplateFileName(name: string): string {
	const withoutControlCharacters = Array.from(name, (character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		return codePoint <= 0x1f ? "-" : character;
	}).join("");
	const sanitized = withoutControlCharacters
		.trim()
		.replace(/[\\/:*?"<>|]/g, "-")
		.replace(/\s+/g, " ")
		.replace(/[. ]+$/g, "");
	if (!sanitized) {
		return "";
	}
	return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(sanitized)
		? `_${sanitized}`
		: sanitized;
}

function formatIsoWeek(date: Date): string {
	const target = new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
	);
	const dayNumber = target.getUTCDay() || 7;
	target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
	const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
	const week = Math.ceil(
		((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
	);
	return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
