function extractNumericSuffix(value: string, prefix: string): number {
	const match = value.match(new RegExp(`^${prefix}(\\d+)$`));
	return match ? Number.parseInt(match[1] ?? "0", 10) : Number.NaN;
}

function extractKeyResultParts(value: string): [number, number] {
	const match = value.match(/^O(\d+)-KR(\d+)$/);
	if (!match) {
		return [Number.NaN, Number.NaN];
	}

	return [
		Number.parseInt(match[1] ?? "0", 10),
		Number.parseInt(match[2] ?? "0", 10),
	];
}

export function compareObjectiveIds(left: string, right: string): number {
	const leftNumber = extractNumericSuffix(left, "O");
	const rightNumber = extractNumericSuffix(right, "O");
	if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
		return leftNumber - rightNumber;
	}

	return left.localeCompare(right);
}

export function compareKeyResultIds(left: string, right: string): number {
	const [leftObjective, leftKr] = extractKeyResultParts(left);
	const [rightObjective, rightKr] = extractKeyResultParts(right);
	if (
		!Number.isNaN(leftObjective) &&
		!Number.isNaN(leftKr) &&
		!Number.isNaN(rightObjective) &&
		!Number.isNaN(rightKr)
	) {
		return leftObjective - rightObjective || leftKr - rightKr;
	}

	return left.localeCompare(right);
}
