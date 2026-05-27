function extractNumericSuffix(value: string, prefix: string): number {
	const match = value.match(new RegExp(`^${prefix}(\\d+)$`));
	return match ? Number.parseInt(match[1] ?? "0", 10) : Number.NaN;
}

interface OrderedKeyResultLike {
	id: string;
	order: number;
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

export function compareKeyResultsByOrder(
	left: OrderedKeyResultLike,
	right: OrderedKeyResultLike,
): number {
	return left.order - right.order || compareKeyResultIds(left.id, right.id);
}

export function normalizeKeyResultOrders<T extends OrderedKeyResultLike>(
	items: T[],
): T[] {
	return [...items].sort(compareKeyResultsByOrder).map((item, index) => ({
		...item,
		order: index,
	}));
}

export function reorderKeyResultOrders<T extends OrderedKeyResultLike>(
	items: T[],
	fromIndex: number,
	toIndex: number,
): T[] {
	const normalized = normalizeKeyResultOrders(items);
	if (
		fromIndex < 0 ||
		fromIndex >= normalized.length ||
		normalized.length <= 1
	) {
		return normalized;
	}

	const [moved] = normalized.splice(fromIndex, 1);
	if (!moved) {
		return normalized;
	}

	const clampedIndex = Math.max(0, Math.min(toIndex, normalized.length));
	normalized.splice(clampedIndex, 0, moved);
	return normalized.map((item, index) => ({
		...item,
		order: index,
	}));
}
