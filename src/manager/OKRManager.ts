import {
	App,
	normalizePath,
	stringifyYaml,
	TAbstractFile,
	TFile,
	TFolder,
} from "obsidian";
import { createI18n, type I18n, type TranslationValue } from "../i18n";
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
import { collectMarkdownFilesFromTree } from "../utils/fileTree";
import {
	isValidCheckInFields,
	isValidKeyResultValues,
} from "../utils/validation";

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
	private readonly summaryCache = new Map<string, PeriodCacheEntry>();
	private readonly mutationQueues = new Map<string, Promise<void>>();
	private readonly CACHE_TTL = 30_000;
	private cacheVersion = 0;

	constructor(
		private app: App,
		private settings: OKRPluginSettings,
		private i18n: I18n = createI18n(),
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

	getI18n(): I18n {
		return this.i18n;
	}

	updateI18n(i18n: I18n): void {
		this.i18n = i18n;
	}

	updateSettings(settings: OKRPluginSettings): void {
		this.settings = settings;
		this.clearAllCache();
	}

	invalidateCacheForFile(file: TAbstractFile): boolean {
		const path = file.path;
		const period = this.extractPeriodFromPath(path);
		if (period) {
			this.invalidatePeriodCaches(period);
			return true;
		}
		return false;
	}

	invalidateCacheByPath(oldPath: string): boolean {
		const normalized = normalizePath(oldPath);
		const period = this.extractPeriodFromPath(normalized);
		if (period) {
			this.invalidatePeriodCaches(period);
			return true;
		}
		return false;
	}

	clearAllCache(): void {
		this.cacheVersion += 1;
		this.cache.clear();
		this.summaryCache.clear();
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
			.filter(
				(name) =>
					PERIOD_PATTERN.test(name) &&
					this.parser.isValidPeriod(
						name,
						this.parser.inferPeriodType(name),
					),
			)
			.sort(
				(left, right) =>
					this.parser.getPeriodSortValue(left) -
						this.parser.getPeriodSortValue(right) ||
					left.localeCompare(right),
			);
	}

	async getObjectives(period: string): Promise<Objective[]> {
		const normalizedPeriod = this.normalizePeriod(period);
		const cached = this.getValidCache(normalizedPeriod);
		if (cached) {
			return cached.objectives;
		}

		const loadVersion = this.cacheVersion;
		const objectives = await this.loadObjectivesForPeriod(
			normalizedPeriod,
			loadVersion,
		);
		if (loadVersion !== this.cacheVersion) {
			return (
				this.getValidCache(normalizedPeriod)?.objectives ??
				this.getObjectives(normalizedPeriod)
			);
		}
		return objectives;
	}

	async getObjectiveSummaries(period: string): Promise<Objective[]> {
		const normalizedPeriod = this.normalizePeriod(period);
		const cached = this.getValidCache(normalizedPeriod, this.summaryCache);
		if (cached) {
			return cached.objectives;
		}
		const loadVersion = this.cacheVersion;
		const objectives = await this.loadObjectiveSummariesForPeriod(
			normalizedPeriod,
			loadVersion,
		);
		if (loadVersion !== this.cacheVersion) {
			return (
				this.getValidCache(normalizedPeriod, this.summaryCache)?.objectives ??
				this.getObjectiveSummaries(normalizedPeriod)
			);
		}
		return objectives;
	}

	async getKeyResultSummaries(
		objectiveId: string,
		period: string,
	): Promise<KeyResult[]> {
		const objectives = await this.getObjectiveSummaries(period);
		return objectives.find((item) => item.id === objectiveId)?.keyResults ?? [];
	}

	async getAllKeyResultSummaries(period?: string): Promise<KeyResult[]> {
		if (period) {
			const objectives = await this.getObjectiveSummaries(period);
			return objectives.flatMap((objective) => objective.keyResults);
		}
		const periods = await this.getAllPeriods();
		const nested = await Promise.all(
			periods.map((currentPeriod) =>
				this.getAllKeyResultSummaries(currentPeriod),
			),
		);
		return nested.flat().sort((left, right) =>
			compareKeyResultIds(left.id, right.id),
		);
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

		const objectives = await this.getObjectives(normalizedPeriod);
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

			const objectives = await this.getObjectives(normalizedPeriod);
			return objectives.flatMap((objective) => objective.keyResults);
		}

		const periods = await this.getAllPeriods();
		const nested = await Promise.all(
			periods.map(async (currentPeriod) =>
				this.getAllKeyResults(currentPeriod),
			),
		);
		const keyResults: KeyResult[] = [];
		for (const periodKeyResults of nested) {
			keyResults.push(...periodKeyResults);
		}
		return keyResults.sort((left, right) =>
			compareKeyResultIds(left.id, right.id),
		);
	}

	async getCheckIns(krId: string, period?: string): Promise<CheckIn[]> {
		const found = await this.findObjectiveEntryByKRId(
			krId,
			period ? this.normalizePeriod(period) : undefined,
		);
		if (!found) {
			return [];
		}

		const cached = this.getValidCache(found.objective.period);
		const cachedCheckIns = cached?.checkIns.get(krId);
		if (cachedCheckIns) {
			return cachedCheckIns;
		}

		const content = await this.app.vault.read(found.file);
		const objective = this.normalizeObjective(
			this.parser.parseObjectiveContent(found.file, content),
		);
		this.assertObjectiveMatchesPeriod(objective, found.objective.period);
		return (
			objective.keyResults.find((item) => item.id === krId)?.checkIns ?? []
		);
	}

	async createObjective(
		params: Omit<Objective, "id" | "progress" | "filePath" | "keyResults">,
	): Promise<Objective> {
		const period = this.normalizePeriod(params.period, params.periodType);
		if (!this.parser.isValidPeriod(period, params.periodType)) {
			throw new Error(this.t("errors.invalidPeriod", { period }));
		}
		const existing = await this.getObjectiveSummaries(period);
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
			this.t("errors.objectiveExists", { fileName }),
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
		this.upsertObjectiveInCaches(objective);
		return objective;
	}

	async createKeyResult(
		params: Omit<
			KeyResult,
			"id" | "progress" | "filePath" | "periodType" | "order" | "checkIns"
		>,
	): Promise<KeyResult> {
		if (
			!isValidKeyResultValues(params.unit, params.current, params.target)
		) {
			throw new Error(this.t("errors.invalidKeyResultValues"));
		}
		const entry = await this.findObjectiveEntry(
			params.objectiveId,
			params.period,
		);
		if (!entry) {
			throw new Error(
				this.t("errors.objectiveNotFound", {
					id: params.objectiveId,
				}),
			);
		}

		let created: KeyResult | null = null;
		await this.mutateObjective(entry.file, (objective) => {
			const existing = objective.keyResults;
			const nextIndex =
				existing.reduce((max, keyResult) => {
					const match = keyResult.id.match(/-KR(\d+)$/);
					const value = match
						? Number.parseInt(match[1] ?? "0", 10)
						: 0;
					return Math.max(max, value);
				}, 0) + 1;
			const progress = this.settings.autoComputeProgress
				? this.parser.calculateKRProgress(
						params.current,
						params.target,
						params.unit,
					)
				: 0;
			created = {
				id: `${objective.id}-KR${nextIndex}`,
				objectiveId: objective.id,
				period: objective.period,
				periodType: objective.periodType,
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
			return { ...objective, keyResults: [...existing, created] };
		});
		if (!created) {
			throw new Error(this.t("errors.keyResultNotFound", { id: params.objectiveId }));
		}
		return created;
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
			throw new Error(
				this.t("errors.objectiveNotFound", { id: objectiveId }),
			);
		}

		return this.mutateObjective(entry.file, (objective) => ({
			...objective,
			title: updates.title.trim(),
			description: updates.description.trim(),
			owner: updates.owner.trim(),
			status: updates.status,
			due: updates.due,
		}));
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
		if (
			!isValidKeyResultValues(updates.unit, updates.current, updates.target)
		) {
			throw new Error(this.t("errors.invalidKeyResultValues"));
		}
		const found = await this.findObjectiveEntryByKRId(
			krId,
			this.normalizePeriod(period),
		);
		if (!found) {
			throw new Error(this.t("errors.keyResultNotFound", { id: krId }));
		}

		let updatedKeyResult: KeyResult | null = null;
		await this.mutateObjective(found.file, (objective) => {
			const updatedKeyResults = objective.keyResults.map((item) => {
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
				throw new Error(this.t("errors.keyResultNotFound", { id: krId }));
			}
			return { ...objective, keyResults: updatedKeyResults };
		});
		return updatedKeyResult!;
	}

	async recordCheckIn(
		params: Pick<
			CheckIn,
			"krId" | "date" | "progress" | "note" | "blocker"
		> & { period?: string; current?: number },
	): Promise<void> {
		const found = await this.findObjectiveEntryByKRId(
			params.krId,
			params.period ? this.normalizePeriod(params.period) : undefined,
		);
		if (!found) {
			throw new Error(
				this.t("errors.keyResultNotFound", { id: params.krId }),
			);
		}

		await this.mutateObjective(found.file, (objective) => {
			const keyResult = objective.keyResults.find(
				(item) => item.id === params.krId,
			);
			if (!keyResult) {
				throw new Error(
					this.t("errors.keyResultNotFound", { id: params.krId }),
				);
			}

			const history = keyResult.checkIns;
			const hasCurrent =
				typeof params.current === "number" &&
				Number.isFinite(params.current);
			const progress =
				this.settings.autoComputeProgress && hasCurrent
					? this.parser.calculateKRProgress(
							params.current!,
							keyResult.target,
							keyResult.unit,
						)
					: this.parser.clampProgress(params.progress);
			const current = hasCurrent
				? params.current!
				: this.settings.autoComputeProgress
					? this.inferCurrentFromProgress(keyResult, progress)
					: keyResult.current;
			if (
				!Number.isFinite(params.progress) ||
				!Number.isInteger(params.progress) ||
				params.progress < 0 ||
				params.progress > 100 ||
				!isValidCheckInFields(
					params.date,
					String(current),
					String(progress),
					keyResult.unit,
				)
			) {
				throw new Error(this.t("errors.invalidCheckInValues"));
			}
			const latestProgress = history[0]?.progress ?? 0;
			const delta =
				history.length > 0 ? progress - latestProgress : progress;
			const recordedAt = new Date().toISOString();
			const nextCheckIn: CheckIn = {
				id: `${params.krId}-${recordedAt}-${crypto.randomUUID()}`,
				krId: params.krId,
				date: params.date,
				progress,
				delta,
				note: params.note.trim(),
				blocker: params.blocker.trim(),
				recordedAt,
			};
			const updatedKeyResults = objective.keyResults.map((item) =>
				item.id === params.krId
					? {
							...item,
							current,
							progress,
							checkIns: [...item.checkIns, nextCheckIn].sort(
								(left, right) =>
									right.recordedAt.localeCompare(left.recordedAt),
							),
						}
					: item,
			);
			return { ...objective, keyResults: updatedKeyResults };
		});
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
			throw new Error(this.t("errors.keyResultNotFound", { id: krId }));
		}

		await this.mutateObjective(found.file, (objective) => {
			const sorted = normalizeKeyResultOrders(objective.keyResults);
			const currentIndex = sorted.findIndex((item) => item.id === krId);
			if (currentIndex === -1) {
				throw new Error(this.t("errors.keyResultNotFound", { id: krId }));
			}

			const targetIndex =
				direction === "up" ? currentIndex - 1 : currentIndex + 1;
			if (targetIndex < 0 || targetIndex >= sorted.length) {
				return objective;
			}

			const [moved] = sorted.splice(currentIndex, 1);
			if (!moved) {
				return objective;
			}
			sorted.splice(targetIndex, 0, moved);
			return {
				...objective,
				keyResults: sorted.map((item, index) => ({
					...item,
					order: index,
				})),
			};
		});
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
			throw new Error(this.t("errors.keyResultNotFound", { id: krId }));
		}

		await this.mutateObjective(found.file, (objective) => {
			const sorted = normalizeKeyResultOrders(objective.keyResults);
			const currentIndex = sorted.findIndex((item) => item.id === krId);
			if (currentIndex === -1) {
				throw new Error(this.t("errors.keyResultNotFound", { id: krId }));
			}
			const clampedIndex = Math.max(
				0,
				Math.min(targetIndex, sorted.length - 1),
			);
			return {
				...objective,
				keyResults:
					clampedIndex === currentIndex
						? sorted
						: reorderKeyResultOrders(
								sorted,
								currentIndex,
								clampedIndex,
							),
			};
		});
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

		await this.mutateObjective(found.file, (objective) => ({
			...objective,
			keyResults: objective.keyResults.map((item) => {
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
			}),
		}));
	}

	async updateStatus(filePath: string, status: OKRStatus): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(
			normalizePath(filePath),
		);
		if (!(file instanceof TFile)) {
			return;
		}

		await this.mutateObjective(file, (objective) => ({ ...objective, status }));
	}

	async deleteObjective(
		objectiveId: string,
		period: string,
		_deleteKRs: boolean,
	): Promise<void> {
		const entry = await this.findObjectiveEntry(objectiveId, period);
		if (!entry) {
			throw new Error(
				this.t("errors.objectiveToDeleteNotFound", { id: objectiveId }),
			);
		}

		await this.app.fileManager.trashFile(entry.file);
		this.invalidatePeriodCaches(this.normalizePeriod(period));
	}

	async deleteKeyResult(krId: string, period: string): Promise<void> {
		const found = await this.findObjectiveEntryByKRId(
			krId,
			this.normalizePeriod(period),
		);
		if (!found) {
			throw new Error(
				this.t("errors.keyResultToDeleteNotFound", { id: krId }),
			);
		}

		await this.mutateObjective(found.file, (objective) => {
			const updatedKeyResults = objective.keyResults
				.filter((item) => item.id !== krId)
				.map((item, index) => ({ ...item, order: index }));
			if (updatedKeyResults.length === objective.keyResults.length) {
				throw new Error(
					this.t("errors.keyResultToDeleteNotFound", { id: krId }),
				);
			}
			return { ...objective, keyResults: updatedKeyResults };
		});
	}

	async migrateLegacyProgressRecords(): Promise<{
		scanned: number;
		migrated: number;
	}> {
		let scanned = 0;
		let migrated = 0;
		const periods = await this.getAllPeriods();
		for (const period of periods) {
			for (const file of this.getObjectiveFiles(period)) {
				const frontmatter = await this.parser.readFrontmatter(file);
				if (frontmatter[FRONTMATTER_OKR_TYPE] !== OKR_TYPE_OBJECTIVE) {
					continue;
				}

				scanned += 1;
				if (!this.hasLegacyCheckIns(frontmatter)) {
					continue;
				}

				await this.mutateObjective(file, (objective) => objective);
				migrated += 1;
			}
			this.invalidatePeriodCaches(period);
		}

		return { scanned, migrated };
	}

	private async loadObjectivesForPeriod(
		period: string,
		loadVersion: number,
	): Promise<Objective[]> {
		const files = this.getObjectiveFiles(period);
		const failures: string[] = [];
		const parsed = await Promise.all(
			files.map(async (file) => {
				try {
					const content = await this.app.vault.read(file);
					const frontmatter = this.parser.parseFrontmatterContent(
						content,
						file.path,
					);
					if (
						frontmatter[FRONTMATTER_OKR_TYPE] !== OKR_TYPE_OBJECTIVE
					) {
						return null;
					}
					const objective = this.normalizeObjective(
						this.parser.parseObjective(file, frontmatter, content),
					);
					this.assertObjectiveMatchesPeriod(objective, period);
					return objective;
				} catch (error) {
					const message =
						error instanceof Error ? error.message : this.t("errors.unknown");
					failures.push(`${file.path}: ${message}`);
					return null;
				}
			}),
		);
		if (failures.length > 0) {
			throw new Error(
				this.t("errors.invalidObjectiveFiles", {
					files: failures.join("; "),
				}),
			);
		}

		const objectives = parsed
			.filter((item): item is Objective => item !== null)
			.sort((left, right) => compareObjectiveIds(left.id, right.id));
		this.assertUniqueObjectiveIds(objectives);
		if (loadVersion === this.cacheVersion) {
			this.cache.set(period, this.buildPeriodCacheEntry(objectives));
		}
		return objectives;
	}

	private async loadObjectiveSummariesForPeriod(
		period: string,
		loadVersion: number,
	): Promise<Objective[]> {
		const failures: string[] = [];
		const parsed = await Promise.all(
			this.getObjectiveFiles(period).map(async (file): Promise<Objective | null> => {
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
					this.assertObjectiveMatchesPeriod(objective, period);
					const summary: Objective = {
						...objective,
						keyResults: objective.keyResults.map((keyResult) => ({
							...keyResult,
							checkIns: [] as CheckIn[],
						})),
					};
					return summary;
				} catch (error) {
					const message =
						error instanceof Error ? error.message : this.t("errors.unknown");
					failures.push(`${file.path}: ${message}`);
					return null;
				}
			}),
		);
		if (failures.length > 0) {
			throw new Error(
				this.t("errors.invalidObjectiveFiles", {
					files: failures.join("; "),
				}),
			);
		}

		const objectives = parsed
			.filter((item): item is Objective => item !== null)
			.sort((left, right) => compareObjectiveIds(left.id, right.id));
		this.assertUniqueObjectiveIds(objectives);
		if (loadVersion === this.cacheVersion) {
			this.summaryCache.set(
				period,
				this.buildPeriodCacheEntry(objectives),
			);
		}
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
		const objectives = await this.getObjectiveSummaries(normalizedPeriod);
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
			const objectives = await this.getObjectiveSummaries(period);
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

	private async mutateObjective(
		file: TFile,
		mutation: (current: Objective) => Objective,
	): Promise<Objective> {
		const path = file.path;
		const previous = this.mutationQueues.get(path) ?? Promise.resolve();
		let release!: () => void;
		const current = new Promise<void>((resolve) => {
			release = resolve;
		});
		const queue = previous.catch(() => undefined).then(() => current);
		this.mutationQueues.set(path, queue);
		await previous.catch(() => undefined);

		try {
			let updated: Objective | null = null;
			await this.app.vault.process(file, (content) => {
				const latest = this.normalizeObjective(
					this.parser.parseObjectiveContent(file, content),
				);
				updated = this.normalizeObjective(mutation(latest));
				return this.buildUpdatedObjectiveContent(content, updated);
			});
			const result = updated as Objective | null;
			if (!result) {
				throw new Error(this.t("errors.objectiveNotFound", { id: file.path }));
			}
			this.upsertObjectiveInCaches(result);
			return result;
		} finally {
			release();
			if (this.mutationQueues.get(path) === queue) {
				this.mutationQueues.delete(path);
			}
		}
	}

	private buildUpdatedObjectiveContent(
		content: string,
		objective: Objective,
	): string {
		const frontmatter = {
			[FRONTMATTER_OKR_TYPE]: OKR_TYPE_OBJECTIVE,
			...this.parser.buildObjectiveFrontmatter(objective),
			[FRONTMATTER_TAGS]: ["okr", "objective"],
		};
		const body = this.parser.syncCheckInsMarkdown(content, objective);
		return `---\n${stringifyYaml(frontmatter).trim()}\n---\n\n${body.trimStart()}`;
	}

	private getObjectiveFiles(period: string): TFile[] {
		const periodFolder = this.app.vault.getAbstractFileByPath(
			this.getPeriodDir(period),
		);
		if (!(periodFolder instanceof TFolder)) {
			return [];
		}

		return collectMarkdownFilesFromTree(periodFolder) as TFile[];
	}

	private getValidCache(
		period: string,
		cache: Map<string, PeriodCacheEntry> = this.cache,
	): PeriodCacheEntry | null {
		const entry = cache.get(period);
		if (!entry) {
			return null;
		}

		if (Date.now() - entry.timestamp > this.CACHE_TTL) {
			cache.delete(period);
			return null;
		}

		return entry;
	}

	private invalidatePeriodCaches(period: string): void {
		this.cacheVersion += 1;
		this.cache.delete(period);
		this.summaryCache.delete(period);
	}

	private upsertObjectiveInCaches(objective: Objective): void {
		this.cacheVersion += 1;
		this.upsertObjectiveInCache(this.cache, objective, false);
		this.upsertObjectiveInCache(this.summaryCache, objective, true);
	}

	private upsertObjectiveInCache(
		cache: Map<string, PeriodCacheEntry>,
		objective: Objective,
		stripCheckIns: boolean,
	): void {
		const entry = cache.get(objective.period);
		if (!entry) {
			return;
		}

		const replacement: Objective = stripCheckIns
			? {
					...objective,
					keyResults: objective.keyResults.map((keyResult) => ({
						...keyResult,
						checkIns: [],
					})),
				}
			: objective;
		const objectives = entry.objectives.filter(
			(item) => item.filePath !== objective.filePath && item.id !== objective.id,
		);
		objectives.push(replacement);
		objectives.sort((left, right) => compareObjectiveIds(left.id, right.id));
		entry.objectives = objectives;
		entry.keyResultsByObjective = new Map(
			objectives.map((item) => [item.id, item.keyResults]),
		);
		entry.allKeyResults = objectives.flatMap((item) => item.keyResults);
		entry.checkIns = new Map(
			entry.allKeyResults.map((keyResult) => [
				keyResult.id,
				keyResult.checkIns,
			]),
		);
		entry.timestamp = Date.now();
	}

	private buildPeriodCacheEntry(objectives: Objective[]): PeriodCacheEntry {
		const allKeyResults = objectives.flatMap(
			(objective) => objective.keyResults,
		);
		return {
			objectives,
			keyResultsByObjective: new Map(
				objectives.map((objective) => [objective.id, objective.keyResults]),
			),
			allKeyResults,
			checkIns: new Map(
				allKeyResults.map((keyResult) => [
					keyResult.id,
					keyResult.checkIns,
				]),
			),
			timestamp: Date.now(),
		};
	}

	private assertObjectiveMatchesPeriod(
		objective: Objective,
		expectedPeriod: string,
	): void {
		if (objective.period !== expectedPeriod) {
			throw new Error(
				this.t("errors.objectivePeriodMismatch", {
					actual: objective.period,
					expected: expectedPeriod,
				}),
			);
		}
	}

	private assertUniqueObjectiveIds(objectives: Objective[]): void {
		const pathsById = new Map<string, string[]>();
		for (const objective of objectives) {
			const paths = pathsById.get(objective.id) ?? [];
			paths.push(objective.filePath);
			pathsById.set(objective.id, paths);
		}

		for (const [id, paths] of pathsById) {
			if (paths.length > 1) {
				throw new Error(
					this.t("errors.duplicateObjectiveId", {
						id,
						files: paths.join(", "),
					}),
				);
			}
		}
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
				throw new Error(
					this.t("errors.pathOccupiedByFile", { path: currentPath }),
				);
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

		return (this.parser.clampProgress(progress) / 100) * keyResult.target;
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

	private hasLegacyCheckIns(frontmatter: Record<string, unknown>): boolean {
		const keyResults = frontmatter["key-results"];
		if (!Array.isArray(keyResults)) {
			return false;
		}

		return keyResults.some((item) => {
			if (!item || typeof item !== "object") {
				return false;
			}

			return "checkIns" in item;
		});
	}

	private buildObjectiveContent(objective: Objective): string {
		const frontmatter = {
			[FRONTMATTER_OKR_TYPE]: OKR_TYPE_OBJECTIVE,
			...this.parser.buildObjectiveFrontmatter(objective),
			[FRONTMATTER_TAGS]: ["okr", "objective"],
		};

		const body = `## ${this.t("template.backgroundHeading")}\n\n${objective.description || this.t("template.backgroundPlaceholder")}\n\n## ${this.t("template.keyResultsHeading")}\n\n${OKR_KR_LIST_START}\n${this.t("template.autoRenderKrList")}\n${OKR_KR_LIST_END}\n`;

		return `---\n${stringifyYaml(frontmatter).trim()}\n---\n\n${this.parser.syncCheckInsMarkdown(body, objective)}`;
	}

	private t(key: string, values?: Record<string, TranslationValue>): string {
		return this.i18n.t(key, values);
	}
}
