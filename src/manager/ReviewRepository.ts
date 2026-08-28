import { App, stringifyYaml, TFile, TFolder } from "obsidian";
import {
	FRONTMATTER_CREATED_AT,
	FRONTMATTER_OKR_PERIOD,
	FRONTMATTER_OKR_PERIOD_TYPE,
	FRONTMATTER_OKR_TYPE,
	FRONTMATTER_REVIEW_DATE,
	FRONTMATTER_REVIEW_ID,
	FRONTMATTER_REVIEW_TYPE,
	FRONTMATTER_REVIEW_VERSION,
	FRONTMATTER_SNAPSHOT,
	FRONTMATTER_UPDATED_AT,
	OKR_REVIEW_CONTENT_END,
	OKR_REVIEW_CONTENT_START,
	OKR_REVIEW_SNAPSHOT_END,
	OKR_REVIEW_SNAPSHOT_START,
	OKR_TYPE_PERIOD_REVIEW,
	PERIOD_REVIEWS_DIR,
	PERIOD_REVIEW_VERSION,
} from "../constants";
import type {
	HealthAssessment,
	HealthReason,
	HealthStatus,
	OKRPeriodType,
	OKRPluginSettings,
	OKRStatus,
	PeriodReview,
	PeriodReviewType,
	ReviewSections,
	ReviewSnapshot,
} from "../types";
import { parseLocalDate } from "../utils/date";
import { normalizeVaultPath } from "../utils/path";
import {
	createEmptyReviewSections,
	getReviewFileName,
	getReviewSectionKeys,
	getReviewSectionTitle,
} from "../utils/review";
import { FileParser } from "./FileParser";

const REVIEW_TYPES = new Set<PeriodReviewType>([
	"weekly",
	"mid-cycle",
	"retrospective",
]);
const PERIOD_TYPES = new Set<OKRPeriodType>([
	"week",
	"month",
	"quarter",
	"year",
]);
const HEALTH_STATUSES = new Set<HealthStatus>([
	"on-track",
	"at-risk",
	"off-track",
	"not-applicable",
]);
const HEALTH_REASONS = new Set<HealthReason>([
	"behind-schedule",
	"medium-confidence",
	"low-confidence",
	"blocked",
	"on-hold",
	"overdue",
]);
const OKR_STATUSES = new Set<OKRStatus>([
	"active",
	"completed",
	"cancelled",
	"on-hold",
]);

export class ReviewRepository {
	private readonly cache = new Map<string, PeriodReview>();

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
		this.cache.clear();
	}

	invalidatePath(path: string): boolean {
		const normalized = normalizeVaultPath(path);
		const reviewsSegment = `/${PERIOD_REVIEWS_DIR}/`;
		if (!normalized.includes(reviewsSegment)) {
			return false;
		}
		this.cache.delete(normalized);
		return true;
	}

	async listReviews(period: string): Promise<PeriodReview[]> {
		const folder = this.app.vault.getAbstractFileByPath(this.getReviewsDir(period));
		if (!(folder instanceof TFolder)) {
			return [];
		}
		const reviews: PeriodReview[] = [];
		for (const child of folder.children) {
			if (!(child instanceof TFile) || child.extension !== "md") {
				continue;
			}
			const cached = this.cache.get(child.path);
			if (cached) {
				reviews.push(cached);
				continue;
			}
			const content = await this.app.vault.read(child);
			const frontmatter = this.parser.parseFrontmatterContent(content, child.path);
			if (frontmatter[FRONTMATTER_OKR_TYPE] !== OKR_TYPE_PERIOD_REVIEW) {
				continue;
			}
			const review = this.parseReview(frontmatter, content, child.path, period);
			this.cache.set(child.path, review);
			reviews.push(review);
		}
		return reviews.sort((left, right) =>
			right.reviewDate.localeCompare(left.reviewDate) ||
			left.type.localeCompare(right.type),
		);
	}

	async getReview(period: string, reviewId: string): Promise<PeriodReview | null> {
		return (
			(await this.listReviews(period)).find((review) => review.id === reviewId) ??
			null
		);
	}

	async createReview(
		review: Omit<PeriodReview, "filePath">,
	): Promise<PeriodReview> {
		const existing = await this.listReviews(review.period);
		if (
			existing.some((item) =>
				review.type === "weekly"
					? item.type === "weekly" && item.reviewDate === review.reviewDate
					: item.type === review.type,
			)
		) {
			throw new Error(`Period review already exists: ${review.type}`);
		}
		await this.ensureFolder(this.getReviewsDir(review.period));
		const path = normalizeVaultPath(
			`${this.getReviewsDir(review.period)}/${getReviewFileName(review.type, review.reviewDate)}`,
		);
		if (this.app.vault.getAbstractFileByPath(path)) {
			throw new Error(`Period review path already exists: ${path}`);
		}
		const complete = { ...review, filePath: path };
		await this.app.vault.create(path, this.buildNewReviewContent(complete));
		this.cache.set(path, complete);
		return complete;
	}

	async updateReview(
		period: string,
		reviewId: string,
		sections: ReviewSections,
		updatedAt: string,
	): Promise<PeriodReview> {
		const review = await this.getReview(period, reviewId);
		if (!review) {
			throw new Error(`Period review not found: ${reviewId}`);
		}
		const file = this.app.vault.getAbstractFileByPath(review.filePath);
		if (!(file instanceof TFile)) {
			throw new Error(`Period review file not found: ${review.filePath}`);
		}
		const updated = { ...review, sections, updatedAt };
		await this.app.vault.process(file, (content) =>
			this.buildUpdatedReviewContent(content, updated),
		);
		this.cache.set(review.filePath, updated);
		return updated;
	}

	async deleteReview(period: string, reviewId: string): Promise<void> {
		const review = await this.getReview(period, reviewId);
		if (!review) {
			throw new Error(`Period review not found: ${reviewId}`);
		}
		const file = this.app.vault.getAbstractFileByPath(review.filePath);
		if (!(file instanceof TFile)) {
			throw new Error(`Period review file not found: ${review.filePath}`);
		}
		await this.app.fileManager.trashFile(file);
		this.cache.delete(review.filePath);
	}

	private parseReview(
		frontmatter: Record<string, unknown>,
		content: string,
		path: string,
		expectedPeriod: string,
	): PeriodReview {
		if (frontmatter[FRONTMATTER_REVIEW_VERSION] !== PERIOD_REVIEW_VERSION) {
			throw new Error(`Unsupported period review version in ${path}`);
		}
		const period = this.requireString(
			frontmatter[FRONTMATTER_OKR_PERIOD],
			FRONTMATTER_OKR_PERIOD,
			path,
		);
		if (period !== expectedPeriod) {
			throw new Error(`Period review folder mismatch in ${path}`);
		}
		const type = this.requireReviewType(
			frontmatter[FRONTMATTER_REVIEW_TYPE],
			path,
		);
		const reviewDate = this.requireString(
			frontmatter[FRONTMATTER_REVIEW_DATE],
			FRONTMATTER_REVIEW_DATE,
			path,
		);
		if (!parseLocalDate(reviewDate)) {
			throw new Error(`Invalid review date in ${path}`);
		}
		return {
			id: this.requireUuid(frontmatter[FRONTMATTER_REVIEW_ID], path),
			period,
			periodType: this.requirePeriodType(
				frontmatter[FRONTMATTER_OKR_PERIOD_TYPE],
				path,
			),
			type,
			reviewDate,
			createdAt: this.requireTimestamp(
				frontmatter[FRONTMATTER_CREATED_AT],
				FRONTMATTER_CREATED_AT,
				path,
			),
			updatedAt: this.requireTimestamp(
				frontmatter[FRONTMATTER_UPDATED_AT],
				FRONTMATTER_UPDATED_AT,
				path,
			),
			filePath: path,
			sections: this.parseSections(content, type),
			snapshot: this.parseSnapshot(frontmatter[FRONTMATTER_SNAPSHOT], path),
		};
	}

	private parseSections(
		content: string,
		type: PeriodReviewType,
	): ReviewSections {
		const sections = createEmptyReviewSections();
		for (const key of getReviewSectionKeys(type)) {
			const pattern = new RegExp(
				`<!-- OKR-REVIEW-SECTION:${key}-START -->\\r?\\n([\\s\\S]*?)\\r?\\n<!-- OKR-REVIEW-SECTION:${key}-END -->`,
			);
			sections[key] = content.match(pattern)?.[1]?.trim() ?? "";
		}
		return sections;
	}

	private parseSnapshot(value: unknown, path: string): ReviewSnapshot {
		const record = this.requireRecord(value, "snapshot", path);
		const capturedAt = this.requireTimestamp(
			record["captured-at"],
			"captured-at",
			path,
		);
		const objectives = record.objectives;
		if (!Array.isArray(objectives)) {
			throw new Error(`Invalid review snapshot objectives in ${path}`);
		}
		return {
			capturedAt,
			objectives: objectives.map((value) => {
				const objective = this.requireRecord(value, "snapshot objective", path);
				const keyResults = objective["key-results"];
				if (!Array.isArray(keyResults)) {
					throw new Error(`Invalid review snapshot key results in ${path}`);
				}
				return {
					id: this.requireString(objective.id, "objective id", path),
					title: this.requireString(objective.title, "objective title", path),
					status: this.requireOkrStatus(objective.status, path),
					progress: this.requireProgress(objective.progress, path),
					health: this.parseHealth(objective.health, path),
					keyResults: keyResults.map((value) => {
						const keyResult = this.requireRecord(
							value,
							"snapshot key result",
							path,
						);
						return {
							id: this.requireString(keyResult.id, "key result id", path),
							title: this.requireString(
								keyResult.title,
								"key result title",
								path,
							),
							status: this.requireOkrStatus(keyResult.status, path),
							weight: this.requirePositiveNumber(keyResult.weight, "weight", path),
							normalizedWeight: this.requireProgress(
								keyResult["normalized-weight"],
								path,
							),
							progress: this.requireProgress(keyResult.progress, path),
							health: this.parseHealth(keyResult.health, path),
						};
					}),
				};
			}),
		};
	}

	private parseHealth(value: unknown, path: string): HealthAssessment {
		const record = this.requireRecord(value, "health", path);
		const status = record.status;
		if (typeof status !== "string" || !HEALTH_STATUSES.has(status as HealthStatus)) {
			throw new Error(`Invalid health status in ${path}`);
		}
		const score = record.score;
		if (score !== null && (typeof score !== "number" || score < 0 || score > 100)) {
			throw new Error(`Invalid health score in ${path}`);
		}
		const expectedProgress = record["expected-progress"];
		if (
			expectedProgress !== null &&
			(typeof expectedProgress !== "number" ||
				expectedProgress < 0 ||
				expectedProgress > 100)
		) {
			throw new Error(`Invalid expected progress in ${path}`);
		}
		const reasons = record.reasons;
		if (
			!Array.isArray(reasons) ||
			!reasons.every(
				(reason) =>
					typeof reason === "string" &&
					HEALTH_REASONS.has(reason as HealthReason),
			)
		) {
			throw new Error(`Invalid health reasons in ${path}`);
		}
		return {
			score,
			status: status as HealthStatus,
			expectedProgress,
			reasons: reasons as HealthReason[],
		};
	}

	private buildNewReviewContent(review: PeriodReview): string {
		const title = `# ${this.getReviewTitle(review.type)} · ${review.period} · ${review.reviewDate}`;
		return this.buildReviewContent({}, `${title}\n\n`, review);
	}

	private buildUpdatedReviewContent(
		content: string,
		review: PeriodReview,
	): string {
		const current = this.parser.parseFrontmatterContent(content, review.filePath);
		const body = this.stripFrontmatter(content);
		return this.buildReviewContent(current, body, review);
	}

	private buildReviewContent(
		currentFrontmatter: Record<string, unknown>,
		body: string,
		review: PeriodReview,
	): string {
		const frontmatter = {
			...currentFrontmatter,
			...this.serializeReview(review),
		};
		let updatedBody = this.replaceManagedBlock(
			body,
			OKR_REVIEW_SNAPSHOT_START,
			OKR_REVIEW_SNAPSHOT_END,
			this.buildSnapshotBlock(review.snapshot),
		);
		updatedBody = this.replaceManagedBlock(
			updatedBody,
			OKR_REVIEW_CONTENT_START,
			OKR_REVIEW_CONTENT_END,
			this.buildSectionsBlock(review.type, review.sections),
		);
		return `---\n${stringifyYaml(frontmatter).trim()}\n---\n\n${updatedBody.trim()}\n`;
	}

	private replaceManagedBlock(
		body: string,
		start: string,
		end: string,
		block: string,
	): string {
		const replacement = `${start}\n${block.trim()}\n${end}`;
		const pattern = new RegExp(
			`${this.escapeRegExp(start)}[\\s\\S]*?${this.escapeRegExp(end)}`,
		);
		if (pattern.test(body)) {
			return body.replace(pattern, replacement);
		}
		return `${body.trimEnd()}\n\n${replacement}\n`;
	}

	private buildSnapshotBlock(snapshot: ReviewSnapshot): string {
		const lines = [
			"## Snapshot",
			"",
			`Captured at: ${snapshot.capturedAt}`,
		];
		for (const objective of snapshot.objectives) {
			lines.push(
				"",
				`### ${this.escapeMarkdown(objective.id)} · ${this.escapeMarkdown(objective.title)}`,
				"",
				`Progress: ${objective.progress}% · Health: ${objective.health.score ?? "-"} (${objective.health.status}) · Status: ${objective.status}`,
				"",
				"| KR | Weight | Progress | Health | Status |",
				"| --- | ---: | ---: | ---: | --- |",
			);
			for (const keyResult of objective.keyResults) {
				lines.push(
					`| ${this.escapeMarkdown(`${keyResult.id} ${keyResult.title}`)} | ${keyResult.weight} (${keyResult.normalizedWeight}%) | ${keyResult.progress}% | ${keyResult.health.score ?? "-"} (${keyResult.health.status}) | ${keyResult.status} |`,
				);
			}
		}
		return lines.join("\n");
	}

	private buildSectionsBlock(
		type: PeriodReviewType,
		sections: ReviewSections,
	): string {
		return getReviewSectionKeys(type)
			.map(
				(key) =>
					`## ${getReviewSectionTitle(key)}\n\n<!-- OKR-REVIEW-SECTION:${key}-START -->\n${sections[key].trim()}\n<!-- OKR-REVIEW-SECTION:${key}-END -->`,
			)
			.join("\n\n");
	}

	private serializeReview(review: PeriodReview): Record<string, unknown> {
		return {
			[FRONTMATTER_OKR_TYPE]: OKR_TYPE_PERIOD_REVIEW,
			[FRONTMATTER_REVIEW_VERSION]: PERIOD_REVIEW_VERSION,
			[FRONTMATTER_REVIEW_ID]: review.id,
			[FRONTMATTER_OKR_PERIOD]: review.period,
			[FRONTMATTER_OKR_PERIOD_TYPE]: review.periodType,
			[FRONTMATTER_REVIEW_TYPE]: review.type,
			[FRONTMATTER_REVIEW_DATE]: review.reviewDate,
			[FRONTMATTER_CREATED_AT]: review.createdAt,
			[FRONTMATTER_UPDATED_AT]: review.updatedAt,
			[FRONTMATTER_SNAPSHOT]: {
				"captured-at": review.snapshot.capturedAt,
				objectives: review.snapshot.objectives.map((objective) => ({
					id: objective.id,
					title: objective.title,
					status: objective.status,
					progress: objective.progress,
					health: this.serializeHealth(objective.health),
					"key-results": objective.keyResults.map((keyResult) => ({
						id: keyResult.id,
						title: keyResult.title,
						status: keyResult.status,
						weight: keyResult.weight,
						"normalized-weight": keyResult.normalizedWeight,
						progress: keyResult.progress,
						health: this.serializeHealth(keyResult.health),
					})),
				})),
			},
		};
	}

	private serializeHealth(health: HealthAssessment): Record<string, unknown> {
		return {
			score: health.score,
			status: health.status,
			"expected-progress": health.expectedProgress,
			reasons: health.reasons,
		};
	}

	private async ensureFolder(path: string): Promise<void> {
		const segments = normalizeVaultPath(path).split("/").filter(Boolean);
		let current = "";
		for (const segment of segments) {
			current = current ? `${current}/${segment}` : segment;
			const existing = this.app.vault.getAbstractFileByPath(current);
			if (!existing) {
				await this.app.vault.createFolder(current);
			} else if (!(existing instanceof TFolder)) {
				throw new Error(`Path is already occupied by a file: ${current}`);
			}
		}
	}

	private getReviewsDir(period: string): string {
		return normalizeVaultPath(
			`${this.settings.rootDir}/${period}/${PERIOD_REVIEWS_DIR}`,
		);
	}

	private stripFrontmatter(content: string): string {
		return content.replace(
			/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/,
			"",
		);
	}

	private escapeRegExp(value: string): string {
		return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	private escapeMarkdown(value: string): string {
		return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
	}

	private getReviewTitle(type: PeriodReviewType): string {
		return type === "weekly"
			? "Weekly review"
			: type === "mid-cycle"
				? "Mid-cycle review"
				: "Period retrospective";
	}

	private requireRecord(
		value: unknown,
		field: string,
		path: string,
	): Record<string, unknown> {
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			throw new Error(`Invalid ${field} in ${path}`);
		}
		return value as Record<string, unknown>;
	}

	private requireString(value: unknown, field: string, path: string): string {
		if (typeof value !== "string" || value.trim().length === 0) {
			throw new Error(`Invalid ${field} in ${path}`);
		}
		return value;
	}

	private requireUuid(value: unknown, path: string): string {
		const id = this.requireString(value, FRONTMATTER_REVIEW_ID, path);
		if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
			throw new Error(`Invalid review UUID in ${path}`);
		}
		return id;
	}

	private requireTimestamp(value: unknown, field: string, path: string): string {
		const timestamp = this.requireString(value, field, path);
		if (Number.isNaN(Date.parse(timestamp))) {
			throw new Error(`Invalid ${field} in ${path}`);
		}
		return timestamp;
	}

	private requireReviewType(value: unknown, path: string): PeriodReviewType {
		if (typeof value !== "string" || !REVIEW_TYPES.has(value as PeriodReviewType)) {
			throw new Error(`Invalid review type in ${path}`);
		}
		return value as PeriodReviewType;
	}

	private requirePeriodType(value: unknown, path: string): OKRPeriodType {
		if (typeof value !== "string" || !PERIOD_TYPES.has(value as OKRPeriodType)) {
			throw new Error(`Invalid period type in ${path}`);
		}
		return value as OKRPeriodType;
	}

	private requireOkrStatus(value: unknown, path: string): OKRStatus {
		if (typeof value !== "string" || !OKR_STATUSES.has(value as OKRStatus)) {
			throw new Error(`Invalid OKR status in ${path}`);
		}
		return value as OKRStatus;
	}

	private requireProgress(value: unknown, path: string): number {
		if (typeof value !== "number" || value < 0 || value > 100) {
			throw new Error(`Invalid progress in ${path}`);
		}
		return value;
	}

	private requirePositiveNumber(
		value: unknown,
		field: string,
		path: string,
	): number {
		if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
			throw new Error(`Invalid ${field} in ${path}`);
		}
		return value;
	}
}
