import { App, Modal, Notice, TFile } from "obsidian";
import { type TranslationValue } from "../i18n";
import { OKRManager } from "../manager/OKRManager";
import { OKRPeriodType } from "../types";
import { getTodayLocalDate, parseLocalDate } from "../utils/date";
import { associateFields, setFieldError } from "../utils/form";
import { KRDraftEditor } from "./KRDraftEditor";

export class NewObjectiveModal extends Modal {
	private period: string = "";
	private periodType: OKRPeriodType = "quarter";
	private title: string = "";
	private owner: string = "";
	private due: string = "";
	private description: string = "";
	private isSubmitting = false;
	private onComplete?: () => void | Promise<void>;
	private dueEdited = false;
	private saved = false;
	private active = false;
	private drafts?: KRDraftEditor;
	private disabledControls = new Map<HTMLInputElement | HTMLButtonElement, boolean>();
	private validate!: () => boolean;

	constructor(
		app: App,
		private manager: OKRManager,
		onComplete?: () => void | Promise<void>,
		private initialPeriod?: string,
	) {
		super(app);
		this.due = this.getDefaultDue();
		this.onComplete = onComplete;
	}

	onOpen(): void {
		if (this.isSubmitting || this.saved) return;
		void super.onOpen();
		const { contentEl } = this;
		this.active = true;
		this.saved = false;
		this.title = this.owner = this.description = "";
		this.dueEdited = false;
		contentEl.empty();
		this.modalEl.addClass("okr-modal");
		const parser = this.manager.getParser();
		this.periodType = this.initialPeriod ? parser.inferPeriodType(this.initialPeriod) : this.manager.getSettings().defaultPeriodType;
		this.period = this.initialPeriod ?? parser.getCurrentPeriod(this.periodType);
		this.due = parser.getDueForPeriod(this.period, this.periodType) ?? "";

		contentEl.createEl("h2", {
			cls: "okr-modal-title",
			text: this.t("modals.newObjective.title"),
		});

		const periodTypeField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(
			periodTypeField,
			this.t("modals.fields.periodType"),
		);
		const periodTypeSelect = periodTypeField.createEl("select", {
			cls: "okr-select",
		});
		periodTypeSelect.createEl("option", {
			text: this.t("modals.select.week"),
			value: "week",
		});
		periodTypeSelect.createEl("option", {
			text: this.t("modals.select.month"),
			value: "month",
		});
		periodTypeSelect.createEl("option", {
			text: this.t("modals.select.quarter"),
			value: "quarter",
		});
		periodTypeSelect.createEl("option", {
			text: this.t("modals.select.year"),
			value: "year",
		});
		periodTypeSelect.value = this.periodType;

		const periodField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(periodField, this.t("modals.fields.period"));
		const periodInput = periodField.createEl("input", {
			cls: "okr-input",
			type: "text",
			attr: { placeholder: this.t("modals.fields.period") },
		});
		periodInput.value = this.period;
		const periodHint = periodField.createDiv({
			cls: "okr-input-hint",
			text: this.getPeriodHint(this.periodType),
		});
		const periodError = periodField.createDiv({
			cls: "okr-input-error",
			text: this.t("modals.newObjective.periodFormatError"),
		});
		periodTypeSelect.addEventListener("change", () => {
			this.periodType = periodTypeSelect.value as OKRPeriodType;
			this.period = parser.getCurrentPeriod(this.periodType);
			if (!this.dueEdited) this.due = parser.getDefaultDue(this.periodType);
			periodInput.value = this.period;
			dueInput.value = this.due;
			periodHint.setText(this.getPeriodHint(this.periodType));
			periodError.removeClass("visible");
			periodInput.removeClass("okr-invalid");
			this.validate();
		});
		periodInput.addEventListener("input", () => {
			this.period = periodInput.value.trim();
			const valid = parser.isValidPeriod(this.period, this.periodType);
			if (valid && !this.dueEdited) {
				this.due =
					parser.getDueForPeriod(this.period, this.periodType) ?? this.due;
				dueInput.value = this.due;
			}
			periodInput.toggleClass(
				"okr-invalid",
				this.period.length > 0 && !valid,
			);
			periodError.toggleClass(
				"visible",
				this.period.length > 0 && !valid,
			);
			this.validate();
		});

		const titleField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(titleField, this.t("modals.fields.title"));
		const titleInput = titleField.createEl("input", {
			cls: "okr-input",
			type: "text",
			placeholder: this.t("modals.newObjective.placeholder"),
		});
		titleInput.addEventListener("input", () => {
			this.title = titleInput.value.trim();
			this.validate();
		});

		const ownerField = contentEl.createDiv("okr-field");
		ownerField.createEl("label", { cls: "okr-label", text: this.t("modals.fields.owner") });
		const ownerInput = ownerField.createEl("input", {
			cls: "okr-input",
			type: "text",
		});
		ownerInput.addEventListener("input", () => {
			this.owner = ownerInput.value.trim();
			this.validate();
		});

		const dueField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(dueField, this.t("modals.fields.dueDate"));
		const dueInput = dueField.createEl("input", {
			cls: "okr-input",
			type: "date",
		});
		dueInput.value = this.due;
		const updateDue = (): void => {
			this.dueEdited = true;
			this.due = dueInput.value;
			this.validate();
		};
		dueInput.addEventListener("input", updateDue);
		dueInput.addEventListener("change", updateDue);
		const dueError = dueField.createDiv({ cls: "okr-input-error", text: this.t("modals.input.dateError") });
		const resetDue = dueField.createEl("button", { cls: "okr-btn-secondary", text: this.t("modals.newObjective.resetDue"), attr: { type: "button" } });
		resetDue.addEventListener("click", () => {
			this.dueEdited = false;
			this.due = parser.getDueForPeriod(this.period, this.periodType) ?? "";
			dueInput.value = this.due;
			this.validate();
		});

		const descField = contentEl.createDiv("okr-field");
		descField.createEl("label", {
			cls: "okr-label",
			text: this.t("modals.fields.description"),
		});
		const descInput = descField.createEl("textarea", {
			cls: "okr-textarea",
			placeholder: this.t("modals.objective.descriptionPlaceholder"),
		});
		descInput.addEventListener("input", () => {
			this.description = descInput.value.trim();
		});

		this.drafts = new KRDraftEditor(contentEl.createDiv("okr-drafts"), this.manager.getI18n(), () => ({ owner: this.owner, due: this.due }), () => this.validate());
		const footer = contentEl.createDiv("okr-modal-footer");
		const cancelBtn = footer.createEl("button", {
			cls: "okr-btn-cancel",
			text: this.t("actions.cancel"),
		});
		cancelBtn.addEventListener("click", () => this.close());

		const confirmBtn = footer.createEl("button", {
			cls: "okr-btn-confirm",
			text: this.t("actions.create"),
			attr: { disabled: "true", type: "button" },
		});
		confirmBtn.addEventListener("click", () => {
			void this.submit();
		});

		this.validate = () => {
			if (!this.active) return false;
			this.due = dueInput.value;
			this.drafts?.inherit();
			setFieldError(dueInput, dueError, !!parseLocalDate(this.due));
			const valid =
				parser.isValidPeriod(this.period, this.periodType) &&
				this.period.length > 0 &&
				this.title.length > 0 &&
				!!parseLocalDate(this.due) &&
				(this.drafts?.isValid() ?? true) && !this.saved &&
				!this.isSubmitting;
			confirmBtn.disabled = !valid;
			return valid;
		};
		this.validate();
		associateFields(contentEl);
		titleInput.focus();
	}

	private async submit(): Promise<void> {
		if (this.isSubmitting || !this.validate()) {
			return;
		}

		this.isSubmitting = true;
		this.setBusy(true);
		this.validate();
		try {
			const today = getTodayLocalDate();
			const obj = await this.manager.createObjective({
				period: this.period,
				periodType: this.periodType,
				title: this.title,
				description: this.description,
				owner: this.owner,
				status: "active",
				created: today,
				due: this.due,
			}, this.drafts?.snapshot());
			this.saved = true;

			new Notice(
				this.t("modals.newObjective.created", { title: obj.title }),
			);
			let followUpFailed = false;
			if (this.active) {
				try {
					const file = this.app.vault.getAbstractFileByPath(obj.filePath);
					if (file instanceof TFile) await this.app.workspace.openLinkText(file.path, "", false);
				} catch {
					followUpFailed = true;
				}
			}
			if (this.active) {
				try { await this.onComplete?.(); }
				catch { followUpFailed = true; }
			}
			if (followUpFailed) {
				new Notice(this.t("modals.savedFollowUpFailed"));
			}
		} catch (error) {
			new Notice(
				error instanceof Error
					? this.t("modals.newObjective.createFailedWithReason", {
							message: error.message,
						})
					: this.t("modals.newObjective.createFailed"),
			);
		} finally {
			this.isSubmitting = false;
			if (this.active) {
				this.setBusy(false);
				if (this.saved) this.close(); else this.validate();
			}
		}
	}

	private setBusy(busy: boolean): void {
		if (busy) {
			this.contentEl.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, select, textarea, button").forEach((control) => {
				this.disabledControls.set(control, control.disabled);
				control.disabled = true;
			});
		} else {
			this.disabledControls.forEach((disabled, control) => { control.disabled = disabled; });
			this.disabledControls.clear();
		}
		this.contentEl.querySelector<HTMLButtonElement>(".okr-btn-confirm")?.setText(this.t(busy ? "actions.saving" : "actions.create"));
	}

	close(): void { if (!this.isSubmitting) super.close(); }

	onClose(): void {
		this.active = false;
		super.onClose();
		const { contentEl } = this;
		contentEl.empty();
	}

	private createRequiredLabel(container: HTMLElement, text: string): void {
		const label = container.createEl("label", { cls: "okr-label" });
		label.appendText(text);
		label.createSpan({ cls: "okr-required", text: "*" });
	}

	private getDefaultDue(): string {
		return this.manager.getParser().getDefaultDue(this.periodType);
	}

	private getPeriodHint(periodType: OKRPeriodType): string {
		switch (periodType) {
			case "week":
				return this.t("modals.periodHint.week");
			case "month":
				return this.t("modals.periodHint.month");
			case "quarter":
				return this.t("modals.periodHint.quarter");
			case "year":
			default:
				return this.t("modals.periodHint.year");
		}
	}

	private t(
		key: string,
		values?: Record<string, TranslationValue>,
	): string {
		return this.manager.getI18n().t(key, values);
	}
}
