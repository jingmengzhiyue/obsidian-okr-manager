import { App, Modal, Notice } from "obsidian";
import { type TranslationValue } from "../i18n";
import { OKRManager } from "../manager/OKRManager";
import { KeyResult, Objective } from "../types";
import { parseLocalDate } from "../utils/date";
import { ConfirmModal } from "./ConfirmModal";
import { EditKRModal } from "./EditKRModal";

interface EditObjectiveModalOptions {
	onComplete?: () => void | Promise<void>;
}

let nextEditObjectiveId = 0;

export class EditObjectiveModal extends Modal {
	private titleValue: string;
	private owner = "";
	private due = "";
	private description = "";
	private status: Objective["status"];
	private keyResults: KeyResult[];
	private keyResultsContainer: HTMLElement | null = null;
	private isSubmitting = false;
	private saved = false;
	private opened = false;
	private lifecycle = 0;
	private refreshRequest = 0;
	private keyResultControls: HTMLButtonElement[] = [];
	private controls: (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement)[] = [];
	private validate!: () => void;

	constructor(
		app: App,
		private manager: OKRManager,
		private objective: Objective,
		private options: EditObjectiveModalOptions = {},
	) {
		super(app);
		this.objective = { ...objective };
		this.titleValue = objective.title;
		this.owner = objective.owner;
		this.due = objective.due;
		this.description = objective.description;
		this.status = objective.status;
		this.keyResults = [...objective.keyResults];
	}

	onOpen(): void {
		if (this.isSubmitting || this.saved) return;
		void super.onOpen();
		this.opened = true;
		this.lifecycle++;
		this.controls = [];
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("okr-modal");

		contentEl.createEl("h2", {
			cls: "okr-modal-title",
			text: this.t("modals.editObjective.title", {
				id: this.objective.id,
			}),
		});
		contentEl.createDiv({
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
		ownerField.createEl("label", { cls: "okr-label", text: this.t("modals.fields.owner") });
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
		const updateDue = () => { this.due = dueInput.value; this.validate(); };
		dueInput.addEventListener("input", updateDue);
		dueInput.addEventListener("change", updateDue);
		const dueHint = dueField.createDiv({ cls: "okr-input-hint" });

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

		this.renderKeyResultsSection(contentEl);

		const footer = contentEl.createDiv("okr-modal-footer");
		const cancelBtn = footer.createEl("button", {
			cls: "okr-btn-cancel",
			text: this.t("actions.cancel"),
			attr: { type: "button" },
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

		const fields = [[titleField,titleInput],[ownerField,ownerInput],[statusField,statusSelect],[dueField,dueInput],[descField,descInput]] as const;
		for (const [field,control] of fields) {
			const id = `okr-edit-objective-${++nextEditObjectiveId}`;
			control.id = id;
			field.querySelector("label")?.setAttribute("for",id);
		}
		dueHint.id = `${dueInput.id}-error`;
		dueInput.setAttribute("aria-describedby",dueHint.id);
		this.controls.push(titleInput,ownerInput,statusSelect,dueInput,descInput,cancelBtn);
		this.validate = () => {
			this.due = dueInput.value;
			const validDate = parseLocalDate(this.due) !== null;
			dueInput.setAttribute("aria-invalid",String(!validDate));
			dueHint.setText(validDate ? "" : this.t("modals.postpone.invalidDate"));
			for (const control of [...this.controls, ...this.keyResultControls]) control.disabled = this.isSubmitting || this.saved;
			confirmBtn.setText(this.t(this.isSubmitting ? "modals.common.saving" : "actions.save"));
			confirmBtn.disabled =
				this.isSubmitting || this.saved ||
				this.titleValue.length === 0 || !validDate;
		};
		this.validate();
	}

	close(): void { if (!this.isSubmitting) super.close(); }

	onClose(): void {
		this.opened = false;
		this.lifecycle++;
		this.keyResultsContainer = null;
		this.keyResultControls = [];
		this.refreshRequest++;
		super.onClose();
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		if (!this.opened || this.isSubmitting || this.saved) return;
		this.validate();
		if (!this.titleValue || !parseLocalDate(this.due)) {
			return;
		}

		const lifecycle = this.lifecycle;
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
				this.objective,
			);
			new Notice(this.t("modals.updateObjective.saved", { title: updated.title }));
			this.saved = true;
			try { await this.options.onComplete?.(); }
			catch { new Notice(this.t("modals.common.savedFollowupFailed")); }
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
			if (this.opened && lifecycle === this.lifecycle) {
				this.validate();
				if (this.saved) this.close();
			}
		}
	}

	private createRequiredLabel(container: HTMLElement, text: string): void {
		const label = container.createEl("label", { cls: "okr-label" });
		label.appendText(text);
		label.createSpan({ cls: "okr-required", text: "*" });
	}

	private renderKeyResultsSection(container: HTMLElement): void {
		const section = container.createDiv("okr-field");
		section.createEl("label", {
			cls: "okr-label",
			text: this.t("template.keyResultsHeading"),
		});
		section.createDiv({ cls: "okr-input-hint", text: this.t("modals.editObjective.krImmediateSave") });
		this.keyResultsContainer = section.createDiv("okr-edit-obj-kr-list");
		this.renderKeyResults();
	}

	private renderKeyResults(): void {
		if (!this.keyResultsContainer) {
			return;
		}
		this.keyResultsContainer.empty();
		this.keyResultControls = [];
		if (this.keyResults.length === 0) {
			this.keyResultsContainer.createDiv({
				cls: "okr-edit-obj-kr-empty",
				text: this.t("detail.emptyKeyResults"),
			});
			return;
		}
		for (const keyResult of this.keyResults) {
			this.renderKeyResultItem(keyResult);
		}
	}

	private renderKeyResultItem(keyResult: KeyResult): void {
		if (!this.keyResultsContainer) {
			return;
		}
		const item = this.keyResultsContainer.createDiv("okr-edit-obj-kr-item");
		item.createSpan({
			cls: "okr-edit-obj-kr-title",
			text: keyResult.title,
		});

		const actions = item.createDiv("okr-edit-obj-kr-actions");
		const editButton = actions.createEl("button", {
			cls: "okr-edit-obj-kr-btn",
			text: this.t("actions.edit"),
		});
		editButton.setAttribute("type", "button");
		this.keyResultControls.push(editButton);
		editButton.disabled = this.isSubmitting || this.saved;
		editButton.addEventListener("click", () => {
			if (!this.opened || this.isSubmitting || this.saved) return;
			const lifecycle = this.lifecycle;
			new EditKRModal(this.app, this.manager, keyResult, {
				onComplete: async () => {
					if (this.opened && lifecycle === this.lifecycle) await this.refreshKeyResults();
				},
			}).open();
		});

		const deleteButton = actions.createEl("button", {
			cls: "okr-edit-obj-kr-btn okr-edit-obj-kr-btn-danger",
			text: this.t("actions.delete"),
		});
		deleteButton.setAttribute("type", "button");
		this.keyResultControls.push(deleteButton);
		deleteButton.disabled = this.isSubmitting || this.saved;
		deleteButton.addEventListener("click", () => {
			if (!this.opened || this.isSubmitting || this.saved) return;
			const lifecycle = this.lifecycle;
			new ConfirmModal(this.app, {
				title: `${this.t("actions.delete")} ${keyResult.id}`,
				message: this.t("detail.deleteKeyResultConfirm", {
					title: keyResult.title,
				}) + " " + this.t("modals.editObjective.deleteImmediate"),
				confirmText: this.t("actions.delete"),
				errorNotice: this.t("detail.deleteKeyResultFailed", {
					title: keyResult.title,
				}),
				onConfirm: async () => {
					await this.manager.deleteKeyResult(
						keyResult.id,
						keyResult.period,
					);
					new Notice(
						this.t("detail.deleteKeyResultSuccess", {
							title: keyResult.title,
						}),
					);
					if (this.opened && lifecycle === this.lifecycle) await this.refreshKeyResults();
				},
			}).open();
		});
	}

	private async refreshKeyResults(): Promise<void> {
		if (!this.opened) return;
		const lifecycle = this.lifecycle;
		const request = ++this.refreshRequest;
		try {
			const refreshed = await this.manager.getKeyResultSummaries(
				this.objective.id,
				this.objective.period,
			);
			if (!this.opened || lifecycle !== this.lifecycle || request !== this.refreshRequest) return;
			this.keyResults = refreshed;
			this.renderKeyResults();
		} catch (error) {
			if (!this.opened || lifecycle !== this.lifecycle || request !== this.refreshRequest) return;
			new Notice(
				this.t("dashboard.loadFailedWithReason", {
					message:
						error instanceof Error
							? error.message
							: this.t("errors.unknown"),
				}),
			);
		}
	}

	private t(
		key: string,
		values?: Record<string, TranslationValue>,
	): string {
		return this.manager.getI18n().t(key, values);
	}
}
