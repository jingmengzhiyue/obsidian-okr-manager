export function formatLocalDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function getTodayLocalDate(): string {
	return formatLocalDate(new Date());
}

export function parseLocalDate(value: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return null;
	}

	const [yearText, monthText, dayText] = value.split("-");
	const year = Number(yearText);
	const month = Number(monthText);
	const day = Number(dayText);
	if (
		!Number.isInteger(year) ||
		!Number.isInteger(month) ||
		!Number.isInteger(day)
	) {
		return null;
	}

	const date = new Date(year, month - 1, day);
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return null;
	}

	return date;
}

export function diffLocalDates(left: string, right: string): number | null {
	const leftDate = parseLocalDate(left);
	const rightDate = parseLocalDate(right);
	if (!leftDate || !rightDate) {
		return null;
	}

	const dayInMs = 24 * 60 * 60 * 1000;
	return Math.round((leftDate.getTime() - rightDate.getTime()) / dayInMs);
}
