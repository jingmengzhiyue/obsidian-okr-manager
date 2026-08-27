import { App, Modal, Notice } from "obsidian";
import { type TranslationValue } from "../i18n";
import { OKRManager } from "../manager/OKRManager";
import { Objective } from "../types";
import { isValidPostponeDate } from "../utils/validation";

interface PostponeObjectiveModalOptions {
	onComplete?: () => void;
}

export class PostponeObjectiveModal extends Modal {
	private due: string;
	private isSubmitting = false;
	private validate!: () => boolean;

	constructor(
		app: App,
		private manager: OKRManager,
		private objective: Objective,
		private options: PostponeObjectiveModalOptions = {},
	) {
		super(app);
		this.due = objective.due;
	}

	onOpen(): void {
		void super.onOpen();
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("okr-modal");

		contentEl.createEl("h2", {
			cls: "okr-modal-title",
			text: this.t("modals.postpone.title", {
				id: this.objective.id,
			}),
		});
		contentEl.createEl("div", {
			cls: "okr-modal-subtitle",
			text: this.objective.due
				? this.t("modals.postpone.currentDueDate", {
						due: this.objective.due,
					})
				: this.t("modals.postpone.currentDueDateUnset"),
		});

		const titleField = contentEl.createDiv("okr-field");
		titleField.createEl("label", {
			cls: "okr-label",
			text: this.t("modals.fields.objective"),
		});
		const titleInput = titleField.createEl("input", {
			cls: "okr-input",
			type: "text",
		});
		titleInput.value = this.objective.title;
		titleInput.disabled = true;

		const dueField = contentEl.createDiv("okr-field");
		dueField.createEl("label", {
			cls: "okr-label",
			text: this.t("modals.fields.newDueDate"),
		});
		const dueInput = dueField.createEl("input", {
			cls: "okr-input",
			type: "date",
		});
		dueInput.value = this.due;
		dueInput.addEventListener("change", () => {
			this.due = dueInput.value;
			this.validate();
		});

		const hint = dueField.createEl("div", {
			cls: "okr-input-hint",
			text: this.t("modals.postpone.hint"),
		});
		hint.setAttribute("role", "note");

		const footer = contentEl.createDiv("okr-modal-footer");
		const cancelBtn = footer.createEl("button", {
			cls: "okr-btn-cancel",
			text: this.t("actions.cancel"),
		});
		cancelBtn.addEventListener("click", () => this.close());

		const confirmBtn = footer.createEl("button", {
			cls: "okr-btn-confirm",
			text: this.t("actions.savePostpone"),
			attr: { type: "button" },
		});
		confirmBtn.addEventListener("click", () => {
			void this.submit();
		});

		this.validate = () => {
			const valid =
				!this.isSubmitting &&
				isValidPostponeDate(this.objective.due, this.due);
			confirmBtn.disabled = !valid;
			return valid;
		};
		this.validate();
		dueInput.focus();
	}

	onClose(): void {
		super.onClose();
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		if (this.isSubmitting || !this.validate()) {
			return;
		}

		this.isSubmitting = true;
		this.validate();
		try {
			const updated = await this.manager.updateObjective(
				this.objective.id,
				this.objective.period,
				{
					title: this.objective.title,
					description: this.objective.description,
					owner: this.objective.owner,
					status: this.objective.status,
					due: this.due,
				},
			);
			new Notice(this.t("modals.postpone.saved", { due: updated.due }));
			this.options.onComplete?.();
			this.close();
		} catch (error) {
			new Notice(
				error instanceof Error
					? this.t("modals.postpone.saveFailedWithReason", {
							message: error.message,
						})
					: this.t("modals.postpone.saveFailed"),
			);
		} finally {
			this.isSubmitting = false;
			this.validate();
		}
	}

	private t(key: string, values?: Record<string, TranslationValue>): string {
		return this.manager.getI18n().t(key, values);
	}
}
