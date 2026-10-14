import { KeyResult } from "../types";
import { isValidKeyResultWeight } from "./validation";

/** Parse the displayed values again after unit changes; invalid input stays invalid. */
export function parseKRNumbers(
	unit: KeyResult["unit"],
	currentRaw: string,
	targetRaw: string,
	weightRaw: string,
) {
	const current = currentRaw.trim() === "" ? 0 : Number(currentRaw);
	const target = targetRaw.trim() === "" ? NaN : Number(targetRaw);
	const weight = weightRaw.trim() === "" ? NaN : Number(weightRaw);
	const currentValid =
		Number.isFinite(current) &&
		current >= 0 &&
		(unit !== "boolean" || current === 0 || current === 1);
	const targetValid =
		Number.isFinite(target) &&
		target > 0 &&
		(unit !== "boolean" || target === 1);
	const weightValid = isValidKeyResultWeight(weight);
	return {
		current,
		target,
		weight,
		currentValid,
		targetValid,
		weightValid,
		valid: currentValid && targetValid && weightValid,
	};
}
