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
	FRONTMATTER_BLOCKER,
	FRONTMATTER_DATE,
	FRONTMATTER_DELTA,
	FRONTMATTER_NOTE,
	FRONTMATTER_PROGRESS,
	FRONTMATTER_OKR_REF,
	FRONTMATTER_OKR_TYPE,
	FRONTMATTER_TAGS,
	OKR_KR_LIST_END,
	OKR_KR_LIST_START,
	OKR_TYPE_CHECK_IN,
	OKR_TYPE_OBJECTIVE,
	PERIOD_PATTERN,
} from "../constants";
import { compareKeyResultIds, compareObjectiveIds } from "../utils/sort";

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

	invalidateCacheForFile(file: TAbstractFile): void {
		const path = normalizePath(file.path);
		if (path.startsWith(this.getCheckInsDirPrefix())) {
			this.invalidateCheckInCache(path);
			return;
		}

		const period = this.extractPeriodFromPath(path);
		if (period) {
			this.cache.delete(period);
		}
	}

	invalidateCacheByPath(oldPath: string): void {
		const normalized = normalizePath(oldPath);
		if (normalized.startsWith(this.getCheckInsDirPrefix())) {
			this.invalidateCheckInCache(normalized);
			return;
		}

		const period = this.extractPeriodFromPath(normalized);
		if (period) {
			this.cache.delete(period);
		}
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
		const period = await this.findPeriodForKR(krId);
		if (period) {
			const cached = this.getValidCache(period);
			const hit = cached?.checkIns.get(krId);
			if (hit) {
				return hit;
			}
		}

		const files = this.getCheckInFiles().filter(
			(file) =>
				file.basename.endsWith(`-${krId}`) ||
				file.basename === `${krId}`,
		);
		const results = await Promise.all(
			files.map(async (file) => {
				try {
					const frontmatter = await this.parser.readFrontmatter(file);
					if (
						frontmatter[FRONTMATTER_OKR_TYPE] !== OKR_TYPE_CHECK_IN
					) {
						return null;
					}

					const checkIn = this.parser.parseCheckIn(file, frontmatter);
					return checkIn.krId === krId ? checkIn : null;
				} catch {
					return null;
				}
			}),
		);

		const checkIns = results
			.filter((item): item is CheckIn => item !== null)
			.sort((left, right) => right.date.localeCompare(left.date));

		if (period) {
			const entry = this.ensureCacheEntry(period);
			entry.checkIns.set(krId, checkIns);
			entry.timestamp = Date.now();
		}

		return checkIns;
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
		params: Omit<KeyResult, "id" | "progress" | "filePath" | "periodType">,
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

	async recordCheckIn(params: Omit<CheckIn, "filePath">): Promise<void> {
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

		const checkInDir = normalizePath(this.settings.checkInsDir);
		await this.ensureFolder(checkInDir);
		const fileName = this.parser.generateCheckInFileName(
			params.krId,
			params.date,
		);
		const filePath = normalizePath(`${checkInDir}/${fileName}`);
		this.assertFileDoesNotExist(
			filePath,
			`同一天的 Check-in 已存在：${fileName}`,
		);

		const history = await this.getCheckIns(params.krId);
		const latestProgress = history[0]?.progress ?? 0;
		const delta =
			history.length > 0
				? params.progress - latestProgress
				: params.progress;
		await this.app.vault.create(
			filePath,
			this.buildCheckInContent({
				krId: params.krId,
				date: params.date,
				progress: params.progress,
				delta,
				note: params.note,
				blocker: params.blocker,
			}),
		);

		const updatedKeyResults = found.objective.keyResults.map((item) => {
			if (item.id !== params.krId) {
				return item;
			}

			const progress = this.parser.clampProgress(params.progress);
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

		await this.deleteCheckInsForKrIds(
			entry.objective.keyResults.map((keyResult) => keyResult.id),
		);
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

		const updatedKeyResults = found.objective.keyResults.filter(
			(item) => item.id !== krId,
		);
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
		await this.deleteCheckInsForKrIds([krId]);
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
		entry.timestamp = Date.now();
		return objectives;
	}

	private normalizeObjective(objective: Objective): Objective {
		const normalizedKeyResults = objective.keyResults.map((keyResult) =>
			this.settings.autoComputeProgress
				? {
						...keyResult,
						progress: this.parser.calculateKRProgress(
							keyResult.current,
							keyResult.target,
							keyResult.unit,
						),
					}
				: {
						...keyResult,
						progress: this.parser.clampProgress(keyResult.progress),
					},
		);

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

	private async findPeriodForKR(krId: string): Promise<string | null> {
		for (const [period, entry] of this.cache.entries()) {
			if (
				entry.allKeyResults.some((keyResult) => keyResult.id === krId)
			) {
				return period;
			}
		}

		const found = await this.findObjectiveEntryByKRId(krId);
		return found?.objective.period ?? null;
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

	private async deleteCheckInsForKrIds(krIds: string[]): Promise<void> {
		if (krIds.length === 0) {
			return;
		}

		const krIdSet = new Set(krIds);
		const files = this.getCheckInFiles().filter((file) => {
			const basename = file.basename;
			return [...krIdSet].some(
				(krId) => basename.endsWith(`-${krId}`) || basename === krId,
			);
		});
		await Promise.all(
			files.map(async (file) => {
				await this.app.fileManager.trashFile(file);
			}),
		);
		for (const entry of this.cache.values()) {
			for (const krId of krIdSet) {
				entry.checkIns.delete(krId);
			}
		}
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

	private getCheckInFiles(): TFile[] {
		const prefix = this.getCheckInsDirPrefix();
		return this.app.vault
			.getFiles()
			.filter((file) => normalizePath(file.path).startsWith(prefix));
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

	private getCheckInsDirPrefix(): string {
		return `${normalizePath(this.settings.checkInsDir)}/`;
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

	private invalidateCheckInCache(path: string): void {
		const match = path.match(/\/\d{4}-\d{2}-\d{2}-(O\d+-KR\d+)\.md$/);
		const krId = match?.[1];
		if (!krId) {
			return;
		}

		for (const entry of this.cache.values()) {
			entry.checkIns.delete(krId);
		}
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

	private buildCheckInContent(params: {
		krId: string;
		date: string;
		progress: number;
		delta: number;
		note: string;
		blocker: string;
	}): string {
		const frontmatter = {
			[FRONTMATTER_OKR_TYPE]: OKR_TYPE_CHECK_IN,
			[FRONTMATTER_OKR_REF]: params.krId,
			[FRONTMATTER_DATE]: params.date,
			[FRONTMATTER_PROGRESS]: this.parser.clampProgress(params.progress),
			[FRONTMATTER_DELTA]: params.delta,
			[FRONTMATTER_NOTE]: params.note,
			[FRONTMATTER_BLOCKER]: params.blocker,
			[FRONTMATTER_TAGS]: ["okr", "check-in"],
		};

		return `---\n${stringifyYaml(frontmatter).trim()}\n---\n\n${params.note || "无补充说明"}\n`;
	}
}
