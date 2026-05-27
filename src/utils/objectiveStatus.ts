import type { Objective } from "../types";
import { diffLocalDates, getTodayLocalDate } from "./date";

type ObjectiveDeadlineLike = Pick<Objective, "due" | "status" | "id" | "title">;

export type ObjectiveDeadlineTone = "normal" | "due-soon" | "overdue";

export interface ObjectiveDeadlineState {
	tone: ObjectiveDeadlineTone;
	label: string;
	helpText: string | null;
	showPostponeAction: boolean;
	daysUntilDue: number | null;
}

const DUE_SOON_THRESHOLD_DAYS = 3;

export function getObjectiveDeadlineState(
	objective: ObjectiveDeadlineLike,
	today = getTodayLocalDate(),
): ObjectiveDeadlineState {
	const due = objective.due.trim();
	if (!due) {
		return {
			tone: "normal",
			label: "未设置截止日期",
			helpText: null,
			showPostponeAction: false,
			daysUntilDue: null,
		};
	}

	if (objective.status === "completed") {
		return {
			tone: "normal",
			label: `截止 ${due}`,
			helpText: null,
			showPostponeAction: false,
			daysUntilDue: null,
		};
	}

	const daysUntilDue = diffLocalDates(due, today);
	if (daysUntilDue == null) {
		return {
			tone: "normal",
			label: `截止 ${due}`,
			helpText: null,
			showPostponeAction: false,
			daysUntilDue: null,
		};
	}

	if (daysUntilDue < 0) {
		const overdueDays = Math.abs(daysUntilDue);
		return {
			tone: "overdue",
			label: `已超期 ${overdueDays} 天`,
			helpText: `原截止日期 ${due}`,
			showPostponeAction: true,
			daysUntilDue,
		};
	}

	if (daysUntilDue <= DUE_SOON_THRESHOLD_DAYS) {
		return {
			tone: "due-soon",
			label: daysUntilDue === 0 ? "今天截止" : `${daysUntilDue} 天后截止`,
			helpText: `截止日期 ${due}`,
			showPostponeAction: true,
			daysUntilDue,
		};
	}

	return {
		tone: "normal",
		label: `截止 ${due}`,
		helpText: null,
		showPostponeAction: false,
		daysUntilDue,
	};
}
