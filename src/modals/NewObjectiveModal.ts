import { App, Modal, Notice, TFile } from "obsidian";
import { type TranslationValue } from "../i18n";
import { OKRManager } from "../manager/OKRManager";
import { OKRPeriodType } from "../types";
import { getTodayLocalDate } from "../utils/date";
import { getElementDocument, isActiveElement } from "../utils/document";

export class NewObjectiveModal extends Modal {
	private period: string = "";
	private periodType: OKRPeriodType = "quarter";
	private title: string = "";
	private owner: string = "";
	private due: string = "";
	private description: string = "";
	private isSubmitting = false;
	private onComplete?: () => void;
	private validate!: () => void;

	constructor(
		app: App,
		private manager: OKRManager,
		onComplete?: () => void,
	) {
		super(app);
		this.due = this.getDefaultDue();
		this.onComplete = onComplete;
	}

	onOpen(): void {
		void super.onOpen();
		const { contentEl } = this;
		const modalDoc = getElementDocument(this.modalEl);
		contentEl.empty();
		this.modalEl.addClass("okr-modal");
		const parser = this.manager.getParser();
		this.periodType = this.manager.getSettings().defaultPeriodType;
		this.period = parser.getCurrentPeriod(this.periodType);
		this.due = parser.getDefaultDue(this.periodType);

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
		const periodHint = periodField.createEl("div", {
			cls: "okr-input-hint",
			text: this.getPeriodHint(this.periodType),
		});
		const periodError = periodField.createEl("div", {
			cls: "okr-input-error",
			text: this.t("modals.newObjective.periodFormatError"),
		});
		periodTypeSelect.addEventListener("change", () => {
			this.periodType = periodTypeSelect.value as OKRPeriodType;
			this.period = parser.getCurrentPeriod(this.periodType);
			this.due = parser.getDefaultDue(this.periodType);
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
		this.createRequiredLabel(ownerField, this.t("modals.fields.owner"));
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
			placeholder: this.t("modals.objective.descriptionPlaceholder"),
		});
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
			text: this.t("actions.create"),
			attr: { disabled: "true", type: "button" },
		});
		confirmBtn.addEventListener("click", () => {
			void this.submit();
		});

		this.validate = () => {
			const valid =
				parser.isValidPeriod(this.period, this.periodType) &&
				this.period.length > 0 &&
				this.title.length > 0 &&
				this.owner.length > 0 &&
				this.due.length > 0 &&
				!this.isSubmitting;
			confirmBtn.disabled = !valid;
		};
		this.validate();

		this.modalEl.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				this.close();
				return;
			}

			if (e.key === "Enter" && !isActiveElement(descInput, modalDoc)) {
				e.preventDefault();
				void this.submit();
			}
		});
	}

	private async submit(): Promise<void> {
		this.validate();
		if (
			this.isSubmitting ||
			!this.period ||
			!this.title ||
			!this.owner ||
			!this.due
		) {
			return;
		}

		this.isSubmitting = true;
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
			});

			const file = this.app.vault.getAbstractFileByPath(obj.filePath);
			if (file instanceof TFile) {
				await this.app.workspace.openLinkText(file.path, "", false);
			}

			new Notice(
				this.t("modals.newObjective.created", { title: obj.title }),
			);
			this.onComplete?.();
			this.close();
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
			this.validate();
		}
	}

	onClose(): void {
		super.onClose();
		const { contentEl } = this;
		contentEl.empty();
	}

	private createRequiredLabel(container: HTMLElement, text: string): void {
		const label = container.createEl("label", { cls: "okr-label" });
		label.appendText(text);
		label.createEl("span", { cls: "okr-required", text: "*" });
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
