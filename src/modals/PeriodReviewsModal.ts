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
import { associateFields } from "../utils/form";

export class PeriodReviewsModal extends Modal {
	private period = "";
	private periodInfo: OKRPeriodInfo | null = null;
	private reviews: PeriodReviewSummary[] = [];
	private active = false;
	private loading = false;
	private request = 0;
	private generation = 0;
	private loadError = "";
	private periodInfos: OKRPeriodInfo[] = [];

	constructor(
		app: App,
		private manager: OKRManager,
		initialPeriod = "",
		private onComplete?: () => void | Promise<void>,
	) {
		super(app);
		this.period = initialPeriod;
	}

	onOpen(): void {
		this.active = true;
		this.generation++;
		void super.onOpen();
		this.modalEl.addClass("okr-modal", "okr-period-reviews-modal");
		void this.load();
	}

	onClose(): void {
		this.active = false;
		this.generation++;
		this.request++;
		super.onClose();
		this.contentEl.empty();
	}

	private async load(): Promise<void> {
		await this.loadPeriodData();
	}

	private async loadPeriodData(infos?: OKRPeriodInfo[]): Promise<void> {
		const request = ++this.request;
		const generation = this.generation;
		let period = this.period;
		const current = (): boolean => this.active && request === this.request && generation === this.generation;
		this.loading = true;
		this.loadError = "";
		this.reviews = [];
		this.periodInfo = null;
		if (this.active) this.render(infos ?? this.periodInfos);
		try {
			const periodInfos = infos ?? await this.manager.getPeriodInfos({ includeArchived: true });
			if (!current()) return;
			if (!period) period = periodInfos[periodInfos.length - 1]?.period ?? "";
			const periodInfo = periodInfos.find(info => info.period === period) ?? null;
			const reviews = periodInfo ? await this.manager.listPeriodReviews(period) : [];
			if (!current()) return;
			this.period = period;
			this.periodInfos = periodInfos;
			this.periodInfo = periodInfo;
			this.reviews = reviews;
		} catch (error) {
			if (!current()) return;
			this.loadError = error instanceof Error ? error.message : this.t("errors.unknown");
		} finally {
			if (current()) { this.loading = false; this.render(this.periodInfos); }
		}
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
		associateFields(this.contentEl);
		if (this.loading) {
			this.contentEl.createEl("p", { text: this.t("common.loading") });
			return;
		}
		if (this.loadError) {
			this.contentEl.createEl("p", { text: this.loadError, attr: { role: "alert" } });
			const retry = this.contentEl.createEl("button", { text: this.t("actions.retry"), attr: { type: "button" } });
			retry.addEventListener("click", () => { void this.loadPeriodData(); });
			return;
		}

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
		associateFields(this.contentEl);
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
			if (!this.active || this.loading) return;
			const generation = this.generation;
			new ConfirmModal(this.app, {
				title: this.t("modals.reviews.deleteTitle"),
				message: this.t("modals.reviews.deleteConfirm"),
				confirmText: this.t("actions.delete"),
				onConfirm: async () => {
					if (!this.active || generation !== this.generation) return;
					await this.manager.deletePeriodReview(review.period, review.id);
					new Notice(this.t("notices.reviewDeleted"));
					try { await this.onComplete?.(); }
					catch { new Notice(this.t("modals.savedFollowUpFailed")); }
					if (this.active && generation === this.generation) await this.loadPeriodData();
				},
			}).open();
		});
	}

	private openEditor(type: PeriodReviewType, review?: PeriodReview): void {
		if (!this.active || this.loading) return;
		const generation = this.generation;
		new ReviewEditorModal(
			this.app,
			this.manager,
			review?.period ?? this.period,
			type,
			review,
			async () => {
				if (!this.active || generation !== this.generation) return;
				await this.onComplete?.();
				if (this.active && generation === this.generation) await this.loadPeriodData();
			},
		).open();
	}

	private async editReview(summary: PeriodReviewSummary): Promise<void> {
		if (!this.active || this.loading) return;
		const request = this.request, generation = this.generation;
		try {
		const review = await this.manager.getPeriodReview(summary.period, summary.id);
		if (!this.active || request !== this.request || generation !== this.generation) return;
		if (!review) {
			new Notice(this.t("errors.reviewNotFound", { id: summary.id }));
			return;
		}
		this.openEditor(review.type, review);
		} catch (error) {
			if (this.active && request === this.request && generation === this.generation) new Notice(error instanceof Error ? error.message : this.t("errors.unknown"));
		}
	}

	private async openFile(path: string): Promise<void> {
		if (!this.active || this.loading) return;
		try {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new Notice(this.t("errors.reviewFileMissing", { path }));
			return;
		}
		await this.app.workspace.getLeaf().openFile(file);
		} catch (error) { new Notice(error instanceof Error ? error.message : this.t("errors.unknown")); }
	}

	private t(key: string, values?: Record<string, string | number>): string {
		return this.manager.getI18n().t(key, values);
	}
}
