import { App, parseYaml, stringifyYaml, TFile } from "obsidian";
import {
	Confidence,
	KeyResult,
	KRUnit,
	Objective,
	OKRPeriodType,
	OKRStatus,
} from "../types";
import {
	FRONTMATTER_CONFIDENCE,
	FRONTMATTER_CREATED,
	FRONTMATTER_CURRENT,
	FRONTMATTER_DESCRIPTION,
	FRONTMATTER_DUE,
	FRONTMATTER_KEY_RESULTS,
	FRONTMATTER_OKR_ID,
	FRONTMATTER_OKR_PERIOD,
	FRONTMATTER_OKR_PERIOD_TYPE,
	FRONTMATTER_OWNER,
	FRONTMATTER_PROGRESS,
	FRONTMATTER_STATUS,
	FRONTMATTER_TARGET,
	FRONTMATTER_TITLE,
	FRONTMATTER_UNIT,
	KEY_RESULT_ID_PATTERN,
	MONTH_PERIOD_PATTERN,
	OBJECTIVE_ID_PATTERN,
	QUARTER_PERIOD_PATTERN,
	WEEK_PERIOD_PATTERN,
	YEAR_PERIOD_PATTERN,
} from "../constants";
import { formatLocalDate } from "../utils/date";

export class FileParser {
	constructor(private app: App) {}

	async readFrontmatter(file: TFile): Promise<Record<string, unknown>> {
		const cache = this.app.metadataCache.getFileCache(file);
		if (cache?.frontmatter) {
			return cache.frontmatter as Record<string, unknown>;
		}
		const content = await this.app.vault.read(file);
		const match = content.match(/^---\n([\s\S]*?)\n---/);
		if (match && match[1]) {
			try {
				return parseYaml(match[1]) as Record<string, unknown>;
			} catch {
				return {};
			}
		}
		return {};
	}

	async writeFrontmatter(
		file: TFile,
		data: Record<string, unknown>,
	): Promise<void> {
		await this.app.vault.process(file, (content) => {
			const fm = stringifyYaml(data).trim();
			if (content.startsWith("---")) {
				const end = content.indexOf("\n---", 3);
				if (end !== -1) {
					return `---\n${fm}\n---${content.slice(end + 4)}`;
				}
			}
			return `---\n${fm}\n---\n\n${content}`;
		});
	}

	parseObjective(file: TFile, fm: Record<string, unknown>): Objective {
		const id = this.parseObjectiveId(fm[FRONTMATTER_OKR_ID]);
		const period = this.parseString(fm[FRONTMATTER_OKR_PERIOD]);
		const periodType = this.parsePeriodType(
			fm[FRONTMATTER_OKR_PERIOD_TYPE],
			period,
		);

		return {
			id,
			period,
			periodType,
			title: this.parseString(fm[FRONTMATTER_TITLE]),
			description: this.parseString(fm[FRONTMATTER_DESCRIPTION]),
			owner: this.parseString(fm[FRONTMATTER_OWNER]),
			status: this.parseStatus(fm[FRONTMATTER_STATUS]),
			progress: this.clampProgress(
				this.parseNumber(fm[FRONTMATTER_PROGRESS]),
			),
			created: this.parseString(fm[FRONTMATTER_CREATED]),
			due: this.parseString(fm[FRONTMATTER_DUE]),
			filePath: file.path,
			keyResults: this.parseKeyResults(fm[FRONTMATTER_KEY_RESULTS], {
				objectiveId: id,
				period,
				periodType,
				filePath: file.path,
			}),
		};
	}

	generateObjectiveFileName(id: string): string {
		return `${id}.md`;
	}

	getCurrentPeriod(periodType: OKRPeriodType): string {
		const now = new Date();
		return this.formatDateToPeriod(now, periodType);
	}

	getDefaultDue(periodType: OKRPeriodType): string {
		const now = new Date();
		const endDate = new Date(now);
		switch (periodType) {
			case "week": {
				const day = now.getDay() || 7;
				endDate.setDate(now.getDate() + (7 - day));
				break;
			}
			case "month":
				endDate.setMonth(now.getMonth() + 1, 0);
				break;
			case "quarter": {
				const quarter = Math.ceil((now.getMonth() + 1) / 3);
				endDate.setMonth(quarter * 3, 0);
				break;
			}
			case "year":
				endDate.setMonth(11, 31);
				break;
		}

		return formatLocalDate(endDate);
	}

	formatPeriodLabel(period: string, periodType?: OKRPeriodType): string {
		const type = periodType ?? this.inferPeriodType(period);
		switch (type) {
			case "week":
				return period.replace("-W", " 第 ") + " 周";
			case "month":
				return period;
			case "quarter":
				return period.replace("-Q", " Q");
			case "year":
			default:
				return `${period} 年`;
		}
	}

	inferPeriodType(period: string): OKRPeriodType {
		if (WEEK_PERIOD_PATTERN.test(period)) {
			return "week";
		}
		if (MONTH_PERIOD_PATTERN.test(period)) {
			return "month";
		}
		if (QUARTER_PERIOD_PATTERN.test(period)) {
			return "quarter";
		}
		return "year";
	}

	isValidPeriod(period: string, periodType: OKRPeriodType): boolean {
		const value = period.trim();
		switch (periodType) {
			case "week":
				return WEEK_PERIOD_PATTERN.test(value);
			case "month":
				return MONTH_PERIOD_PATTERN.test(value);
			case "quarter":
				return QUARTER_PERIOD_PATTERN.test(value);
			case "year":
				return YEAR_PERIOD_PATTERN.test(value);
		}
	}

	getPeriodSortValue(period: string): number {
		const type = this.inferPeriodType(period);
		switch (type) {
			case "week": {
				const [yearText, weekText] = period.split("-W");
				const year = Number(yearText);
				const week = Number(weekText);
				return year * 100 + week;
			}
			case "month": {
				const [yearText, monthText] = period.split("-");
				return Number(yearText) * 100 + Number(monthText);
			}
			case "quarter": {
				const [yearText, quarterText] = period.split("-Q");
				return Number(yearText) * 100 + Number(quarterText) * 3;
			}
			case "year":
			default:
				return Number(period) * 100;
		}
	}

	calculateObjectiveProgress(keyResults: KeyResult[]): number {
		const activeKeyResults = keyResults.filter(
			(keyResult) => keyResult.status !== "cancelled",
		);
		if (activeKeyResults.length === 0) {
			return 0;
		}

		const total = activeKeyResults.reduce(
			(sum, keyResult) => sum + this.clampProgress(keyResult.progress),
			0,
		);
		return this.clampProgress(total / activeKeyResults.length);
	}

	buildObjectiveFrontmatter(objective: Objective): Record<string, unknown> {
		return {
			[FRONTMATTER_OKR_ID]: objective.id,
			[FRONTMATTER_OKR_PERIOD]: objective.period,
			[FRONTMATTER_OKR_PERIOD_TYPE]: objective.periodType,
			[FRONTMATTER_TITLE]: objective.title,
			[FRONTMATTER_DESCRIPTION]: objective.description,
			[FRONTMATTER_OWNER]: objective.owner,
			[FRONTMATTER_STATUS]: objective.status,
			[FRONTMATTER_PROGRESS]: this.clampProgress(objective.progress),
			[FRONTMATTER_CREATED]: objective.created,
			[FRONTMATTER_DUE]: objective.due,
			[FRONTMATTER_KEY_RESULTS]: objective.keyResults.map((keyResult) =>
				this.serializeKeyResult(keyResult),
			),
		};
	}

	clampProgress(progress: number): number {
		if (!Number.isFinite(progress)) {
			return 0;
		}

		return Math.max(0, Math.min(100, Math.round(progress)));
	}

	calculateKRProgress(current: number, target: number, unit: KRUnit): number {
		if (!Number.isFinite(target) || target <= 0) {
			return 0;
		}

		if (unit === "boolean") {
			return current >= target ? 100 : 0;
		}

		return this.clampProgress((current / target) * 100);
	}

	private parseStatus(value: unknown): OKRStatus {
		const s = this.parseString(value, "active");
		if (["active", "completed", "cancelled", "on-hold"].includes(s)) {
			return s as OKRStatus;
		}
		return "active";
	}

	private parseUnit(value: unknown): KRUnit {
		const u = this.parseString(value, "score");
		if (["score", "percentage", "number", "boolean"].includes(u)) {
			return u as KRUnit;
		}
		return "score";
	}

	private parseConfidence(value: unknown): Confidence {
		const c = this.parseString(value, "medium");
		if (["low", "medium", "high"].includes(c)) {
			return c as Confidence;
		}
		return "medium";
	}

	private parsePeriodType(value: unknown, period: string): OKRPeriodType {
		const parsed = this.parseString(value);
		if (
			parsed === "week" ||
			parsed === "month" ||
			parsed === "quarter" ||
			parsed === "year"
		) {
			return parsed;
		}

		return this.inferPeriodType(period);
	}

	private parseObjectiveId(value: unknown): string {
		const id = this.parseString(value);
		return OBJECTIVE_ID_PATTERN.test(id) ? id : "";
	}

	private parseKeyResultId(value: unknown): string {
		const id = this.parseString(value);
		return KEY_RESULT_ID_PATTERN.test(id) ? id : "";
	}

	private parseKeyResults(
		value: unknown,
		context: {
			objectiveId: string;
			period: string;
			periodType: OKRPeriodType;
			filePath: string;
		},
	): KeyResult[] {
		if (!Array.isArray(value)) {
			return [];
		}

		return value
			.map((item, index) =>
				this.parseKeyResultEntry(item, context, index),
			)
			.filter((item): item is KeyResult => item !== null)
			.sort((left, right) => left.order - right.order);
	}

	private parseString(value: unknown, fallback = ""): string {
		if (typeof value === "string") {
			return value;
		}

		if (typeof value === "number" || typeof value === "boolean") {
			return String(value);
		}

		return fallback;
	}

	private parseNumber(value: unknown, fallback = 0): number {
		if (typeof value === "number" && Number.isFinite(value)) {
			return value;
		}

		if (typeof value === "string" && value.trim().length > 0) {
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : fallback;
		}

		return fallback;
	}

	private sanitizeFileName(name: string): string {
		return name
			.trim()
			.replace(/[\\/:*?"<>|]/g, "-")
			.replace(/\s+/g, " ");
	}

	private formatDateToPeriod(date: Date, periodType: OKRPeriodType): string {
		const year = date.getFullYear();
		const month = date.getMonth() + 1;
		switch (periodType) {
			case "week":
				return `${year}-W${String(this.getIsoWeek(date)).padStart(2, "0")}`;
			case "month":
				return `${year}-${String(month).padStart(2, "0")}`;
			case "quarter":
				return `${year}-Q${Math.ceil(month / 3)}`;
			case "year":
			default:
				return `${year}`;
		}
	}

	private getIsoWeek(date: Date): number {
		const target = new Date(
			Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
		);
		const dayNumber = target.getUTCDay() || 7;
		target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
		const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
		return Math.ceil(
			((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
		);
	}

	private parseKeyResultEntry(
		value: unknown,
		context: {
			objectiveId: string;
			period: string;
			periodType: OKRPeriodType;
			filePath: string;
		},
		index: number,
	): KeyResult | null {
		if (!value || typeof value !== "object") {
			return null;
		}

		const record = value as Record<string, unknown>;
		const fallbackOrder = index;
		const parsedOrder = this.parseNumber(record.order, fallbackOrder);
		const order = Number.isFinite(parsedOrder)
			? Math.max(0, Math.floor(parsedOrder))
			: fallbackOrder;
		const fallbackId = `${context.objectiveId}-KR${index + 1}`;
		const id =
			this.parseKeyResultId(record[FRONTMATTER_OKR_ID]) || fallbackId;
		const current = this.parseNumber(record[FRONTMATTER_CURRENT]);
		const target = this.parseNumber(record[FRONTMATTER_TARGET]);
		const unit = this.parseUnit(record[FRONTMATTER_UNIT]);
		const storedProgress = this.parseNumber(record[FRONTMATTER_PROGRESS]);

		return {
			id,
			objectiveId: context.objectiveId,
			period: context.period,
			periodType: context.periodType,
			order,
			title: this.parseString(record[FRONTMATTER_TITLE]),
			description: this.parseString(record[FRONTMATTER_DESCRIPTION]),
			owner: this.parseString(record[FRONTMATTER_OWNER]),
			unit,
			current,
			target,
			progress: this.clampProgress(
				record[FRONTMATTER_PROGRESS] == null
					? this.calculateKRProgress(current, target, unit)
					: storedProgress,
			),
			status: this.parseStatus(record[FRONTMATTER_STATUS]),
			confidence: this.parseConfidence(record[FRONTMATTER_CONFIDENCE]),
			created: this.parseString(record[FRONTMATTER_CREATED]),
			due: this.parseString(record[FRONTMATTER_DUE]),
			filePath: context.filePath,
			checkIns: this.parseCheckIns(record.checkIns, id, context.filePath),
		};
	}

	private serializeKeyResult(keyResult: KeyResult): Record<string, unknown> {
		return {
			[FRONTMATTER_OKR_ID]: keyResult.id,
			[FRONTMATTER_TITLE]: keyResult.title,
			[FRONTMATTER_DESCRIPTION]: keyResult.description,
			[FRONTMATTER_OWNER]: keyResult.owner,
			[FRONTMATTER_UNIT]: keyResult.unit,
			[FRONTMATTER_CURRENT]: keyResult.current,
			[FRONTMATTER_TARGET]: keyResult.target,
			[FRONTMATTER_PROGRESS]: this.clampProgress(keyResult.progress),
			[FRONTMATTER_STATUS]: keyResult.status,
			[FRONTMATTER_CONFIDENCE]: keyResult.confidence,
			[FRONTMATTER_CREATED]: keyResult.created,
			[FRONTMATTER_DUE]: keyResult.due,
			order: keyResult.order,
			checkIns: keyResult.checkIns.map((checkIn) => ({
				id: checkIn.id,
				date: checkIn.date,
				progress: this.clampProgress(checkIn.progress),
				delta: checkIn.delta,
				note: checkIn.note,
				blocker: checkIn.blocker,
				recordedAt: checkIn.recordedAt,
			})),
		};
	}

	private parseCheckIns(
		value: unknown,
		krId: string,
		filePath: string,
	): KeyResult["checkIns"] {
		if (!Array.isArray(value)) {
			return [];
		}

		return value
			.filter((item): item is Record<string, unknown> => {
				return Boolean(item) && typeof item === "object";
			})
			.map((item, index) => {
				const fallbackId = `${krId}-${index + 1}`;
				const recordedAt = this.parseString(item.recordedAt);
				return {
					id: this.parseString(item.id) || fallbackId,
					krId,
					date: this.parseString(item.date),
					progress: this.clampProgress(
						this.parseNumber(item.progress),
					),
					delta: this.parseNumber(item.delta),
					note: this.parseString(item.note),
					blocker: this.parseString(item.blocker),
					recordedAt:
						recordedAt ||
						`${this.parseString(item.date)}T00:00:00.000Z`,
				};
			})
			.sort((left, right) =>
				right.recordedAt.localeCompare(left.recordedAt),
			);
	}
}
