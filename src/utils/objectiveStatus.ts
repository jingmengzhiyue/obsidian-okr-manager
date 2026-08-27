import { createI18n, type I18n } from "../i18n";
import type { Objective, OKRStatus } from "../types";
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

export function getObjectiveStatusLabel(
	status: OKRStatus,
	i18n: I18n = createI18n(),
): string {
	return i18n.t(`status.${status}`);
}

export function getObjectiveDeadlineState(
	objective: ObjectiveDeadlineLike,
	today = getTodayLocalDate(),
	i18n: I18n = createI18n(),
): ObjectiveDeadlineState {
	const due = objective.due.trim();
	if (!due) {
		return {
			tone: "normal",
			label: i18n.t("objectiveStatus.noDueDate"),
			helpText: null,
			showPostponeAction: false,
			daysUntilDue: null,
		};
	}

	if (objective.status === "completed" || objective.status === "cancelled") {
		return {
			tone: "normal",
			label: i18n.t("objectiveStatus.dueDate", { due }),
			helpText: null,
			showPostponeAction: false,
			daysUntilDue: null,
		};
	}

	const daysUntilDue = diffLocalDates(due, today);
	if (daysUntilDue == null) {
		return {
			tone: "normal",
			label: i18n.t("objectiveStatus.dueDate", { due }),
			helpText: null,
			showPostponeAction: false,
			daysUntilDue: null,
		};
	}

	if (daysUntilDue < 0) {
		const overdueDays = Math.abs(daysUntilDue);
		return {
			tone: "overdue",
			label: i18n.t(
				overdueDays === 1
					? "objectiveStatus.overdueOneDay"
					: "objectiveStatus.overdueDays",
				{ days: overdueDays },
			),
			helpText: i18n.t("objectiveStatus.originalDueDate", { due }),
			showPostponeAction: true,
			daysUntilDue,
		};
	}

	if (daysUntilDue <= DUE_SOON_THRESHOLD_DAYS) {
		return {
			tone: "due-soon",
			label:
				daysUntilDue === 0
					? i18n.t("objectiveStatus.dueToday")
					: i18n.t(
							daysUntilDue === 1
								? "objectiveStatus.dueInOneDay"
								: "objectiveStatus.dueInDays",
							{ days: daysUntilDue },
						),
			helpText: i18n.t("objectiveStatus.dueDateHelp", { due }),
			showPostponeAction: true,
			daysUntilDue,
		};
	}

	return {
		tone: "normal",
		label: i18n.t("objectiveStatus.dueDate", { due }),
		helpText: null,
		showPostponeAction: false,
		daysUntilDue,
	};
}
