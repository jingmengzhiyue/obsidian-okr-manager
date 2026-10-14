import { App, Modal, Notice, TFile } from "obsidian";
import { type TranslationValue } from "../i18n";
import { OKRManager } from "../manager/OKRManager";
import { Confidence, Objective, KeyResult } from "../types";
import { getTodayLocalDate, parseLocalDate } from "../utils/date";
import { parseKRNumbers } from "../utils/krForm";
import { associateFields, setFieldError } from "../utils/form";

interface NewKRModalOptions {
	initialPeriod?: string;
	initialObjectiveId?: string;
	onComplete?: () => void | Promise<void>;
}

export class NewKRModal extends Modal {
	private period: string = "";
	private objectiveId: string = "";
	private title: string = "";
	private owner: string = "";
	private unit: "score" | "percentage" | "number" | "boolean" = "score";
	private weight = 1;
	private current = 0;
	private target: number = 0;
	private confidence: Confidence = "medium";
	private due: string = "";
	private description: string = "";
	private objectives: Objective[] = [];
	private loading = false;
	private loadedPeriod = "";
	private request = 0;
	private ownerEdited = false;
	private dueEdited = false;
	private inheritFields: (() => void) | undefined;
	private loadMessage: HTMLElement | undefined;
	private periodSelect: HTMLSelectElement | undefined;
	private isSubmitting = false;
	private saved = false;
	private active = false;
	private generation = 0;
	private restoreControls: (() => void) | undefined;
	private validate!: () => boolean;

	constructor(
		app: App,
		private manager: OKRManager,
		private options: NewKRModalOptions = {},
	) {
		super(app);
	}

	async onOpen(): Promise<void> {
		if (this.isSubmitting || this.saved) {
			return;
		}
		this.active = true;
		const opening = ++this.generation;
		await super.onOpen();
		if (!this.active || opening !== this.generation) {
			return;
		}
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("okr-modal");
		this.saved = false;
		this.objectiveId = "";
		this.objectives = [];
		this.loadedPeriod = "";
		this.title = "";
		this.owner = "";
		this.description = "";
		this.unit = "score";
		this.weight = 1;
		this.current = 0;
		this.target = 0;
		this.confidence = "medium";
		this.loading = false;

		const lifecycle = this.generation;
		this.ownerEdited = false;
		this.dueEdited = false;
		const today = getTodayLocalDate();
		this.period =
			this.options.initialPeriod ||
			this.manager
				.getParser()
				.getCurrentPeriod(this.manager.getSettings().defaultPeriodType);
		this.due = today;

		let allPeriods: string[] = [];
		contentEl.createDiv({ text: this.t("modals.loading") });
		try {
			allPeriods = await this.manager.getWritablePeriods();
			if (!this.active || this.generation !== lifecycle) {
				return;
			}
			if (!allPeriods.includes(this.period) && !this.options.initialPeriod && !this.options.initialObjectiveId) {
				this.period = allPeriods[allPeriods.length - 1] ?? "";
			}
			if (this.period && allPeriods.includes(this.period)) {
				const objectives = await this.manager.getObjectiveSummaries(this.period);
				if (!this.active || this.generation !== lifecycle) {
					return;
				}
				this.objectives = objectives;
				this.loadedPeriod = this.period;
			}
		} catch (error) {
			if (!this.active || this.generation !== lifecycle) {
				return;
			}
			this.objectives = [];
			this.showLoadError(error);
		}
		if (!this.active || this.generation !== lifecycle) {
			return;
		}
		contentEl.empty();
		if (
			this.options.initialObjectiveId &&
			this.objectives.some(
				(objective) => objective.id === this.options.initialObjectiveId,
			)
		) {
			this.objectiveId = this.options.initialObjectiveId;
		} else if (!this.options.initialObjectiveId && this.objectives.length > 0) {
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
		this.periodSelect = periodSelect;
		if (allPeriods.length === 0) {
			periodSelect.createEl("option", {
				text: this.t("dashboard.noPeriods"),
				value: "",
			});
			periodSelect.disabled = true;
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
			this.inheritFields?.();
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
		ownerField.createEl("label", {
			cls: "okr-label",
			text: this.t("modals.fields.owner"),
		});
		const ownerInput = ownerField.createEl("input", {
			cls: "okr-input",
			type: "text",
		});
		ownerInput.addEventListener("input", () => {
			this.ownerEdited = true;
			this.owner = ownerInput.value.trim();
			this.validate();
		});

		let targetEdited = false;
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
			this.unit = unitSelect.value as KeyResult["unit"];
			if (this.unit === "boolean" && !targetEdited) {
				targetInput.value = "1";
			}
			this.validate();
		});

		const weightField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(weightField, this.t("modals.fields.weight"));
		const weightInput = weightField.createEl("input", {
			cls: "okr-input",
			type: "number",
		});
		weightInput.value = String(this.weight);
		weightInput.setAttribute("min", "0");
		weightInput.setAttribute("step", "any");
		const weightError = weightField.createDiv({
			cls: "okr-input-error",
			text: this.t("modals.input.weightError"),
		});
		weightInput.addEventListener("input", () => {
			this.validate();
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
		const currentError = currentField.createDiv({
			cls: "okr-input-error",
			text: this.t("modals.input.currentError"),
		});
		currentInput.addEventListener("input", () => {
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
		const targetError = targetField.createDiv({
			cls: "okr-input-error",
			text: this.t("modals.input.targetError"),
		});
		targetInput.addEventListener("input", () => {
			targetEdited = true;
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
		dueInput.addEventListener("input", () => {
			this.dueEdited = true;
			this.due = dueInput.value;
			this.validate();
		});
		dueInput.addEventListener("change", () => {
			this.dueEdited = true;
			this.due = dueInput.value;
			this.validate();
		});

		const inheritanceHint = dueField.createDiv({ cls: "okr-input-hint" });
		this.inheritFields = () => {
			const parent = this.objectives.find(objective => objective.id === this.objectiveId);
			if (!parent) {
				return;
			}
			if (!this.ownerEdited) {
				this.owner = parent.owner ?? "";
				ownerInput.value = this.owner;
			}
			if (!this.dueEdited) {
				this.due = parseLocalDate(parent.due ?? "")
					? parent.due
					: this.manager.getParser().getDueForPeriod(
						this.period,
						this.manager.getParser().inferPeriodType(this.period),
					) ?? "";
				dueInput.value = this.due;
			}
			inheritanceHint.setText(
				!parseLocalDate(parent.due ?? "")
					? this.t("modals.newKeyResult.fallbackDue")
					: this.due < getTodayLocalDate()
						? this.t("modals.newKeyResult.pastDue")
						: "",
			);
		};
		this.inheritFields();
		this.loadMessage = objField.createDiv({ cls: "okr-input-hint" });
		if (!this.objectiveId) {
			this.loadMessage.setText(this.t("modals.newKeyResult.invalidContext"));
		}
		const retry = objField.createEl("button", {
			text: this.t("actions.retry"),
			attr: { type: "button" },
		});
		retry.addEventListener("click", () => {
			void this.handlePeriodChange(this.period, objSelect, this.options.initialObjectiveId);
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

		const dueError = dueField.createDiv({
			cls: "okr-input-error",
			text: this.t("modals.input.dateError"),
		});
		this.validate = () => {
			if (!this.active) {
				return false;
			}
			currentInput.setAttribute("step", this.unit === "boolean" ? "1" : "any");
			targetInput.setAttribute("step", this.unit === "boolean" ? "1" : "any");
			if (this.unit === "boolean") {
				currentInput.setAttribute("max", "1");
				targetInput.setAttribute("min", "1");
				targetInput.setAttribute("max", "1");
			} else {
				currentInput.removeAttribute("max");
				targetInput.setAttribute("min", "0");
				targetInput.removeAttribute("max");
			}
			const numbers = parseKRNumbers(
				this.unit,
				currentInput.value,
				targetInput.value,
				weightInput.value,
			);
			if (currentInput.validity?.badInput) {
				numbers.currentValid = false;
				numbers.valid = false;
			}
			this.current = numbers.current;
			this.target = numbers.target;
			this.weight = numbers.weight;
			this.due = dueInput.value;
			currentError.setText(this.t(this.unit === "boolean" ? "modals.input.booleanCurrentError" : "modals.input.currentError"));
			targetError.setText(this.t(this.unit === "boolean" ? "modals.input.booleanTargetError" : "modals.input.targetError"));
			setFieldError(currentInput, currentError, numbers.currentValid);
			setFieldError(targetInput, targetError, numbers.targetValid);
			setFieldError(weightInput, weightError, numbers.weightValid);
			setFieldError(dueInput, dueError, !!parseLocalDate(this.due));
			const valid = this.active &&
				!this.saved &&
				!this.isSubmitting &&
				this.period.length > 0 &&
				this.objectiveId.length > 0 &&
				!this.loading &&
				this.loadedPeriod === this.period &&
				this.objectives.some(o => o.id === this.objectiveId) &&
				this.title.length > 0 &&
				!!parseLocalDate(this.due) &&
				numbers.valid;
			confirmBtn.disabled = !valid;
			return valid;
		};
		associateFields(contentEl);
		this.validate();

	}

	private async submit(): Promise<void> {
		if (!this.active || this.saved || this.isSubmitting || !this.validate()) {
			return;
		}

		this.isSubmitting = true;
		this.setBusy(true);
		try {
			const today = getTodayLocalDate();
			const kr = await this.manager.createKeyResult({
				objectiveId: this.objectiveId,
				period: this.period,
				title: this.title,
				description: this.description,
				owner: this.owner,
				unit: this.unit,
				weight: this.weight,
				current: this.current,
				target: this.target,
				status: "active",
				confidence: this.confidence,
				created: today,
				due: this.due,
			});

			this.saved = true;
			new Notice(this.t("modals.newKeyResult.created", { title: kr.title }));
			let followUpFailed = false;
			if (this.active) {
				try {
					const file = this.app.vault.getAbstractFileByPath(kr.filePath);
					if (file instanceof TFile) {
						await this.app.workspace.openLinkText(file.path, "", false);
					}
				} catch {
					followUpFailed = true;
				}
			}
			if (this.active) {
				try {
					await this.options.onComplete?.();
				} catch {
					followUpFailed = true;
				}
			}
			if (followUpFailed) {
				new Notice(this.t("modals.savedFollowUpFailed"));
			}
		} catch (error) {
			new Notice(
				this.saved ? this.t("modals.savedFollowUpFailed") : error instanceof Error
					? this.t("modals.newKeyResult.createFailedWithReason", {
							message: error.message,
						})
					: this.t("modals.newKeyResult.createFailed"),
			);
		} finally {
			this.isSubmitting = false;
			if (this.active) {
				this.setBusy(false);
				if (this.saved) {
					this.close();
				} else {
					this.validate();
				}
			}
		}
	}

	onClose(): void {
		this.active = false;
		this.generation++;
		super.onClose();
		const { contentEl } = this;
		contentEl.empty();
	}

	private async handlePeriodChange(
		period: string,
		select: HTMLSelectElement,
		requestedId?: string,
	): Promise<void> {
		const request = ++this.request;
		const lifecycle = this.generation;
		this.period = period;
		this.loadedPeriod = "";
		this.loading = true;
		this.objectiveId = "";
		this.objectives = [];
		this.renderObjectiveOptions(select);
		this.validate();
		this.loadMessage?.setText(this.t("modals.loading"));
		const current = () => this.active && lifecycle === this.generation && request === this.request;
		try {
			const writable = await this.manager.getWritablePeriods();
			if (!current()) {
				return;
			}
			if (this.periodSelect) {
				this.periodSelect.empty();
				for (const value of writable) {
					this.periodSelect.createEl("option", {
						value,
						text: this.manager.getParser().formatPeriodLabel(value, undefined, this.manager.getI18n()),
					});
				}
				this.periodSelect.value = period;
				this.periodSelect.disabled = writable.length === 0;
			}
			if (!writable.includes(period)) {
				throw new Error(this.t("modals.newKeyResult.invalidContext"));
			}
			const objectives = await this.manager.getObjectiveSummaries(period);
			if (!current()) {
				return;
			}
			this.objectives = objectives;
			this.loadedPeriod = period;
			this.objectiveId = requestedId ? (objectives.some(o => o.id === requestedId) ? requestedId : "") : objectives[0]?.id ?? "";
			this.loadMessage?.setText(this.objectiveId ? "" : this.t("modals.newKeyResult.invalidContext"));
			this.inheritFields?.();
		} catch (error) {
			if (!current()) {
				return;
			}
			this.objectives = [];
			this.objectiveId = "";
			this.loadMessage?.setText(this.t("dashboard.loadFailedWithReason", {
				message: error instanceof Error ? error.message : this.t("errors.unknown"),
			}));
		} finally {
			if (current()) {
				this.loading = false;
				this.renderObjectiveOptions(select);
				this.validate();
			}
		}
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
		if (!this.objectiveId) {
			select.createEl("option", {
				text: this.t("modals.newKeyResult.invalidContext"),
				value: "",
			});
		}
		for (const objective of this.objectives) {
			select.createEl("option", {
				text: `${objective.id} ${objective.title}`,
				value: objective.id,
			});
		}
		select.value = this.objectiveId;
	}

	close(): void {
		if (!this.isSubmitting) {
			super.close();
		}
	}

	private setBusy(busy: boolean): void {
		if (!busy) {
			this.restoreControls?.();
			this.restoreControls = undefined;
			return;
		}
		const controls = Array.from(
			this.contentEl.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>(
				"input, button, select, textarea",
			),
		);
		const states = controls.map(control => control.disabled);
		const button = this.contentEl.querySelector<HTMLButtonElement>(".okr-btn-confirm");
		const label = button?.textContent ?? "";
		controls.forEach(control => {
			control.disabled = true;
		});
		if (button) {
			button.setText(this.t("actions.saving"));
		}
		this.restoreControls = () => {
			controls.forEach((control, index) => {
				control.disabled = states[index] ?? false;
			});
			if (button) {
				button.setText(label);
			}
		};
	}

	private createRequiredLabel(container: HTMLElement, text: string): void {
		const label = container.createEl("label", { cls: "okr-label" });
		label.appendText(text);
		label.createSpan({ cls: "okr-required", text: "*" });
	}

	private showLoadError(error: unknown): void {
		new Notice(
			this.t("dashboard.loadFailedWithReason", {
				message:
					error instanceof Error ? error.message : this.t("errors.unknown"),
			}),
		);
	}

	private t(
		key: string,
		values?: Record<string, TranslationValue>,
	): string {
		return this.manager.getI18n().t(key, values);
	}
}
