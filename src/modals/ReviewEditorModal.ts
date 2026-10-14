import { App, Modal, Notice } from "obsidian";
import { OKRManager } from "../manager/OKRManager";
import type {
	PeriodReview,
	PeriodReviewType,
	ReviewSectionKey,
	ReviewSections,
} from "../types";
import { getTodayLocalDate, parseLocalDate } from "../utils/date";
import { associateFields, setFieldError } from "../utils/form";
import {
	createEmptyReviewSections,
	getReviewSectionKeys,
	hasRequiredReviewContent,
} from "../utils/review";

export class ReviewEditorModal extends Modal {
	private reviewDate: string;
	private sections: ReviewSections;
	private isSubmitting = false;
	private saved = false;
	private active = false;
	private generation = 0;
	private dateInput?: HTMLInputElement;
	private dateError?: HTMLElement;
	private saveButton: HTMLButtonElement | null = null;

	constructor(
		app: App,
		private manager: OKRManager,
		private period: string,
		private type: PeriodReviewType,
		private review?: PeriodReview,
		private onComplete?: (review: PeriodReview) => void | Promise<void>,
	) {
		super(app);
		this.review = review ? { ...review, sections: { ...review.sections } } : undefined;
		this.reviewDate = review?.reviewDate ?? getTodayLocalDate();
		this.sections = review
			? { ...review.sections }
			: createEmptyReviewSections();
	}

	onOpen(): void {
		if (this.isSubmitting || this.saved) return;
		this.active = true;
		this.generation++;
		void super.onOpen();
		this.modalEl.addClass("okr-modal", "okr-review-editor-modal");
		this.render();
	}

	onClose(): void {
		this.active = false;
		this.generation++;
		super.onClose();
		this.contentEl.empty();
	}

	close(): void { if (!this.isSubmitting) super.close(); }

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
		this.dateInput = dateInput;
		this.dateError = dateField.createDiv({ cls: "okr-input-error", text: this.t("modals.input.dateError") });
		const updateDate = (): void => {
			this.reviewDate = dateInput.value;
			this.validate();
		};
		dateInput.addEventListener("input", updateDate);
		dateInput.addEventListener("change", updateDate);

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
		associateFields(this.contentEl);
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
		if (!this.active) return false;
		if (this.dateInput) this.reviewDate = this.dateInput.value;
		if (this.dateInput && this.dateError) setFieldError(this.dateInput, this.dateError, !!parseLocalDate(this.reviewDate));
		const valid =
			this.active && !this.saved && !this.isSubmitting &&
			!!parseLocalDate(this.reviewDate) &&
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
		const generation = this.generation;
		const controls = Array.from(this.contentEl.querySelectorAll<HTMLInputElement>("input, select, textarea, button"));
		const disabled = controls.map(control => control.disabled);
		controls.forEach(control => { control.disabled = true; });
		this.saveButton?.setText(this.t("actions.saving"));
		const sections = { ...this.sections };
		this.validate();
		try {
			const saved = this.review
				? await this.manager.updatePeriodReview({
						period: this.period,
						reviewId: this.review.id,
						sections,
						baseSections: this.review.sections,
					})
				: await this.manager.createPeriodReview({
						period: this.period,
						type: this.type,
						reviewDate: this.reviewDate,
						sections,
					});
			new Notice(this.t("notices.reviewSaved"));
			this.saved = true;
			if (this.active && generation === this.generation) await this.onComplete?.(saved);
		} catch (error) {
			new Notice(
				this.saved ? this.t("modals.savedFollowUpFailed") : error instanceof Error ? error.message : this.t("errors.unknown"),
			);
		} finally {
			this.isSubmitting = false;
			if (this.active && generation === this.generation) {
				controls.forEach((control, index) => { control.disabled = disabled[index] ?? false; });
				this.saveButton?.setText(this.t("actions.save"));
				if (this.saved) this.close(); else this.validate();
			}
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
