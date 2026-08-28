import { App, Modal, Notice } from "obsidian";
import { OKRManager } from "../manager/OKRManager";
import type {
	PeriodReview,
	PeriodReviewType,
	ReviewSectionKey,
	ReviewSections,
} from "../types";
import { getTodayLocalDate } from "../utils/date";
import {
	createEmptyReviewSections,
	getReviewSectionKeys,
	hasRequiredReviewContent,
} from "../utils/review";

export class ReviewEditorModal extends Modal {
	private reviewDate: string;
	private sections: ReviewSections;
	private isSubmitting = false;
	private saveButton: HTMLButtonElement | null = null;

	constructor(
		app: App,
		private manager: OKRManager,
		private period: string,
		private type: PeriodReviewType,
		private review?: PeriodReview,
		private onComplete?: (review: PeriodReview) => void,
	) {
		super(app);
		this.reviewDate = review?.reviewDate ?? getTodayLocalDate();
		this.sections = review
			? { ...review.sections }
			: createEmptyReviewSections();
	}

	onOpen(): void {
		void super.onOpen();
		this.modalEl.addClass("okr-modal", "okr-review-editor-modal");
		this.render();
	}

	onClose(): void {
		super.onClose();
		this.contentEl.empty();
	}

	private render(): void {
		this.contentEl.empty();
		this.contentEl.createEl("h2", {
			cls: "okr-modal-title",
			text: this.t(
				this.review ? "modals.reviews.editTitle" : "modals.reviews.createTitle",
				{ type: this.t(`review.type.${this.type}`), period: this.period },
			),
		});

		const dateField = this.contentEl.createDiv("okr-field");
		this.createRequiredLabel(dateField, this.t("modals.reviews.reviewDate"));
		const dateInput = dateField.createEl("input", {
			cls: "okr-input",
			type: "date",
		});
		dateInput.value = this.reviewDate;
		dateInput.disabled = this.review != null;
		dateInput.addEventListener("change", () => {
			this.reviewDate = dateInput.value;
			this.validate();
		});

		if (!this.review) {
			this.contentEl.createEl("p", {
				cls: "okr-review-snapshot-note",
				text: this.t("modals.reviews.snapshotNotice"),
			});
		}

		for (const key of getReviewSectionKeys(this.type)) {
			this.renderSectionField(key);
		}

		const footer = this.contentEl.createDiv("okr-modal-footer");
		const cancel = footer.createEl("button", {
			cls: "okr-btn-cancel",
			text: this.t("actions.cancel"),
		});
		cancel.addEventListener("click", () => this.close());
		this.saveButton = footer.createEl("button", {
			cls: "okr-btn-confirm",
			text: this.t("actions.save"),
		});
		this.saveButton.addEventListener("click", () => void this.submit());
		this.validate();
	}

	private renderSectionField(key: ReviewSectionKey): void {
		const field = this.contentEl.createDiv("okr-field");
		const label = this.t(`review.section.${key}`);
		if (this.isRequiredSection(key)) {
			this.createRequiredLabel(field, label);
		} else {
			field.createEl("label", { cls: "okr-label", text: label });
		}
		const input = field.createEl("textarea", {
			cls: "okr-textarea okr-review-textarea",
			placeholder: this.t(`review.placeholder.${key}`),
		});
		input.value = this.sections[key];
		input.addEventListener("input", () => {
			this.sections[key] = input.value.trim();
			this.validate();
		});
	}

	private isRequiredSection(key: ReviewSectionKey): boolean {
		return (
			key === "summary" ||
			(this.type === "weekly" && key === "next-steps") ||
			(this.type === "mid-cycle" && key === "decisions") ||
			(this.type === "retrospective" &&
				(key === "lessons" || key === "follow-ups"))
		);
	}

	private validate(): boolean {
		const valid =
			!this.isSubmitting &&
			this.reviewDate.length > 0 &&
			hasRequiredReviewContent(this.type, this.sections);
		if (this.saveButton) {
			this.saveButton.disabled = !valid;
		}
		return valid;
	}

	private async submit(): Promise<void> {
		if (!this.validate()) {
			return;
		}
		this.isSubmitting = true;
		this.validate();
		try {
			const saved = this.review
				? await this.manager.updatePeriodReview({
						period: this.period,
						reviewId: this.review.id,
						sections: this.sections,
					})
				: await this.manager.createPeriodReview({
						period: this.period,
						type: this.type,
						reviewDate: this.reviewDate,
						sections: this.sections,
					});
			new Notice(this.t("notices.reviewSaved"));
			this.onComplete?.(saved);
			this.close();
		} catch (error) {
			new Notice(
				error instanceof Error ? error.message : this.t("errors.unknown"),
			);
		} finally {
			this.isSubmitting = false;
			this.validate();
		}
	}

	private createRequiredLabel(container: HTMLElement, text: string): void {
		const label = container.createEl("label", { cls: "okr-label" });
		label.append(text);
		label.createSpan({ cls: "okr-required", text: " *" });
	}

	private t(key: string, values?: Record<string, string | number>): string {
		return this.manager.getI18n().t(key, values);
	}
}
