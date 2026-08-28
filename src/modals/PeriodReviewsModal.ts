import { App, Modal, Notice, TFile } from "obsidian";
import { OKRManager } from "../manager/OKRManager";
import type {
	OKRPeriodInfo,
	PeriodReview,
	PeriodReviewSummary,
	PeriodReviewType,
} from "../types";
import { ConfirmModal } from "./ConfirmModal";
import { ReviewEditorModal } from "./ReviewEditorModal";

export class PeriodReviewsModal extends Modal {
	private period = "";
	private periodInfo: OKRPeriodInfo | null = null;
	private reviews: PeriodReviewSummary[] = [];

	constructor(
		app: App,
		private manager: OKRManager,
		initialPeriod = "",
		private onComplete?: () => void,
	) {
		super(app);
		this.period = initialPeriod;
	}

	onOpen(): void {
		void super.onOpen();
		this.modalEl.addClass("okr-modal", "okr-period-reviews-modal");
		void this.load();
	}

	onClose(): void {
		super.onClose();
		this.contentEl.empty();
	}

	private async load(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.createEl("h2", {
			cls: "okr-modal-title",
			text: this.t("modals.reviews.title"),
		});
		this.contentEl.createDiv({ text: this.t("common.loading") });
		try {
			const infos = await this.manager.getPeriodInfos({ includeArchived: true });
			if (!this.period || !infos.some((info) => info.period === this.period)) {
				this.period = infos[infos.length - 1]?.period ?? "";
			}
			await this.loadPeriodData(infos);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : this.t("errors.unknown"));
			this.close();
		}
	}

	private async loadPeriodData(infos?: OKRPeriodInfo[]): Promise<void> {
		const periodInfos =
			infos ?? (await this.manager.getPeriodInfos({ includeArchived: true }));
		this.periodInfo =
			periodInfos.find((info) => info.period === this.period) ?? null;
		this.reviews = this.period
			? await this.manager.listPeriodReviews(this.period)
			: [];
		this.render(periodInfos);
	}

	private render(periodInfos: OKRPeriodInfo[]): void {
		this.contentEl.empty();
		this.contentEl.createEl("h2", {
			cls: "okr-modal-title",
			text: this.t("modals.reviews.title"),
		});

		const periodField = this.contentEl.createDiv("okr-field");
		periodField.createEl("label", {
			cls: "okr-label",
			text: this.t("modals.reviews.period"),
		});
		const periodSelect = periodField.createEl("select", { cls: "okr-select" });
		if (periodInfos.length === 0) {
			periodSelect.createEl("option", { text: this.t("dashboard.noPeriods") });
			periodSelect.disabled = true;
		}
		for (const info of periodInfos) {
			periodSelect.createEl("option", {
				value: info.period,
				text: `${this.manager.getParser().formatPeriodLabel(info.period, info.periodType, this.manager.getI18n())} · ${this.t(`periodStatus.${info.status}`)}`,
			});
		}
		periodSelect.value = this.period;
		periodSelect.addEventListener("change", () => {
			this.period = periodSelect.value;
			void this.loadPeriodData(periodInfos);
		});

		if (this.periodInfo?.status === "open") {
			this.renderCreateActions();
		} else if (this.periodInfo) {
			this.contentEl.createEl("p", {
				cls: "okr-review-readonly-note",
				text: this.t("modals.reviews.readOnly"),
			});
		}

		const list = this.contentEl.createDiv("okr-review-list");
		if (this.reviews.length === 0) {
			list.createEl("p", { text: this.t("modals.reviews.empty") });
		}
		for (const review of this.reviews) {
			this.renderReviewRow(list, review);
		}
	}

	private renderCreateActions(): void {
		const actions = this.contentEl.createDiv("okr-review-create-actions");
		for (const type of [
			"weekly",
			"mid-cycle",
			"retrospective",
		] as PeriodReviewType[]) {
			const exists = this.reviews.some((review) => review.type === type);
			const button = actions.createEl("button", {
				cls: "okr-btn-secondary",
				text: this.t(`actions.createReview.${type}`),
			});
			button.disabled = type !== "weekly" && exists;
			button.addEventListener("click", () => this.openEditor(type));
		}
	}

	private renderReviewRow(
		container: HTMLElement,
		review: PeriodReviewSummary,
	): void {
		const row = container.createDiv("okr-review-row");
		const summary = row.createDiv("okr-review-row-summary");
		summary.createEl("strong", { text: this.t(`review.type.${review.type}`) });
		summary.createSpan({
			text: this.t("modals.reviews.summary", {
				date: review.reviewDate,
				count: review.objectiveCount,
			}),
		});
		const actions = row.createDiv("okr-review-row-actions");
		const open = actions.createEl("button", {
			cls: "okr-row-action-btn",
			text: this.t("actions.open"),
		});
		open.addEventListener("click", () => void this.openFile(review.filePath));
		if (this.periodInfo?.status !== "open") {
			return;
		}
		const edit = actions.createEl("button", {
			cls: "okr-row-action-btn",
			text: this.t("actions.edit"),
		});
		edit.addEventListener("click", () => void this.editReview(review));
		const remove = actions.createEl("button", {
			cls: "okr-row-action-btn okr-btn-danger",
			text: this.t("actions.delete"),
		});
		remove.addEventListener("click", () => {
			new ConfirmModal(this.app, {
				title: this.t("modals.reviews.deleteTitle"),
				message: this.t("modals.reviews.deleteConfirm"),
				confirmText: this.t("actions.delete"),
				onConfirm: async () => {
					await this.manager.deletePeriodReview(this.period, review.id);
					new Notice(this.t("notices.reviewDeleted"));
					this.onComplete?.();
					await this.loadPeriodData();
				},
			}).open();
		});
	}

	private openEditor(type: PeriodReviewType, review?: PeriodReview): void {
		new ReviewEditorModal(
			this.app,
			this.manager,
			this.period,
			type,
			review,
			() => {
				this.onComplete?.();
				void this.loadPeriodData();
			},
		).open();
	}

	private async editReview(summary: PeriodReviewSummary): Promise<void> {
		const review = await this.manager.getPeriodReview(this.period, summary.id);
		if (!review) {
			new Notice(this.t("errors.reviewNotFound", { id: summary.id }));
			return;
		}
		this.openEditor(review.type, review);
	}

	private async openFile(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new Notice(this.t("errors.reviewFileMissing", { path }));
			return;
		}
		await this.app.workspace.getLeaf().openFile(file);
	}

	private t(key: string, values?: Record<string, string | number>): string {
		return this.manager.getI18n().t(key, values);
	}
}
