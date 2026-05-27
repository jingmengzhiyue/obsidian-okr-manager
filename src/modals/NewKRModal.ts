import { App, Modal, Notice, TFile } from "obsidian";
import { type TranslationValue } from "../i18n";
import { OKRManager } from "../manager/OKRManager";
import { Confidence } from "../types";
import { getTodayLocalDate } from "../utils/date";

interface NewKRModalOptions {
	initialPeriod?: string;
	initialObjectiveId?: string;
	onComplete?: () => void;
}

export class NewKRModal extends Modal {
	private period: string = "";
	private objectiveId: string = "";
	private title: string = "";
	private owner: string = "";
	private unit: "score" | "percentage" | "number" | "boolean" = "score";
	private current = 0;
	private target: number = 0;
	private confidence: Confidence = "medium";
	private due: string = "";
	private description: string = "";
	private objectives: { id: string; title: string }[] = [];
	private isSubmitting = false;
	private validate!: () => void;

	constructor(
		app: App,
		private manager: OKRManager,
		private options: NewKRModalOptions = {},
	) {
		super(app);
	}

	async onOpen(): Promise<void> {
		await super.onOpen();
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("okr-modal");

		const today = getTodayLocalDate();
		this.period =
			this.options.initialPeriod ||
			this.manager
				.getParser()
				.getCurrentPeriod(this.manager.getSettings().defaultPeriodType);
		this.due = today;

		await this.loadObjectives();
		if (
			this.options.initialObjectiveId &&
			this.objectives.some(
				(objective) => objective.id === this.options.initialObjectiveId,
			)
		) {
			this.objectiveId = this.options.initialObjectiveId;
		} else if (this.objectives.length > 0) {
			this.objectiveId = this.objectives[0]?.id ?? "";
		}

		contentEl.createEl("h2", {
			cls: "okr-modal-title",
			text: this.t("modals.newKeyResult.title"),
		});

		const periodField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(periodField, this.t("modals.fields.period"));
		const periodSelect = periodField.createEl("select", {
			cls: "okr-select",
		});
		const allPeriods = await this.manager.getAllPeriods();
		if (!allPeriods.includes(this.period)) {
			periodSelect.createEl("option", {
				text: this.period,
				value: this.period,
			});
		}
		for (const p of allPeriods) {
			periodSelect.createEl("option", {
				text: this.manager
					.getParser()
					.formatPeriodLabel(p, undefined, this.manager.getI18n()),
				value: p,
			});
		}
		periodSelect.value = this.period;
		periodSelect.addEventListener("change", () => {
			void this.handlePeriodChange(periodSelect.value, objSelect);
		});

		const objField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(objField, this.t("modals.newKeyResult.ownedByObjective"));
		const objSelect = objField.createEl("select", { cls: "okr-select" });
		this.renderObjectiveOptions(objSelect);
		objSelect.value = this.objectiveId;
		objSelect.addEventListener("change", () => {
			this.objectiveId = objSelect.value;
			this.validate();
		});

		const titleField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(titleField, this.t("modals.fields.title"));
		const titleInput = titleField.createEl("input", {
			cls: "okr-input",
			type: "text",
			placeholder: this.t("modals.newKeyResult.placeholder"),
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

		const unitField = contentEl.createDiv("okr-field");
		unitField.createEl("label", {
			cls: "okr-label",
			text: this.t("modals.fields.unit"),
		});
		const unitSelect = unitField.createEl("select", { cls: "okr-select" });
		unitSelect.createEl("option", {
			text: `${this.t("modals.select.score")} (score)`,
			value: "score",
		});
		unitSelect.createEl("option", {
			text: `${this.t("modals.select.percentage")} (percentage)`,
			value: "percentage",
		});
		unitSelect.createEl("option", {
			text: `${this.t("modals.select.number")} (number)`,
			value: "number",
		});
		unitSelect.createEl("option", {
			text: `${this.t("modals.select.boolean")} (boolean)`,
			value: "boolean",
		});
		unitSelect.value = this.unit;
		unitSelect.addEventListener("change", () => {
			this.unit = unitSelect.value as typeof this.unit;
		});

		const currentField = contentEl.createDiv("okr-field");
		currentField.createEl("label", {
			cls: "okr-label",
			text: this.t("modals.fields.currentValue"),
		});
		const currentInput = currentField.createEl("input", {
			cls: "okr-input",
			type: "number",
			placeholder: "0",
		});
		currentInput.setAttribute("min", "0");
		currentInput.setAttribute("step", "any");
		const currentError = currentField.createEl("div", {
			cls: "okr-input-error",
			text: this.t("modals.input.currentError"),
		});
		currentInput.addEventListener("input", () => {
			const value = Number(currentInput.value);
			const valid = Number.isFinite(value) && value >= 0;
			this.current = valid ? value : 0;
			currentInput.toggleClass(
				"okr-invalid",
				currentInput.value.length > 0 && !valid,
			);
			currentError.toggleClass(
				"visible",
				currentInput.value.length > 0 && !valid,
			);
			this.validate();
		});

		const targetField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(
			targetField,
			this.t("modals.fields.targetValue"),
		);
		const targetInput = targetField.createEl("input", {
			cls: "okr-input",
			type: "number",
			placeholder: "0",
		});
		targetInput.setAttribute("min", "0");
		targetInput.setAttribute("step", "any");
		const targetError = targetField.createEl("div", {
			cls: "okr-input-error",
			text: this.t("modals.input.targetError"),
		});
		targetInput.addEventListener("input", () => {
			const value = Number(targetInput.value);
			const valid = Number.isFinite(value) && value >= 0;
			this.target = valid ? value : 0;
			targetInput.toggleClass(
				"okr-invalid",
				targetInput.value.length > 0 && !valid,
			);
			targetError.toggleClass(
				"visible",
				targetInput.value.length > 0 && !valid,
			);
			this.validate();
		});

		const confField = contentEl.createDiv("okr-field");
		confField.createEl("label", {
			cls: "okr-label",
			text: this.t("modals.fields.confidence"),
		});
		const confSelect = confField.createEl("select", { cls: "okr-select" });
		confSelect.createEl("option", {
			text: this.t("modals.select.low"),
			value: "low",
		});
		confSelect.createEl("option", {
			text: this.t("modals.select.medium"),
			value: "medium",
		});
		confSelect.createEl("option", {
			text: this.t("modals.select.high"),
			value: "high",
		});
		confSelect.value = this.confidence;
		confSelect.addEventListener("change", () => {
			this.confidence = confSelect.value as Confidence;
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
			placeholder: this.t("modals.fields.description"),
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
				!this.isSubmitting &&
				this.period.length > 0 &&
				this.objectiveId.length > 0 &&
				this.title.length > 0 &&
				this.owner.length > 0 &&
				this.due.length > 0 &&
				targetInput.value.length > 0 &&
				!targetInput.hasClass("okr-invalid") &&
				!currentInput.hasClass("okr-invalid");
			confirmBtn.disabled = !valid;
		};
		this.validate();

		this.modalEl.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				this.close();
				return;
			}

			if (e.key === "Enter" && document.activeElement !== descInput) {
				e.preventDefault();
				void this.submit();
			}
		});
	}

	private async submit(): Promise<void> {
		this.validate();
		if (this.isSubmitting || !this.objectiveId || !this.title) {
			return;
		}

		this.isSubmitting = true;
		this.validate();
		try {
			const today = getTodayLocalDate();
			const kr = await this.manager.createKeyResult({
				objectiveId: this.objectiveId,
				period: this.period,
				title: this.title,
				description: this.description,
				owner: this.owner,
				unit: this.unit,
				current: this.current,
				target: this.target,
				status: "active",
				confidence: this.confidence,
				created: today,
				due: this.due,
			});

			const file = this.app.vault.getAbstractFileByPath(kr.filePath);
			if (file instanceof TFile) {
				await this.app.workspace.openLinkText(file.path, "", false);
			}

			new Notice(
				this.t("modals.newKeyResult.created", { title: kr.title }),
			);
			this.options.onComplete?.();
			this.close();
		} catch (error) {
			new Notice(
				error instanceof Error
					? this.t("modals.newKeyResult.createFailedWithReason", {
							message: error.message,
						})
					: this.t("modals.newKeyResult.createFailed"),
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

	private async loadObjectives(): Promise<void> {
		const objectives = await this.manager.getObjectives(this.period);
		this.objectives = objectives.map((objective) => ({
			id: objective.id,
			title: `${objective.id} ${objective.title}`,
		}));
	}

	private async handlePeriodChange(
		period: string,
		select: HTMLSelectElement,
	): Promise<void> {
		this.period = period;
		await this.loadObjectives();
		this.objectiveId = this.objectives[0]?.id ?? "";
		this.renderObjectiveOptions(select);
		this.validate();
	}

	private renderObjectiveOptions(select: HTMLSelectElement): void {
		select.empty();
		if (this.objectives.length === 0) {
			select.createEl("option", {
				text: this.t("modals.newKeyResult.noObjectives"),
				value: "",
			});
			select.disabled = true;
			return;
		}

		select.disabled = false;
		for (const objective of this.objectives) {
			select.createEl("option", {
				text: objective.title,
				value: objective.id,
			});
		}
		select.value = this.objectiveId;
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
