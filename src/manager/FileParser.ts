import { App, parseYaml, stringifyYaml, TFile } from "obsidian";
import { createI18n, type I18n } from "../i18n";
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
	FRONTMATTER_ROLLOVER_FROM,
	FRONTMATTER_STATUS,
	FRONTMATTER_TARGET,
	FRONTMATTER_TITLE,
	FRONTMATTER_UNIT,
	KEY_RESULT_ID_PATTERN,
	MONTH_PERIOD_PATTERN,
	OKR_CHECKINS_END,
	OKR_CHECKINS_START,
	OBJECTIVE_ID_PATTERN,
	QUARTER_PERIOD_PATTERN,
	WEEK_PERIOD_PATTERN,
	YEAR_PERIOD_PATTERN,
} from "../constants";
import { formatLocalDate } from "../utils/date";
import { CheckIn } from "../types";

export class FileParser {
	constructor(private app: App) {}

	async readFrontmatter(file: TFile): Promise<Record<string, unknown>> {
		const cache = this.app.metadataCache.getFileCache(file);
		if (cache?.frontmatter) {
			return cache.frontmatter;
		}
		const content = await this.app.vault.read(file);
		return this.parseFrontmatterContent(content, file.path);
	}

	parseFrontmatterContent(
		content: string,
		sourcePath = "",
	): Record<string, unknown> {
		const frontmatterText = this.extractFrontmatterText(content);
		if (frontmatterText) {
			try {
				const parsed = parseYaml(frontmatterText) as unknown;
				if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
					throw new Error("frontmatter must be a YAML mapping");
				}
				return parsed as Record<string, unknown>;
			} catch (error) {
				const location = sourcePath ? ` in ${sourcePath}` : "";
				const message = error instanceof Error ? error.message : "invalid YAML";
				throw new Error(`Invalid frontmatter${location}: ${message}`);
			}
		}
		return {};
	}

	private extractFrontmatterText(content: string): string | null {
		const match = content.match(
			/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?=\r?\n|$)/,
		);
		return match?.[1] ?? null;
	}

	parseObjectiveContent(file: TFile, content: string): Objective {
		return this.parseObjective(
			file,
			this.parseFrontmatterContent(content, file.path),
			content,
		);
	}

	async writeFrontmatter(
		file: TFile,
		data: Record<string, unknown>,
	): Promise<void> {
		await this.app.vault.process(file, (content) => {
			const fm = stringifyYaml(data).trim();
			const existing = content.match(
				/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?=\r?\n|$)/,
			);
			if (existing) {
				return `---\n${fm}\n---${content.slice(existing[0].length)}`;
			}
			return `---\n${fm}\n---\n\n${content}`;
		});
	}

	parseObjective(
		file: TFile,
		fm: Record<string, unknown>,
		content = "",
	): Objective {
		const id = this.parseObjectiveId(fm[FRONTMATTER_OKR_ID]);
		const period = this.parseString(fm[FRONTMATTER_OKR_PERIOD]);
		const periodType = this.parsePeriodType(
			fm[FRONTMATTER_OKR_PERIOD_TYPE],
			period,
		);
		if (!this.isValidPeriod(period, periodType)) {
			throw new Error(`Invalid OKR period in ${file.path}: ${period || "(empty)"}`);
		}
		const checkInsByKrId = this.parseMarkdownCheckIns(content);
		const rolloverFrom = this.parseObjectiveOrigin(
			fm[FRONTMATTER_ROLLOVER_FROM],
			file.path,
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
				checkInsByKrId,
			}),
			...(rolloverFrom ? { rolloverFrom } : {}),
		};
	}

	syncCheckInsMarkdown(content: string, objective: Objective): string {
		const body = this.stripFrontmatter(content).trimEnd();
		const block = this.buildCheckInsBlock(objective);
		const blockPattern = new RegExp(
			`${this.escapeRegExp(OKR_CHECKINS_START)}[\\s\\S]*?${this.escapeRegExp(OKR_CHECKINS_END)}`,
			"g",
		);
		let replaced = false;
		const synchronized = body.replace(blockPattern, () => {
			if (replaced) {
				return "";
			}

			replaced = true;
			return block;
		});
		if (replaced) {
			return `${synchronized.trimEnd()}\n`;
		}

		return `${body}\n\n${this.buildCheckInsMarkdown(objective)}\n`;
	}

	generateObjectiveFileName(id: string): string {
		return `${id}.md`;
	}

	getCurrentPeriod(periodType: OKRPeriodType): string {
		const now = new Date();
		return this.formatDateToPeriod(now, periodType);
	}

	getDefaultDue(periodType: OKRPeriodType): string {
		return (
			this.getDueForPeriod(this.getCurrentPeriod(periodType), periodType) ??
			formatLocalDate(new Date())
		);
	}

	getDueForPeriod(period: string, periodType: OKRPeriodType): string | null {
		if (!this.isValidPeriod(period, periodType)) {
			return null;
		}

		switch (periodType) {
			case "week": {
				const [yearText, weekText] = period.split("-W");
				const year = Number(yearText);
				const week = Number(weekText);
				const januaryFourth = new Date(year, 0, 4);
				const januaryFourthDay = januaryFourth.getDay() || 7;
				const sunday = new Date(year, 0, 4 - (januaryFourthDay - 1));
				sunday.setDate(sunday.getDate() + (week - 1) * 7 + 6);
				return formatLocalDate(sunday);
			}
			case "month": {
				const [yearText, monthText] = period.split("-");
				return formatLocalDate(new Date(Number(yearText), Number(monthText), 0));
			}
			case "quarter": {
				const [yearText, quarterText] = period.split("-Q");
				return formatLocalDate(
					new Date(Number(yearText), Number(quarterText) * 3, 0),
				);
			}
			case "year":
				return formatLocalDate(new Date(Number(period), 11, 31));
		}
	}

	formatPeriodLabel(
		period: string,
		periodType?: OKRPeriodType,
		i18n: I18n = createI18n(),
	): string {
		const type = periodType ?? this.inferPeriodType(period);
		switch (type) {
			case "week": {
				const [year, week] = period.split("-W");
				return i18n.t("period.label.week", { year, week });
			}
			case "month":
				return period;
			case "quarter": {
				const [year, quarter] = period.split("-Q");
				return i18n.t("period.label.quarter", { year, quarter });
			}
			case "year":
			default:
				return i18n.t("period.label.year", { year: period });
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
			case "week": {
				if (!WEEK_PERIOD_PATTERN.test(value)) {
					return false;
				}
				const [yearText, weekText] = value.split("-W");
				const lastIsoWeek = this.getIsoWeekParts(
					new Date(Number(yearText), 11, 28),
				).week;
				return Number(weekText) <= lastIsoWeek;
			}
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
				const januaryFourth = new Date(Date.UTC(year, 0, 4));
				const day = januaryFourth.getUTCDay() || 7;
				return Date.UTC(year, 0, 4 - (day - 1) + (week - 1) * 7);
			}
			case "month": {
				const [yearText, monthText] = period.split("-");
				return Date.UTC(Number(yearText), Number(monthText) - 1, 1);
			}
			case "quarter": {
				const [yearText, quarterText] = period.split("-Q");
				return Date.UTC(
					Number(yearText),
					(Number(quarterText) - 1) * 3,
					1,
				);
			}
			case "year":
			default:
				return Date.UTC(Number(period), 0, 1);
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
			...(objective.rolloverFrom
				? {
						[FRONTMATTER_ROLLOVER_FROM]: {
							period: objective.rolloverFrom.period,
							"objective-id": objective.rolloverFrom.objectiveId,
						},
					}
				: {}),
		};
	}

	private parseObjectiveOrigin(
		value: unknown,
		filePath: string,
	): Objective["rolloverFrom"] {
		if (value == null) {
			return undefined;
		}
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			throw new Error(`Invalid rollover-from in ${filePath}`);
		}
		const record = value as Record<string, unknown>;
		const period = this.parseString(record.period);
		const objectiveId = this.parseString(record["objective-id"]);
		if (
			!period ||
			!objectiveId ||
			!this.isValidPeriod(period, this.inferPeriodType(period)) ||
			!OBJECTIVE_ID_PATTERN.test(objectiveId)
		) {
			throw new Error(`Invalid rollover-from in ${filePath}`);
		}
		return { period, objectiveId };
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
		if (!OBJECTIVE_ID_PATTERN.test(id)) {
			throw new Error(`Invalid Objective ID: ${id || "(empty)"}`);
		}
		return id;
	}

	private parseKeyResultId(value: unknown): string {
		const id = this.parseString(value);
		if (!KEY_RESULT_ID_PATTERN.test(id)) {
			throw new Error(`Invalid Key Result ID: ${id || "(empty)"}`);
		}
		return id;
	}

	private parseKeyResults(
		value: unknown,
		context: {
			objectiveId: string;
			period: string;
			periodType: OKRPeriodType;
			filePath: string;
			checkInsByKrId: Map<string, CheckIn[]>;
		},
	): KeyResult[] {
		if (!Array.isArray(value)) {
			return [];
		}

		const parsed = value
			.map((item, index) => this.parseKeyResultEntry(item, context, index))
			.sort((left, right) => left.order - right.order);
		const ids = new Set<string>();
		for (const keyResult of parsed) {
			if (ids.has(keyResult.id)) {
				throw new Error(`Duplicate Key Result ID: ${keyResult.id}`);
			}
			ids.add(keyResult.id);
		}
		return parsed;
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

	formatDateToPeriod(date: Date, periodType: OKRPeriodType): string {
		const year = date.getFullYear();
		const month = date.getMonth() + 1;
		switch (periodType) {
			case "week": {
				const isoWeek = this.getIsoWeekParts(date);
				return `${isoWeek.year}-W${String(isoWeek.week).padStart(2, "0")}`;
			}
			case "month":
				return `${year}-${String(month).padStart(2, "0")}`;
			case "quarter":
				return `${year}-Q${Math.ceil(month / 3)}`;
			case "year":
			default:
				return `${year}`;
		}
	}

	private getIsoWeekParts(date: Date): { year: number; week: number } {
		const target = new Date(
			Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
		);
		const dayNumber = target.getUTCDay() || 7;
		target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
		const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
		return {
			year: target.getUTCFullYear(),
			week: Math.ceil(
				((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
			),
		};
	}

	private parseKeyResultEntry(
		value: unknown,
		context: {
			objectiveId: string;
			period: string;
			periodType: OKRPeriodType;
			filePath: string;
			checkInsByKrId: Map<string, CheckIn[]>;
		},
		index: number,
	): KeyResult {
		if (!value || typeof value !== "object") {
			throw new Error(
				`Invalid Key Result entry at index ${index} in ${context.filePath}`,
			);
		}

		const record = value as Record<string, unknown>;
		const fallbackOrder = index;
		const parsedOrder = this.parseNumber(record.order, fallbackOrder);
		const order = Number.isFinite(parsedOrder)
			? Math.max(0, Math.floor(parsedOrder))
			: fallbackOrder;
		const id = this.parseKeyResultId(record[FRONTMATTER_OKR_ID]);
		if (!id.startsWith(`${context.objectiveId}-KR`)) {
			throw new Error(
				`Key Result ID ${id} does not belong to Objective ${context.objectiveId}`,
			);
		}
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
			checkIns: this.mergeCheckIns(
				context.checkInsByKrId.get(id) ?? [],
				this.parseCheckIns(record.checkIns, id),
			),
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
		};
	}

	private parseCheckIns(
		value: unknown,
		krId: string,
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

	private parseMarkdownCheckIns(content: string): Map<string, CheckIn[]> {
		const result = new Map<string, CheckIn[]>();
		const blockPattern = new RegExp(
			`${this.escapeRegExp(OKR_CHECKINS_START)}([\\s\\S]*?)${this.escapeRegExp(OKR_CHECKINS_END)}`,
			"gm",
		);
		let match: RegExpExecArray | null;
		while ((match = blockPattern.exec(content)) !== null) {
			const block = match[1];
			if (block) {
				this.parseMarkdownCheckInBlock(block, result);
			}
		}

		for (const [krId, checkIns] of result) {
			result.set(
				krId,
				checkIns.sort((left, right) =>
					right.recordedAt.localeCompare(left.recordedAt),
				),
			);
		}
		return result;
	}

	private parseMarkdownCheckInBlock(
		block: string,
		result: Map<string, CheckIn[]>,
	): void {
		let currentKrId = "";
		let current: CheckIn | null = null;
		for (const line of block.split(/\r?\n/)) {
			const heading = line.match(/^###\s+(O\d+-KR\d+)(?:\s+.*)?$/);
			if (heading?.[1]) {
				currentKrId = heading[1];
				current = null;
				continue;
			}

			const entry = line.match(
				/^- \*\*(\d{4}-\d{2}-\d{2})\*\*\s+(\d+)%\s+\(([+-]?\d+)\)\s+`([^`]+)`\s*$/,
			);
			if (entry && currentKrId) {
				current = {
					id: entry[4] ?? `${currentKrId}-${result.size + 1}`,
					krId: currentKrId,
					date: entry[1] ?? "",
					progress: this.clampProgress(this.parseNumber(entry[2])),
					delta: this.parseNumber(entry[3]),
					note: "",
					blocker: "",
					recordedAt: `${entry[1] ?? ""}T00:00:00.000Z`,
				};
				this.appendCheckIn(result, current);
				continue;
			}

			if (!current) {
				continue;
			}

			const recordedAt = line.match(/^[ ]{2}- recordedAt:\s*(.*)$/);
			if (recordedAt) {
				current.recordedAt = this.decodeMarkdownValue(recordedAt[1] ?? "");
				continue;
			}

			const note = line.match(/^[ ]{2}- note:\s*(.*)$/);
			if (note) {
				current.note = this.decodeMarkdownValue(note[1] ?? "");
				continue;
			}

			const blocker = line.match(/^[ ]{2}- blocker:\s*(.*)$/);
			if (blocker) {
				current.blocker = this.decodeMarkdownValue(blocker[1] ?? "");
			}
		}
	}

	private buildCheckInsMarkdown(objective: Objective): string {
		return `## 进度记录\n\n${this.buildCheckInsBlock(objective)}`;
	}

	private buildCheckInsBlock(objective: Objective): string {
		const lines = [OKR_CHECKINS_START];
		let hasCheckIns = false;
		for (const keyResult of objective.keyResults) {
			if (keyResult.checkIns.length === 0) {
				continue;
			}

			hasCheckIns = true;
			lines.push("", `### ${keyResult.id} 进度记录`, "");
			for (const checkIn of [...keyResult.checkIns].sort((left, right) =>
				right.recordedAt.localeCompare(left.recordedAt),
			)) {
				const delta =
					checkIn.delta >= 0
						? `+${checkIn.delta}`
						: String(checkIn.delta);
				lines.push(
					`- **${checkIn.date}** ${this.clampProgress(checkIn.progress)}% (${delta}) \`${checkIn.id}\``,
					`  - recordedAt: ${this.encodeMarkdownValue(checkIn.recordedAt)}`,
					`  - note: ${this.encodeMarkdownValue(checkIn.note)}`,
					`  - blocker: ${this.encodeMarkdownValue(checkIn.blocker)}`,
				);
			}
		}
		if (!hasCheckIns) {
			lines.push("", "暂无进度记录。");
		}
		lines.push(OKR_CHECKINS_END);
		return lines.join("\n");
	}

	private appendCheckIn(
		checkInsByKrId: Map<string, CheckIn[]>,
		checkIn: CheckIn,
	): void {
		const existing = checkInsByKrId.get(checkIn.krId) ?? [];
		const duplicateIndex = existing.findIndex((item) => item.id === checkIn.id);
		if (duplicateIndex === -1) {
			existing.push(checkIn);
		} else {
			existing[duplicateIndex] = checkIn;
		}
		checkInsByKrId.set(checkIn.krId, existing);
	}

	private mergeCheckIns(
		markdownCheckIns: CheckIn[],
		frontmatterCheckIns: CheckIn[],
	): CheckIn[] {
		const merged = new Map<string, CheckIn>();
		for (const checkIn of markdownCheckIns) {
			merged.set(checkIn.id, checkIn);
		}
		for (const checkIn of frontmatterCheckIns) {
			if (!merged.has(checkIn.id)) {
				merged.set(checkIn.id, checkIn);
			}
		}

		return [...merged.values()].sort((left, right) =>
			right.recordedAt.localeCompare(left.recordedAt),
		);
	}

	private stripFrontmatter(content: string): string {
		const match = content.match(
			/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?=\r?\n|$)/,
		);
		if (!match) {
			return content;
		}
		return content.slice(match[0].length).replace(/^\r?\n/, "");
	}

	private encodeMarkdownValue(value: string): string {
		return value
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/\r?\n/g, "<br>");
	}

	private decodeMarkdownValue(value: string): string {
		return value
			.replace(/<br>/g, "\n")
			.replace(/&gt;/g, ">")
			.replace(/&lt;/g, "<")
			.replace(/&amp;/g, "&")
			.trim();
	}

	private escapeRegExp(value: string): string {
		return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}
}
