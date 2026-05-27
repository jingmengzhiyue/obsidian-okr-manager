import {
	App,
	normalizePath,
	stringifyYaml,
	TAbstractFile,
	TFile,
	TFolder,
} from "obsidian";
import { FileParser } from "./FileParser";
import {
	CheckIn,
	KeyResult,
	Objective,
	OKRPeriodType,
	OKRPluginSettings,
	OKRStatus,
} from "../types";
import {
	FRONTMATTER_OKR_TYPE,
	FRONTMATTER_TAGS,
	OKR_KR_LIST_END,
	OKR_KR_LIST_START,
	OKR_TYPE_OBJECTIVE,
	PERIOD_PATTERN,
} from "../constants";
import {
	compareKeyResultIds,
	compareObjectiveIds,
	normalizeKeyResultOrders,
	reorderKeyResultOrders,
} from "../utils/sort";

interface PeriodCacheEntry {
	objectives: Objective[];
	keyResultsByObjective: Map<string, KeyResult[]>;
	allKeyResults: KeyResult[];
	checkIns: Map<string, CheckIn[]>;
	timestamp: number;
}

interface ObjectiveLookupResult {
	file: TFile;
	objective: Objective;
}

export class OKRManager {
	private parser: FileParser;
	private readonly cache = new Map<string, PeriodCacheEntry>();
	private readonly CACHE_TTL = 30_000;

	constructor(
		private app: App,
		private settings: OKRPluginSettings,
	) {
		this.parser = new FileParser(app);
	}

	getApp(): App {
		return this.app;
	}

	getSettings(): OKRPluginSettings {
		return this.settings;
	}

	getParser(): FileParser {
		return this.parser;
	}

	updateSettings(settings: OKRPluginSettings): void {
		this.settings = settings;
		this.clearAllCache();
	}

	invalidateCacheForFile(file: TAbstractFile): boolean {
		const path = normalizePath(file.path);
		const period = this.extractPeriodFromPath(path);
		if (period) {
			this.cache.delete(period);
			return true;
		}
		return false;
	}

	invalidateCacheByPath(oldPath: string): boolean {
		const normalized = normalizePath(oldPath);
		const period = this.extractPeriodFromPath(normalized);
		if (period) {
			this.cache.delete(period);
			return true;
		}
		return false;
	}

	clearAllCache(): void {
		this.cache.clear();
	}

	async getAllPeriods(): Promise<string[]> {
		const root = this.app.vault.getAbstractFileByPath(
			normalizePath(this.settings.rootDir),
		);
		if (!(root instanceof TFolder)) {
			return [];
		}

		return root.children
			.filter((child): child is TFolder => child instanceof TFolder)
			.map((child) => child.name)
			.filter((name) => PERIOD_PATTERN.test(name))
			.sort(
				(left, right) =>
					this.parser.getPeriodSortValue(left) -
					this.parser.getPeriodSortValue(right),
			);
	}

	async getObjectives(period: string): Promise<Objective[]> {
		const normalizedPeriod = this.normalizePeriod(period);
		const cached = this.getValidCache(normalizedPeriod);
		if (cached) {
			return cached.objectives;
		}

		const objectives = await this.loadObjectivesForPeriod(normalizedPeriod);
		return objectives;
	}

	async getKeyResults(
		objectiveId: string,
		period: string,
	): Promise<KeyResult[]> {
		const normalizedPeriod = this.normalizePeriod(period);
		const cached = this.getValidCache(normalizedPeriod);
		if (cached) {
			return cached.keyResultsByObjective.get(objectiveId) ?? [];
		}

		const objectives = await this.loadObjectivesForPeriod(normalizedPeriod);
		return (
			objectives.find((objective) => objective.id === objectiveId)
				?.keyResults ?? []
		);
	}

	async getAllKeyResults(period?: string): Promise<KeyResult[]> {
		if (period) {
			const normalizedPeriod = this.normalizePeriod(period);
			const cached = this.getValidCache(normalizedPeriod);
			if (cached) {
				return cached.allKeyResults;
			}

			await this.loadObjectivesForPeriod(normalizedPeriod);
			return this.cache.get(normalizedPeriod)?.allKeyResults ?? [];
		}

		const periods = await this.getAllPeriods();
		const nested = await Promise.all(
			periods.map(async (currentPeriod) =>
				this.getAllKeyResults(currentPeriod),
			),
		);
		return nested
			.flat()
			.sort((left, right) => compareKeyResultIds(left.id, right.id));
	}

	async getCheckIns(krId: string): Promise<CheckIn[]> {
		const found = await this.findObjectiveEntryByKRId(krId);
		if (!found) {
			return [];
		}

		return (
			found.objective.keyResults.find((item) => item.id === krId)
				?.checkIns ?? []
		);
	}

	async createObjective(
		params: Omit<Objective, "id" | "progress" | "filePath" | "keyResults">,
	): Promise<Objective> {
		const period = this.normalizePeriod(params.period, params.periodType);
		const existing = await this.getObjectives(period);
		const nextId =
			existing.reduce((max, objective) => {
				const parsed = Number.parseInt(
					objective.id.replace("O", ""),
					10,
				);
				return Math.max(max, Number.isNaN(parsed) ? 0 : parsed);
			}, 0) + 1;
		const id = `O${nextId}`;
		const fileName = this.parser.generateObjectiveFileName(id);
		const periodDir = this.getPeriodDir(period);
		await this.ensureFolder(periodDir);
		const filePath = normalizePath(`${periodDir}/${fileName}`);
		this.assertFileDoesNotExist(
			filePath,
			`Objective 文件已存在：${fileName}`,
		);

		const objective: Objective = {
			id,
			period,
			periodType: params.periodType,
			title: params.title.trim(),
			description: params.description.trim(),
			owner: params.owner.trim(),
			status: params.status,
			progress: 0,
			created: params.created,
			due: params.due,
			filePath,
			keyResults: [],
		};

		await this.app.vault.create(
			filePath,
			this.buildObjectiveContent(objective),
		);
		this.cache.delete(period);
		return objective;
	}

	async createKeyResult(
		params: Omit<
			KeyResult,
			"id" | "progress" | "filePath" | "periodType" | "order" | "checkIns"
		>,
	): Promise<KeyResult> {
		const entry = await this.findObjectiveEntry(
			params.objectiveId,
			params.period,
		);
		if (!entry) {
			throw new Error(`找不到 Objective：${params.objectiveId}`);
		}

		const existing = entry.objective.keyResults;
		const nextIndex =
			existing.reduce((max, keyResult) => {
				const match = keyResult.id.match(/-KR(\d+)$/);
				const value = match ? Number.parseInt(match[1] ?? "0", 10) : 0;
				return Math.max(max, value);
			}, 0) + 1;
		const id = `${params.objectiveId}-KR${nextIndex}`;
		const progress = this.settings.autoComputeProgress
			? this.parser.calculateKRProgress(
					params.current,
					params.target,
					params.unit,
				)
			: 0;

		const keyResult: KeyResult = {
			id,
			objectiveId: entry.objective.id,
			period: entry.objective.period,
			periodType: entry.objective.periodType,
			order:
				existing.reduce(
					(max, keyResult) => Math.max(max, keyResult.order),
					-1,
				) + 1,
			title: params.title.trim(),
			description: params.description.trim(),
			owner: params.owner.trim(),
			unit: params.unit,
			current: params.current,
			target: params.target,
			progress,
			status: params.status,
			confidence: params.confidence,
			created: params.created,
			due: params.due,
			filePath: entry.file.path,
			checkIns: [],
		};

		const updatedObjective: Objective = {
			...entry.objective,
			keyResults: [...entry.objective.keyResults, keyResult],
		};
		updatedObjective.progress = this.parser.calculateObjectiveProgress(
			updatedObjective.keyResults,
		);

		await this.writeObjective(entry.file, updatedObjective);
		this.cache.delete(updatedObjective.period);
		return keyResult;
	}

	async updateObjective(
		objectiveId: string,
		period: string,
		updates: Pick<
			Objective,
			"title" | "description" | "owner" | "status" | "due"
		>,
	): Promise<Objective> {
		const entry = await this.findObjectiveEntry(objectiveId, period);
		if (!entry) {
			throw new Error(`找不到 Objective：${objectiveId}`);
		}

		const updatedObjective: Objective = {
			...entry.objective,
			title: updates.title.trim(),
			description: updates.description.trim(),
			owner: updates.owner.trim(),
			status: updates.status,
			due: updates.due,
		};
		updatedObjective.progress = this.parser.calculateObjectiveProgress(
			updatedObjective.keyResults,
		);

		await this.writeObjective(entry.file, updatedObjective);
		this.cache.delete(updatedObjective.period);
		return updatedObjective;
	}

	async updateKeyResult(
		krId: string,
		period: string,
		updates: Pick<
			KeyResult,
			| "title"
			| "description"
			| "owner"
			| "unit"
			| "current"
			| "target"
			| "status"
			| "confidence"
			| "due"
		>,
	): Promise<KeyResult> {
		const found = await this.findObjectiveEntryByKRId(
			krId,
			this.normalizePeriod(period),
		);
		if (!found) {
			throw new Error(`找不到 Key Result：${krId}`);
		}

		let updatedKeyResult: KeyResult | null = null;
		const updatedKeyResults = found.objective.keyResults.map((item) => {
			if (item.id !== krId) {
				return item;
			}

			const progress = this.settings.autoComputeProgress
				? this.parser.calculateKRProgress(
						updates.current,
						updates.target,
						updates.unit,
					)
				: this.parser.clampProgress(item.progress);
			updatedKeyResult = {
				...item,
				title: updates.title.trim(),
				description: updates.description.trim(),
				owner: updates.owner.trim(),
				unit: updates.unit,
				current: updates.current,
				target: updates.target,
				progress,
				status: updates.status,
				confidence: updates.confidence,
				due: updates.due,
			};
			return updatedKeyResult;
		});
		if (!updatedKeyResult) {
			throw new Error(`找不到 Key Result：${krId}`);
		}

		const updatedObjective: Objective = {
			...found.objective,
			keyResults: updatedKeyResults,
		};
		updatedObjective.progress = this.parser.calculateObjectiveProgress(
			updatedObjective.keyResults,
		);

		await this.writeObjective(found.file, updatedObjective);
		this.cache.delete(updatedObjective.period);
		return updatedKeyResult;
	}

	async recordCheckIn(
		params: Pick<
			CheckIn,
			"krId" | "date" | "progress" | "note" | "blocker"
		>,
	): Promise<void> {
		const found = await this.findObjectiveEntryByKRId(params.krId);
		if (!found) {
			throw new Error(`找不到 Key Result：${params.krId}`);
		}

		const keyResult = found.objective.keyResults.find(
			(item) => item.id === params.krId,
		);
		if (!keyResult) {
			throw new Error(`找不到 Key Result：${params.krId}`);
		}

		const history = keyResult.checkIns;
		const progress = this.parser.clampProgress(params.progress);
		const latestProgress = history[0]?.progress ?? 0;
		const delta = history.length > 0 ? progress - latestProgress : progress;
		const nextCheckIn: CheckIn = {
			id: `${params.krId}-${Date.now()}`,
			krId: params.krId,
			date: params.date,
			progress,
			delta,
			note: params.note.trim(),
			blocker: params.blocker.trim(),
			recordedAt: new Date().toISOString(),
		};

		const updatedKeyResults = found.objective.keyResults.map((item) => {
			if (item.id !== params.krId) {
				return item;
			}

			return {
				...item,
				current: this.settings.autoComputeProgress
					? this.inferCurrentFromProgress(item, progress)
					: item.current,
				progress,
				checkIns: [...item.checkIns, nextCheckIn].sort((left, right) =>
					right.recordedAt.localeCompare(left.recordedAt),
				),
			};
		});

		const updatedObjective: Objective = {
			...found.objective,
			keyResults: updatedKeyResults,
		};
		updatedObjective.progress = this.parser.calculateObjectiveProgress(
			updatedObjective.keyResults,
		);

		await this.writeObjective(found.file, updatedObjective);
		this.cache.delete(updatedObjective.period);
	}

	async moveKeyResult(
		krId: string,
		period: string,
		direction: "up" | "down",
	): Promise<void> {
		const found = await this.findObjectiveEntryByKRId(
			krId,
			this.normalizePeriod(period),
		);
		if (!found) {
			throw new Error(`找不到关键结果：${krId}`);
		}

		const sorted = [...found.objective.keyResults].sort(
			(left, right) => left.order - right.order,
		);
		const currentIndex = sorted.findIndex((item) => item.id === krId);
		if (currentIndex === -1) {
			throw new Error(`找不到关键结果：${krId}`);
		}

		const targetIndex =
			direction === "up" ? currentIndex - 1 : currentIndex + 1;
		if (targetIndex < 0 || targetIndex >= sorted.length) {
			return;
		}

		await this.reorderKeyResult(krId, period, targetIndex);
	}

	async reorderKeyResult(
		krId: string,
		period: string,
		targetIndex: number,
	): Promise<void> {
		const found = await this.findObjectiveEntryByKRId(
			krId,
			this.normalizePeriod(period),
		);
		if (!found) {
			throw new Error(`找不到关键结果：${krId}`);
		}

		const sorted = normalizeKeyResultOrders(found.objective.keyResults);
		const currentIndex = sorted.findIndex((item) => item.id === krId);
		if (currentIndex === -1) {
			throw new Error(`找不到关键结果：${krId}`);
		}

		const clampedIndex = Math.max(0, Math.min(targetIndex, sorted.length - 1));
		if (clampedIndex === currentIndex) {
			return;
		}

		const reordered = reorderKeyResultOrders(
			sorted,
			currentIndex,
			clampedIndex,
		);

		const updatedObjective: Objective = {
			...found.objective,
			keyResults: reordered,
		};
		updatedObjective.progress = this.parser.calculateObjectiveProgress(
			updatedObjective.keyResults,
		);

		await this.writeObjective(found.file, updatedObjective);
		this.cache.delete(updatedObjective.period);
	}

	async updateKRProgress(
		krId: string,
		period: string,
		newProgress: number,
	): Promise<void> {
		const found = await this.findObjectiveEntryByKRId(
			krId,
			this.normalizePeriod(period),
		);
		if (!found) {
			return;
		}

		const updatedKeyResults = found.objective.keyResults.map((item) => {
			if (item.id !== krId) {
				return item;
			}

			const progress = this.parser.clampProgress(newProgress);
			return {
				...item,
				current: this.settings.autoComputeProgress
					? this.inferCurrentFromProgress(item, progress)
					: item.current,
				progress,
			};
		});

		const updatedObjective: Objective = {
			...found.objective,
			keyResults: updatedKeyResults,
		};
		updatedObjective.progress = this.parser.calculateObjectiveProgress(
			updatedObjective.keyResults,
		);

		await this.writeObjective(found.file, updatedObjective);
		this.cache.delete(updatedObjective.period);
	}

	async updateStatus(filePath: string, status: OKRStatus): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(
			normalizePath(filePath),
		);
		if (!(file instanceof TFile)) {
			return;
		}

		const frontmatter = await this.parser.readFrontmatter(file);
		if (frontmatter[FRONTMATTER_OKR_TYPE] !== OKR_TYPE_OBJECTIVE) {
			return;
		}

		const objective = this.parser.parseObjective(file, frontmatter);
		await this.writeObjective(file, { ...objective, status });
		this.cache.delete(objective.period);
	}

	async deleteObjective(
		objectiveId: string,
		period: string,
		_deleteKRs: boolean,
	): Promise<void> {
		const entry = await this.findObjectiveEntry(objectiveId, period);
		if (!entry) {
			throw new Error(`找不到要删除的目标：${objectiveId}`);
		}

		await this.app.fileManager.trashFile(entry.file);
		this.cache.delete(this.normalizePeriod(period));
	}

	async deleteKeyResult(krId: string, period: string): Promise<void> {
		const found = await this.findObjectiveEntryByKRId(
			krId,
			this.normalizePeriod(period),
		);
		if (!found) {
			throw new Error(`找不到要删除的关键结果：${krId}`);
		}

		const updatedKeyResults = found.objective.keyResults
			.filter((item) => item.id !== krId)
			.map((item, index) => ({
				...item,
				order: index,
			}));
		if (updatedKeyResults.length === found.objective.keyResults.length) {
			throw new Error(`找不到要删除的关键结果：${krId}`);
		}

		const updatedObjective: Objective = {
			...found.objective,
			keyResults: updatedKeyResults,
		};
		updatedObjective.progress = this.parser.calculateObjectiveProgress(
			updatedObjective.keyResults,
		);

		await this.writeObjective(found.file, updatedObjective);
		this.cache.delete(updatedObjective.period);
	}

	private async loadObjectivesForPeriod(
		period: string,
	): Promise<Objective[]> {
		const files = this.getObjectiveFiles(period);
		const parsed = await Promise.all(
			files.map(async (file) => {
				try {
					const frontmatter = await this.parser.readFrontmatter(file);
					if (
						frontmatter[FRONTMATTER_OKR_TYPE] !== OKR_TYPE_OBJECTIVE
					) {
						return null;
					}

					const objective = this.normalizeObjective(
						this.parser.parseObjective(file, frontmatter),
					);
					return objective;
				} catch {
					return null;
				}
			}),
		);

		const objectives = parsed
			.filter((item): item is Objective => item !== null)
			.sort((left, right) => compareObjectiveIds(left.id, right.id));
		const entry = this.ensureCacheEntry(period);
		entry.objectives = objectives;
		entry.keyResultsByObjective = new Map(
			objectives.map((objective) => [objective.id, objective.keyResults]),
		);
		entry.allKeyResults = objectives.flatMap(
			(objective) => objective.keyResults,
		);
		entry.checkIns = new Map(
			objectives.flatMap((objective) =>
				objective.keyResults.map((keyResult) => [
					keyResult.id,
					keyResult.checkIns,
				]),
			),
		);
		entry.timestamp = Date.now();
		return objectives;
	}

	private normalizeObjective(objective: Objective): Objective {
		const normalizedKeyResults = normalizeKeyResultOrders(
			objective.keyResults,
		).map((keyResult) => {
			const progress = this.settings.autoComputeProgress
				? this.parser.calculateKRProgress(
						keyResult.current,
						keyResult.target,
						keyResult.unit,
					)
				: this.parser.clampProgress(keyResult.progress);
			return {
				...keyResult,
				progress,
				checkIns: [...keyResult.checkIns].sort((left, right) =>
					right.recordedAt.localeCompare(left.recordedAt),
				),
			};
		});

		return {
			...objective,
			keyResults: normalizedKeyResults,
			progress:
				this.parser.calculateObjectiveProgress(normalizedKeyResults),
		};
	}

	private async findObjectiveEntry(
		objectiveId: string,
		period: string,
	): Promise<ObjectiveLookupResult | null> {
		const normalizedPeriod = this.normalizePeriod(period);
		const objectives = await this.getObjectives(normalizedPeriod);
		const objective = objectives.find((item) => item.id === objectiveId);
		if (!objective) {
			return null;
		}

		const file = this.app.vault.getAbstractFileByPath(objective.filePath);
		if (!(file instanceof TFile)) {
			return null;
		}

		return { file, objective };
	}

	private async findObjectiveEntryByKRId(
		krId: string,
		period?: string,
	): Promise<ObjectiveLookupResult | null> {
		if (period) {
			const objectives = await this.getObjectives(period);
			const objective = objectives.find((item) =>
				item.keyResults.some((keyResult) => keyResult.id === krId),
			);
			if (!objective) {
				return null;
			}

			const file = this.app.vault.getAbstractFileByPath(
				objective.filePath,
			);
			return file instanceof TFile ? { file, objective } : null;
		}

		const periods = await this.getAllPeriods();
		for (const currentPeriod of periods) {
			const result = await this.findObjectiveEntryByKRId(
				krId,
				currentPeriod,
			);
			if (result) {
				return result;
			}
		}

		return null;
	}

	private async findObjectiveFile(
		objectiveId: string,
		period: string,
	): Promise<TFile | null> {
		const periodDir = this.getPeriodDir(this.normalizePeriod(period));
		const candidate = this.app.vault.getAbstractFileByPath(
			normalizePath(`${periodDir}/${objectiveId}.md`),
		);
		return candidate instanceof TFile ? candidate : null;
	}

	private async writeObjective(
		file: TFile,
		objective: Objective,
	): Promise<void> {
		const frontmatter = {
			[FRONTMATTER_OKR_TYPE]: OKR_TYPE_OBJECTIVE,
			...this.parser.buildObjectiveFrontmatter(objective),
			[FRONTMATTER_TAGS]: ["okr", "objective"],
		};
		await this.parser.writeFrontmatter(file, frontmatter);
	}

	private getObjectiveFiles(period: string): TFile[] {
		const prefix = `${this.getPeriodDir(period)}/`;
		return this.app.vault
			.getFiles()
			.filter((file) => normalizePath(file.path).startsWith(prefix))
			.filter((file) => file.extension === "md");
	}

	private getValidCache(period: string): PeriodCacheEntry | null {
		const entry = this.cache.get(period);
		if (!entry) {
			return null;
		}

		if (Date.now() - entry.timestamp > this.CACHE_TTL) {
			this.cache.delete(period);
			return null;
		}

		return entry;
	}

	private ensureCacheEntry(period: string): PeriodCacheEntry {
		const existing = this.cache.get(period);
		if (existing) {
			return existing;
		}

		const created: PeriodCacheEntry = {
			objectives: [],
			keyResultsByObjective: new Map(),
			allKeyResults: [],
			checkIns: new Map(),
			timestamp: 0,
		};
		this.cache.set(period, created);
		return created;
	}

	private async ensureFolder(path: string): Promise<void> {
		const normalized = normalizePath(path);
		const existing = this.app.vault.getAbstractFileByPath(normalized);
		if (existing instanceof TFolder) {
			return;
		}

		const parts = normalized.split("/");
		for (let index = 1; index <= parts.length; index += 1) {
			const currentPath = normalizePath(parts.slice(0, index).join("/"));
			if (!currentPath) {
				continue;
			}

			const current = this.app.vault.getAbstractFileByPath(currentPath);
			if (!current) {
				await this.app.vault.createFolder(currentPath);
			} else if (!(current instanceof TFolder)) {
				throw new Error(`路径已被文件占用：${currentPath}`);
			}
		}
	}

	private inferCurrentFromProgress(
		keyResult: KeyResult,
		progress: number,
	): number {
		if (keyResult.unit === "boolean") {
			return progress >= 100 ? 1 : 0;
		}

		if (keyResult.target <= 0) {
			return 0;
		}

		return Math.round(
			(this.parser.clampProgress(progress) / 100) * keyResult.target,
		);
	}

	private normalizePeriod(
		period: string,
		periodType?: OKRPeriodType,
	): string {
		const trimmed = period.trim();
		if (trimmed.length > 0) {
			return trimmed;
		}

		return this.parser.getCurrentPeriod(
			periodType ?? this.settings.defaultPeriodType,
		);
	}

	private getPeriodDir(period: string): string {
		return normalizePath(`${this.settings.rootDir}/${period}`);
	}

	private extractPeriodFromPath(path: string): string | null {
		const rootDir = normalizePath(this.settings.rootDir);
		if (!path.startsWith(`${rootDir}/`)) {
			return null;
		}

		const relative = path.slice(rootDir.length + 1);
		const period = relative.split("/")[0] ?? "";
		return PERIOD_PATTERN.test(period) ? period : null;
	}

	private assertFileDoesNotExist(path: string, message: string): void {
		if (this.app.vault.getAbstractFileByPath(path)) {
			throw new Error(message);
		}
	}

	private buildObjectiveContent(objective: Objective): string {
		const frontmatter = {
			[FRONTMATTER_OKR_TYPE]: OKR_TYPE_OBJECTIVE,
			...this.parser.buildObjectiveFrontmatter(objective),
			[FRONTMATTER_TAGS]: ["okr", "objective"],
		};

		return `---\n${stringifyYaml(frontmatter).trim()}\n---\n\n## 背景\n\n${objective.description || "请补充该目标的背景说明。"}\n\n## 关键结果\n\n${OKR_KR_LIST_START}\n（插件自动渲染 KR 列表，勿手动编辑此区域）\n${OKR_KR_LIST_END}\n`;
	}
}
