import { App, Modal, Notice } from "obsidian";
import { type TranslationValue } from "../i18n";
import { OKRManager } from "../manager/OKRManager";
import { Objective } from "../types";

interface EditObjectiveModalOptions {
	onComplete?: () => void;
}

export class EditObjectiveModal extends Modal {
	private titleValue: string;
	private owner = "";
	private due = "";
	private description = "";
	private status: Objective["status"];
	private isSubmitting = false;
	private validate!: () => void;

	constructor(
		app: App,
		private manager: OKRManager,
		private objective: Objective,
		private options: EditObjectiveModalOptions = {},
	) {
		super(app);
		this.titleValue = objective.title;
		this.owner = objective.owner;
		this.due = objective.due;
		this.description = objective.description;
		this.status = objective.status;
	}

	onOpen(): void {
		void super.onOpen();
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("okr-modal");

		contentEl.createEl("h2", {
			cls: "okr-modal-title",
			text: this.t("modals.editObjective.title", {
				id: this.objective.id,
			}),
		});
		contentEl.createEl("div", {
			cls: "okr-modal-subtitle",
			text: this.t("modals.editObjective.period", {
				period: this.manager
					.getParser()
					.formatPeriodLabel(
						this.objective.period,
						this.objective.periodType,
						this.manager.getI18n(),
					),
			}),
		});

		const titleField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(titleField, this.t("modals.fields.title"));
		const titleInput = titleField.createEl("input", {
			cls: "okr-input",
			type: "text",
		});
		titleInput.value = this.titleValue;
		titleInput.addEventListener("input", () => {
			this.titleValue = titleInput.value.trim();
			this.validate();
		});

		const ownerField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(ownerField, this.t("modals.fields.owner"));
		const ownerInput = ownerField.createEl("input", {
			cls: "okr-input",
			type: "text",
		});
		ownerInput.value = this.owner;
		ownerInput.addEventListener("input", () => {
			this.owner = ownerInput.value.trim();
			this.validate();
		});

		const statusField = contentEl.createDiv("okr-field");
		statusField.createEl("label", {
			cls: "okr-label",
			text: this.t("modals.fields.status"),
		});
		const statusSelect = statusField.createEl("select", {
			cls: "okr-select",
		});
		statusSelect.createEl("option", {
			text: this.t("status.active"),
			value: "active",
		});
		statusSelect.createEl("option", {
			text: this.t("status.completed"),
			value: "completed",
		});
		statusSelect.createEl("option", {
			text: this.t("status.on-hold"),
			value: "on-hold",
		});
		statusSelect.createEl("option", {
			text: this.t("status.cancelled"),
			value: "cancelled",
		});
		statusSelect.value = this.status;
		statusSelect.addEventListener("change", () => {
			this.status = statusSelect.value as Objective["status"];
		});

		const dueField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(dueField, this.t("modals.fields.dueDate"));
		const dueInput = dueField.createEl("input", {
			cls: "okr-input",
			type: "date",
		});
		dueInput.value = this.due;
		dueInput.addEventListener("change", () => {
			this.due = dueInput.value;
			this.validate();
		});

		const descField = contentEl.createDiv("okr-field");
		descField.createEl("label", {
			cls: "okr-label",
			text: this.t("modals.fields.description"),
		});
		const descInput = descField.createEl("textarea", {
			cls: "okr-textarea",
		});
		descInput.value = this.description;
		descInput.addEventListener("input", () => {
			this.description = descInput.value.trim();
		});

		const footer = contentEl.createDiv("okr-modal-footer");
		const cancelBtn = footer.createEl("button", {
			cls: "okr-btn-cancel",
			text: this.t("actions.cancel"),
		});
		cancelBtn.addEventListener("click", () => this.close());

		const confirmBtn = footer.createEl("button", {
			cls: "okr-btn-confirm",
			text: this.t("actions.save"),
			attr: { type: "button" },
		});
		confirmBtn.addEventListener("click", () => {
			void this.submit();
		});

		this.validate = () => {
			confirmBtn.disabled =
				this.isSubmitting ||
				this.titleValue.length === 0 ||
				this.owner.length === 0 ||
				this.due.length === 0;
		};
		this.validate();
	}

	onClose(): void {
		super.onClose();
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		this.validate();
		if (this.isSubmitting || !this.titleValue || !this.owner || !this.due) {
			return;
		}

		this.isSubmitting = true;
		this.validate();
		try {
			const updated = await this.manager.updateObjective(
				this.objective.id,
				this.objective.period,
				{
					title: this.titleValue,
					description: this.description,
					owner: this.owner,
					status: this.status,
					due: this.due,
				},
			);
			new Notice(this.t("modals.updateObjective.saved", { title: updated.title }));
			this.options.onComplete?.();
			this.close();
		} catch (error) {
			new Notice(
				error instanceof Error
					? this.t("modals.updateObjective.saveFailedWithReason", {
							message: error.message,
						})
					: this.t("modals.updateObjective.saveFailed"),
			);
		} finally {
			this.isSubmitting = false;
			this.validate();
		}
	}

	private createRequiredLabel(container: HTMLElement, text: string): void {
		const label = container.createEl("label", { cls: "okr-label" });
		label.appendText(text);
		label.createEl("span", { cls: "okr-required", text: "*" });
	}

	private t(
		key: string,
		values?: Record<string, TranslationValue>,
	): string {
		return this.manager.getI18n().t(key, values);
	}
}
