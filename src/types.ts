export type OKRStatus = "active" | "completed" | "cancelled" | "on-hold";
export type Confidence = "low" | "medium" | "high";
export type OKRPeriodType = "week" | "month" | "quarter" | "year";
export type OKRPeriod = string; // e.g. "2026-W20" | "2026-05" | "2026-Q2" | "2026"
export type KRUnit = "score" | "percentage" | "number" | "boolean";

export interface Objective {
	id: string; // e.g. "O1"
	period: OKRPeriod;
	periodType: OKRPeriodType;
	title: string;
	description: string;
	owner: string;
	status: OKRStatus;
	progress: number; // 0–100, computed
	created: string; // ISO date
	due: string;
	filePath: string; // absolute vault path
	keyResults: KeyResult[];
}

export interface KeyResult {
	id: string; // e.g. "O1-KR1"
	objectiveId: string; // e.g. "O1"
	period: OKRPeriod;
	periodType: OKRPeriodType;
	order: number;
	title: string;
	description: string;
	owner: string;
	unit: KRUnit;
	current: number;
	target: number;
	progress: number; // 0–100
	status: OKRStatus;
	confidence: Confidence;
	created: string;
	due: string;
	filePath: string;
	checkIns: CheckIn[];
}

export interface CheckIn {
	id: string;
	krId: string;
	date: string;
	progress: number;
	delta: number;
	note: string;
	blocker: string;
	recordedAt: string;
}

export interface OKRPluginSettings {
	rootDir: string; // default: "OKR"
	checkInsDir: string; // default: "OKR/Check-ins"
	defaultPeriodType: OKRPeriodType;
	autoComputeProgress: boolean;
	showDashboardOnStartup: boolean;
}

export const DEFAULT_SETTINGS: OKRPluginSettings = {
	rootDir: "OKR",
	checkInsDir: "OKR/Check-ins",
	defaultPeriodType: "quarter",
	autoComputeProgress: true,
	showDashboardOnStartup: false,
};
