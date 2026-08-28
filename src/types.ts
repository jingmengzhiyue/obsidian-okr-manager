export type OKRStatus = "active" | "completed" | "cancelled" | "on-hold";
export type Confidence = "low" | "medium" | "high";
export type OKRPeriodType = "week" | "month" | "quarter" | "year";
export type OKRPeriod = string; // e.g. "2026-W20" | "2026-05" | "2026-Q2" | "2026"
export type OKRPeriodStatus = "open" | "closed" | "archived";
export type KRUnit = "score" | "percentage" | "number" | "boolean";
export type HealthStatus =
	| "on-track"
	| "at-risk"
	| "off-track"
	| "not-applicable";
export type HealthReason =
	| "behind-schedule"
	| "medium-confidence"
	| "low-confidence"
	| "blocked"
	| "on-hold"
	| "overdue";
export type PeriodReviewType = "weekly" | "mid-cycle" | "retrospective";
export type ReviewSectionKey =
	| "summary"
	| "wins"
	| "blockers"
	| "next-steps"
	| "achievements"
	| "risks"
	| "adjustments"
	| "decisions"
	| "outcomes"
	| "worked"
	| "did-not-work"
	| "lessons"
	| "follow-ups";

export interface HealthAssessment {
	score: number | null;
	status: HealthStatus;
	expectedProgress: number | null;
	reasons: HealthReason[];
}

export interface ObjectiveOrigin {
	period: OKRPeriod;
	objectiveId: string;
}

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
	rolloverFrom?: ObjectiveOrigin;
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
	weight: number;
	current: number;
	target: number;
	progress: number; // 0–100
	status: OKRStatus;
	confidence: Confidence;
	created: string;
	due: string;
	filePath: string;
	checkIns: CheckIn[];
	hasBlocker: boolean;
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

export interface RolloverMapping {
	sourceObjectiveId: string;
	sourceKeyResultIds: string[];
	targetPeriod: OKRPeriod;
	targetObjectiveId: string;
}

export interface OKRPeriodInfo {
	period: OKRPeriod;
	periodType: OKRPeriodType;
	status: OKRPeriodStatus;
	createdAt: string;
	closedAt?: string;
	archivedAt?: string;
	rollovers: RolloverMapping[];
}

export interface RolloverCandidate {
	objective: Objective;
	keyResults: KeyResult[];
}

export interface RolloverSelection {
	objectiveId: string;
	keyResultIds: string[];
}

export interface ClosePeriodInput {
	period: OKRPeriod;
	targetPeriod?: OKRPeriod;
	selections: RolloverSelection[];
	allowUnfinishedWithoutRollover?: boolean;
	allowMissingRetrospective?: boolean;
}

export interface ClosePeriodResult {
	period: OKRPeriod;
	targetPeriod?: OKRPeriod;
	createdObjectives: Objective[];
	rollovers: RolloverMapping[];
}

export interface PeriodTemplateKeyResult {
	title: string;
	description: string;
	owner: string;
	unit: KRUnit;
	weight: number;
	target: number;
	confidence: Confidence;
	order: number;
}

export interface PeriodTemplateObjective {
	title: string;
	description: string;
	owner: string;
	keyResults: PeriodTemplateKeyResult[];
}

export interface PeriodTemplate {
	id: string;
	name: string;
	periodType: OKRPeriodType;
	createdAt: string;
	filePath: string;
	objectives: PeriodTemplateObjective[];
}

export type PeriodTemplateSummary = Omit<PeriodTemplate, "objectives"> & {
	objectiveCount: number;
};

export interface SavePeriodTemplateInput {
	name: string;
	sourcePeriod: OKRPeriod;
	selections: RolloverSelection[];
}

export interface ApplyPeriodTemplateInput {
	templateId: string;
	targetPeriod: OKRPeriod;
}

export interface ReviewSnapshotKeyResult {
	id: string;
	title: string;
	status: OKRStatus;
	weight: number;
	normalizedWeight: number;
	progress: number;
	health: HealthAssessment;
}

export interface ReviewSnapshotObjective {
	id: string;
	title: string;
	status: OKRStatus;
	progress: number;
	health: HealthAssessment;
	keyResults: ReviewSnapshotKeyResult[];
}

export interface ReviewSnapshot {
	capturedAt: string;
	objectives: ReviewSnapshotObjective[];
}

export type ReviewSections = Record<ReviewSectionKey, string>;

export interface PeriodReview {
	id: string;
	period: OKRPeriod;
	periodType: OKRPeriodType;
	type: PeriodReviewType;
	reviewDate: string;
	createdAt: string;
	updatedAt: string;
	filePath: string;
	sections: ReviewSections;
	snapshot: ReviewSnapshot;
}

export type PeriodReviewSummary = Omit<PeriodReview, "sections" | "snapshot"> & {
	objectiveCount: number;
};

export interface CreatePeriodReviewInput {
	period: OKRPeriod;
	type: PeriodReviewType;
	reviewDate: string;
	sections: ReviewSections;
}

export interface UpdatePeriodReviewInput {
	period: OKRPeriod;
	reviewId: string;
	sections: ReviewSections;
}

export interface OKRPluginSettings {
	rootDir: string; // default: "OKR"
	defaultPeriodType: OKRPeriodType;
	autoComputeProgress: boolean;
	showDashboardOnStartup: boolean;
}

export const DEFAULT_SETTINGS: OKRPluginSettings = {
	rootDir: "OKR",
	defaultPeriodType: "quarter",
	autoComputeProgress: true,
	showDashboardOnStartup: false,
};
