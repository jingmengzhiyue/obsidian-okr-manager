import {
	App,
	stringifyYaml,
	TFile,
	TFolder,
} from "obsidian";
import {
	FRONTMATTER_ARCHIVED_AT,
	FRONTMATTER_CLOSED_AT,
	FRONTMATTER_CREATED_AT,
	FRONTMATTER_OBJECTIVES,
	FRONTMATTER_OKR_PERIOD,
	FRONTMATTER_OKR_PERIOD_TYPE,
	FRONTMATTER_OKR_TYPE,
	FRONTMATTER_ROLLOVERS,
	FRONTMATTER_STATUS,
	FRONTMATTER_TEMPLATE_ID,
	FRONTMATTER_TEMPLATE_NAME,
	FRONTMATTER_TEMPLATE_VERSION,
	FRONTMATTER_WEIGHT,
	OKR_TYPE_PERIOD,
	OKR_TYPE_PERIOD_TEMPLATE,
	KEY_RESULT_ID_PATTERN,
	OBJECTIVE_ID_PATTERN,
	PERIOD_METADATA_FILE,
	PERIOD_PATTERN,
	PERIOD_TEMPLATES_DIR,
	PERIOD_TEMPLATE_VERSION,
} from "../constants";
import type {
	Confidence,
	KRUnit,
	OKRPeriodInfo,
	OKRPeriodStatus,
	OKRPeriodType,
	OKRPluginSettings,
	PeriodTemplate,
	PeriodTemplateObjective,
	RolloverMapping,
} from "../types";
import { sanitizeTemplateFileName } from "../utils/period";
import { normalizeVaultPath } from "../utils/path";
import { isValidKeyResultWeight } from "../utils/validation";
import { FileParser } from "./FileParser";

const PERIOD_STATUSES = new Set<OKRPeriodStatus>([
	"open",
	"closed",
	"archived",
]);
const PERIOD_TYPES = new Set<OKRPeriodType>([
	"week",
	"month",
	"quarter",
	"year",
]);
const KR_UNITS = new Set<KRUnit>([
	"score",
	"percentage",
	"number",
	"boolean",
]);
const CONFIDENCE_LEVELS = new Set<Confidence>(["low", "medium", "high"]);

export class PeriodRepository {
	private readonly periodCache = new Map<string, OKRPeriodInfo>();
	private readonly templateCache = new Map<string, PeriodTemplate>();

	constructor(
		private app: App,
		private settings: OKRPluginSettings,
		private parser: FileParser,
	) {}

	updateSettings(settings: OKRPluginSettings): void {
		this.settings = settings;
		this.clearCache();
	}

	clearCache(): void {
		this.periodCache.clear();
		this.templateCache.clear();
	}

	invalidatePath(path: string): boolean {
		const normalized = normalizeVaultPath(path);
		const rootDir = normalizeVaultPath(this.settings.rootDir);
		const templatesDir = normalizeVaultPath(`${rootDir}/${PERIOD_TEMPLATES_DIR}`);
		if (
			normalized === templatesDir ||
			normalized.startsWith(`${templatesDir}/`)
		) {
			this.templateCache.clear();
			return true;
		}

		if (!normalized.startsWith(`${rootDir}/`)) {
			return false;
		}
		const relative = normalized.slice(rootDir.length + 1);
		const period = relative.split("/")[0] ?? "";
		if (!PERIOD_PATTERN.test(period)) {
			return false;
		}
		this.periodCache.delete(period);
		return true;
	}

	async getPeriodInfo(period: string): Promise<OKRPeriodInfo> {
		const cached = this.periodCache.get(period);
		if (cached) {
			return cached;
		}

		const periodType = this.parser.inferPeriodType(period);
		if (!this.parser.isValidPeriod(period, periodType)) {
			throw new Error(`Invalid OKR period: ${period}`);
		}
		const path = this.getPeriodMetadataPath(period);
		const vault = this.app.vault as Partial<App["vault"]>;
		const file = vault.getAbstractFileByPath?.(path);
		if (!file) {
			const implicit: OKRPeriodInfo = {
				period,
				periodType,
				status: "open",
				createdAt: "",
				rollovers: [],
			};
			this.periodCache.set(period, implicit);
			return implicit;
		}
		if (!(file instanceof TFile)) {
			throw new Error(`Period metadata path is not a file: ${path}`);
		}

		const content = await this.app.vault.read(file);
		const frontmatter = this.parser.parseFrontmatterContent(content, path);
		const info = this.parsePeriodInfo(frontmatter, path, period);
		this.periodCache.set(period, info);
		return info;
	}

	async writePeriodInfo(info: OKRPeriodInfo): Promise<void> {
		const path = this.getPeriodMetadataPath(info.period);
		await this.ensureFolder(this.getPeriodDir(info.period));
		const existing = this.app.vault.getAbstractFileByPath(path);
		const known = this.serializePeriodInfo(info);
		if (!existing) {
			await this.app.vault.create(
				path,
				`---\n${stringifyYaml(known).trim()}\n---\n`,
			);
		} else if (existing instanceof TFile) {
			const current = this.parser.parseFrontmatterContent(
				await this.app.vault.read(existing),
				existing.path,
			);
			await this.parser.writeFrontmatter(existing, { ...current, ...known });
		} else {
			throw new Error(`Period metadata path is not a file: ${path}`);
		}
		this.periodCache.set(info.period, info);
	}

	async listTemplates(): Promise<PeriodTemplate[]> {
		const folder = this.app.vault.getAbstractFileByPath(this.getTemplatesDir());
		if (!(folder instanceof TFolder)) {
			return [];
		}
		const templates: PeriodTemplate[] = [];
		for (const child of folder.children) {
			if (!(child instanceof TFile) || child.extension !== "md") {
				continue;
			}
			const cached = this.templateCache.get(child.path);
			if (cached) {
				templates.push(cached);
				continue;
			}
			const content = await this.app.vault.read(child);
			const frontmatter = this.parser.parseFrontmatterContent(
				content,
				child.path,
			);
			if (frontmatter[FRONTMATTER_OKR_TYPE] !== OKR_TYPE_PERIOD_TEMPLATE) {
				continue;
			}
			const template = this.parseTemplate(frontmatter, child.path);
			this.templateCache.set(child.path, template);
			templates.push(template);
		}
		return templates.sort((left, right) => left.name.localeCompare(right.name));
	}

	async getTemplate(templateId: string): Promise<PeriodTemplate | null> {
		return (
			(await this.listTemplates()).find((template) => template.id === templateId) ??
			null
		);
	}

	async createTemplate(
		template: Omit<PeriodTemplate, "filePath">,
	): Promise<PeriodTemplate> {
		const fileName = sanitizeTemplateFileName(template.name);
		if (!fileName) {
			throw new Error("Template name is required");
		}
		await this.ensureFolder(this.getTemplatesDir());
		const path = normalizeVaultPath(`${this.getTemplatesDir()}/${fileName}.md`);
		if (this.app.vault.getAbstractFileByPath(path)) {
			throw new Error(`Period template already exists: ${fileName}`);
		}
		const complete: PeriodTemplate = { ...template, filePath: path };
		const frontmatter = this.serializeTemplate(complete);
		await this.app.vault.create(
			path,
			`---\n${stringifyYaml(frontmatter).trim()}\n---\n\n# ${template.name}\n`,
		);
		this.templateCache.set(path, complete);
		return complete;
	}

	async deleteTemplate(templateId: string): Promise<void> {
		const template = await this.getTemplate(templateId);
		if (!template) {
			throw new Error(`Period template not found: ${templateId}`);
		}
		const file = this.app.vault.getAbstractFileByPath(template.filePath);
		if (!(file instanceof TFile)) {
			throw new Error(`Period template file not found: ${template.filePath}`);
		}
		await this.app.fileManager.trashFile(file);
		this.templateCache.delete(template.filePath);
	}

	getPeriodMetadataPath(period: string): string {
		return normalizeVaultPath(`${this.getPeriodDir(period)}/${PERIOD_METADATA_FILE}`);
	}

	private getPeriodDir(period: string): string {
		return normalizeVaultPath(`${this.settings.rootDir}/${period}`);
	}

	private getTemplatesDir(): string {
		return normalizeVaultPath(`${this.settings.rootDir}/${PERIOD_TEMPLATES_DIR}`);
	}

	private parsePeriodInfo(
		frontmatter: Record<string, unknown>,
		path: string,
		expectedPeriod: string,
	): OKRPeriodInfo {
		if (frontmatter[FRONTMATTER_OKR_TYPE] !== OKR_TYPE_PERIOD) {
			throw new Error(`Invalid period metadata type in ${path}`);
		}
		const period = this.requireString(
			frontmatter[FRONTMATTER_OKR_PERIOD],
			FRONTMATTER_OKR_PERIOD,
			path,
		);
		if (period !== expectedPeriod) {
			throw new Error(
				`Period metadata ${period} does not match folder ${expectedPeriod}: ${path}`,
			);
		}
		const periodType = this.requirePeriodType(
			frontmatter[FRONTMATTER_OKR_PERIOD_TYPE],
			path,
		);
		if (
			periodType !== this.parser.inferPeriodType(period) ||
			!this.parser.isValidPeriod(period, periodType)
		) {
			throw new Error(`Invalid period metadata in ${path}`);
		}
		const statusValue = frontmatter[FRONTMATTER_STATUS];
		if (typeof statusValue !== "string" || !PERIOD_STATUSES.has(statusValue as OKRPeriodStatus)) {
			throw new Error(`Invalid period status in ${path}`);
		}

		const createdAt = this.requireTimestamp(
			frontmatter[FRONTMATTER_CREATED_AT],
			FRONTMATTER_CREATED_AT,
			path,
		);
		const closedAt = this.optionalTimestamp(
			frontmatter[FRONTMATTER_CLOSED_AT],
			FRONTMATTER_CLOSED_AT,
			path,
		);
		const archivedAt = this.optionalTimestamp(
			frontmatter[FRONTMATTER_ARCHIVED_AT],
			FRONTMATTER_ARCHIVED_AT,
			path,
		);
		if (statusValue === "closed" && !closedAt) {
			throw new Error(`Missing ${FRONTMATTER_CLOSED_AT} in ${path}`);
		}
		if (statusValue === "archived" && (!closedAt || !archivedAt)) {
			throw new Error(`Missing archive timestamps in ${path}`);
		}
		const rollovers = this.parseRollovers(
			frontmatter[FRONTMATTER_ROLLOVERS],
			path,
		);
		if (
			rollovers.some((mapping) => {
				const targetType = this.parser.inferPeriodType(mapping.targetPeriod);
				return (
					mapping.targetPeriod === period ||
					targetType !== periodType ||
					!this.parser.isValidPeriod(mapping.targetPeriod, targetType)
				);
			})
		) {
			throw new Error(`Invalid rollover target in ${path}`);
		}

		return {
			period,
			periodType,
			status: statusValue as OKRPeriodStatus,
			createdAt,
			closedAt: closedAt || undefined,
			archivedAt: archivedAt || undefined,
			rollovers,
		};
	}

	private serializePeriodInfo(info: OKRPeriodInfo): Record<string, unknown> {
		return {
			[FRONTMATTER_OKR_TYPE]: OKR_TYPE_PERIOD,
			[FRONTMATTER_OKR_PERIOD]: info.period,
			[FRONTMATTER_OKR_PERIOD_TYPE]: info.periodType,
			[FRONTMATTER_STATUS]: info.status,
			[FRONTMATTER_CREATED_AT]: info.createdAt,
			[FRONTMATTER_CLOSED_AT]: info.closedAt ?? "",
			[FRONTMATTER_ARCHIVED_AT]: info.archivedAt ?? "",
			[FRONTMATTER_ROLLOVERS]: info.rollovers.map((mapping) => ({
				"source-objective-id": mapping.sourceObjectiveId,
				"source-key-result-ids": mapping.sourceKeyResultIds,
				"target-period": mapping.targetPeriod,
				"target-objective-id": mapping.targetObjectiveId,
			})),
		};
	}

	private parseRollovers(value: unknown, path: string): RolloverMapping[] {
		if (value == null) {
			return [];
		}
		if (!Array.isArray(value)) {
			throw new Error(`Invalid rollovers in ${path}`);
		}
		return value.map((item, index) => {
			if (!item || typeof item !== "object" || Array.isArray(item)) {
				throw new Error(`Invalid rollover ${index + 1} in ${path}`);
			}
			const record = item as Record<string, unknown>;
			const sourceKeyResultIds = record["source-key-result-ids"];
			if (
				!Array.isArray(sourceKeyResultIds) ||
				!sourceKeyResultIds.every((id) => typeof id === "string")
			) {
				throw new Error(`Invalid rollover key results in ${path}`);
			}
			const sourceObjectiveId = this.requireString(
					record["source-objective-id"],
					"source-objective-id",
					path,
				);
			const targetObjectiveId = this.requireString(
				record["target-objective-id"],
				"target-objective-id",
				path,
			);
			if (
				!OBJECTIVE_ID_PATTERN.test(sourceObjectiveId) ||
				!OBJECTIVE_ID_PATTERN.test(targetObjectiveId) ||
				!sourceKeyResultIds.every(
					(id) =>
						KEY_RESULT_ID_PATTERN.test(id) &&
						id.startsWith(`${sourceObjectiveId}-KR`),
				)
			) {
				throw new Error(`Invalid rollover IDs in ${path}`);
			}
			return {
				sourceObjectiveId,
				sourceKeyResultIds,
				targetPeriod: this.requireString(
					record["target-period"],
					"target-period",
					path,
				),
				targetObjectiveId,
			};
		});
	}

	private parseTemplate(
		frontmatter: Record<string, unknown>,
		path: string,
	): PeriodTemplate {
		const templateVersion = frontmatter[FRONTMATTER_TEMPLATE_VERSION];
		if (templateVersion !== 1 && templateVersion !== PERIOD_TEMPLATE_VERSION) {
			throw new Error(`Unsupported period template version in ${path}`);
		}
		const objectivesValue = frontmatter[FRONTMATTER_OBJECTIVES];
		if (!Array.isArray(objectivesValue) || objectivesValue.length === 0) {
			throw new Error(`Period template has no objectives: ${path}`);
		}
		const id = this.requireString(
			frontmatter[FRONTMATTER_TEMPLATE_ID],
			"template-id",
			path,
		);
		if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
			throw new Error(`Invalid template UUID in ${path}`);
		}
		return {
			id,
			name: this.requireString(
				frontmatter[FRONTMATTER_TEMPLATE_NAME],
				"template-name",
				path,
			),
			periodType: this.requirePeriodType(
				frontmatter[FRONTMATTER_OKR_PERIOD_TYPE],
				path,
			),
			createdAt: this.requireTimestamp(
				frontmatter[FRONTMATTER_CREATED_AT],
				"created-at",
				path,
			),
			filePath: path,
			objectives: objectivesValue.map((value, index) =>
				this.parseTemplateObjective(value, path, index),
			),
		};
	}

	private parseTemplateObjective(
		value: unknown,
		path: string,
		index: number,
	): PeriodTemplateObjective {
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			throw new Error(`Invalid template objective ${index + 1} in ${path}`);
		}
		const record = value as Record<string, unknown>;
		const keyResults = record["key-results"];
		if (!Array.isArray(keyResults)) {
			throw new Error(`Invalid template key results in ${path}`);
		}
		return {
			title: this.requireString(record.title, "title", path),
			description: this.optionalString(record.description),
			owner: this.optionalString(record.owner),
			keyResults: keyResults.map((item) => {
				if (!item || typeof item !== "object" || Array.isArray(item)) {
					throw new Error(
						`Invalid template key result in ${path}`,
					);
				}
				const keyResult = item as Record<string, unknown>;
				const unit = keyResult.unit;
				const confidence = keyResult.confidence;
				const target = keyResult.target;
				const weight = keyResult[FRONTMATTER_WEIGHT] ?? 1;
				if (typeof unit !== "string" || !KR_UNITS.has(unit as KRUnit)) {
					throw new Error(`Invalid template key result unit in ${path}`);
				}
				if (
					typeof confidence !== "string" ||
					!CONFIDENCE_LEVELS.has(confidence as Confidence)
				) {
					throw new Error(`Invalid template confidence in ${path}`);
				}
				if (typeof target !== "number" || !Number.isFinite(target) || target <= 0) {
					throw new Error(`Invalid template target in ${path}`);
				}
				if (unit === "boolean" && target !== 1) {
					throw new Error(`Invalid Boolean template target in ${path}`);
				}
				if (typeof weight !== "number" || !isValidKeyResultWeight(weight)) {
					throw new Error(`Invalid template key result weight in ${path}`);
				}
				if (
					typeof keyResult.order !== "number" ||
					!Number.isInteger(keyResult.order) ||
					keyResult.order < 0
				) {
					throw new Error(`Invalid template key result order in ${path}`);
				}
				return {
					title: this.requireString(keyResult.title, "title", path),
					description: this.optionalString(keyResult.description),
					owner: this.optionalString(keyResult.owner),
					unit: unit as KRUnit,
					weight,
					target,
					confidence: confidence as Confidence,
					order: keyResult.order,
				};
			}),
		};
	}

	private serializeTemplate(template: PeriodTemplate): Record<string, unknown> {
		return {
			[FRONTMATTER_OKR_TYPE]: OKR_TYPE_PERIOD_TEMPLATE,
			[FRONTMATTER_TEMPLATE_VERSION]: PERIOD_TEMPLATE_VERSION,
			[FRONTMATTER_TEMPLATE_ID]: template.id,
			[FRONTMATTER_TEMPLATE_NAME]: template.name,
			[FRONTMATTER_OKR_PERIOD_TYPE]: template.periodType,
			[FRONTMATTER_CREATED_AT]: template.createdAt,
			[FRONTMATTER_OBJECTIVES]: template.objectives.map((objective) => ({
				title: objective.title,
				description: objective.description,
				owner: objective.owner,
				"key-results": objective.keyResults.map((keyResult) => ({
					title: keyResult.title,
					description: keyResult.description,
					owner: keyResult.owner,
					unit: keyResult.unit,
					[FRONTMATTER_WEIGHT]: keyResult.weight,
					target: keyResult.target,
					confidence: keyResult.confidence,
					order: keyResult.order,
				})),
			})),
		};
	}

	private requirePeriodType(value: unknown, path: string): OKRPeriodType {
		if (typeof value !== "string" || !PERIOD_TYPES.has(value as OKRPeriodType)) {
			throw new Error(`Invalid period type in ${path}`);
		}
		return value as OKRPeriodType;
	}

	private requireString(value: unknown, field: string, path: string): string {
		if (typeof value !== "string" || !value.trim()) {
			throw new Error(`Missing ${field} in ${path}`);
		}
		return value.trim();
	}

	private optionalString(value: unknown): string {
		return typeof value === "string" ? value.trim() : "";
	}

	private requireTimestamp(value: unknown, field: string, path: string): string {
		const timestamp = this.requireString(value, field, path);
		if (Number.isNaN(Date.parse(timestamp))) {
			throw new Error(`Invalid ${field} in ${path}`);
		}
		return timestamp;
	}

	private optionalTimestamp(value: unknown, field: string, path: string): string {
		const timestamp = this.optionalString(value);
		if (timestamp && Number.isNaN(Date.parse(timestamp))) {
			throw new Error(`Invalid ${field} in ${path}`);
		}
		return timestamp;
	}

	private async ensureFolder(path: string): Promise<void> {
		const normalized = normalizeVaultPath(path);
		const parts = normalized.split("/");
		for (let index = 1; index <= parts.length; index += 1) {
			const currentPath = normalizeVaultPath(parts.slice(0, index).join("/"));
			const current = this.app.vault.getAbstractFileByPath(currentPath);
			if (!current) {
				await this.app.vault.createFolder(currentPath);
			} else if (!(current instanceof TFolder)) {
				throw new Error(`Path is occupied by a file: ${currentPath}`);
			}
		}
	}
}
