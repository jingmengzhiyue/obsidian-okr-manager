import type { KRUnit } from "../types";
import { diffLocalDates, parseLocalDate } from "./date";

export function isValidKeyResultValues(
	unit: KRUnit,
	current: number,
	target: number,
): boolean {
	if (
		!Number.isFinite(current) ||
		current < 0 ||
		!Number.isFinite(target) ||
		target <= 0
	) {
		return false;
	}

	return unit !== "boolean" || ((current === 0 || current === 1) && target === 1);
}

export function isValidCheckInFields(
	date: string,
	currentText: string,
	progressText: string,
	unit: KRUnit = "number",
): boolean {
	const current = Number(currentText);
	const progress = Number(progressText);
	const numericValuesValid =
		parseLocalDate(date) !== null &&
		currentText.length > 0 &&
		Number.isFinite(current) &&
		current >= 0 &&
		progressText.length > 0 &&
		Number.isFinite(progress) &&
		progress >= 0 &&
		progress <= 100 &&
		Number.isInteger(progress);
	if (!numericValuesValid) {
		return false;
	}

	return (
		unit !== "boolean" ||
		((current === 0 || current === 1) &&
			(progress === 0 || progress === 100))
	);
}

export function isValidPostponeDate(
	currentDue: string,
	newDue: string,
): boolean {
	const difference = diffLocalDates(newDue, currentDue);
	return difference !== null && difference > 0;
}
