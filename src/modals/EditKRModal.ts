import { App, Modal, Notice } from "obsidian";
import { type TranslationValue } from "../i18n";
import { OKRManager } from "../manager/OKRManager";
import { parseLocalDate } from "../utils/date";
import { Confidence, KeyResult } from "../types";
import { parseKRNumbers } from "../utils/krForm";
import { associateFields, setFieldError } from "../utils/form";

interface EditKRModalOptions {
	onComplete?: () => void | Promise<void>;
}

export class EditKRModal extends Modal {
	private titleValue: string;
	private owner: string;
	private unit: KeyResult["unit"];
	private weight: number;
	private current: number;
	private target: number;
	private confidence: Confidence;
	private due: string;
	private description: string;
	private status: KeyResult["status"];
	private isSubmitting = false;
	private saved = false;
	private active = false;
	private generation = 0;
	private restoreControls: (() => void) | undefined;
	private validate!: () => boolean;

	constructor(
		app: App,
		private manager: OKRManager,
		private keyResult: KeyResult,
		private options: EditKRModalOptions = {},
	) {
		super(app);
		this.keyResult = { ...keyResult };
		this.titleValue = keyResult.title;
		this.owner = keyResult.owner;
		this.unit = keyResult.unit;
		this.weight = keyResult.weight;
		this.current = keyResult.current;
		this.target = keyResult.target;
		this.confidence = keyResult.confidence;
		this.due = keyResult.due;
		this.description = keyResult.description;
		this.status = keyResult.status;
	}

	onOpen(): void {
		if (this.isSubmitting || this.saved) {
			return;
		}
		void super.onOpen();
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("okr-modal");
		this.active = true;
		this.generation++;
		this.saved = false;

		contentEl.createEl("h2", {
			cls: "okr-modal-title",
			text: this.t("modals.editKeyResult.title", {
				id: this.keyResult.id,
			}),
		});
		contentEl.createDiv({
			cls: "okr-modal-subtitle",
			text: this.t("modals.editKeyResult.subtitle", {
				objectiveId: this.keyResult.objectiveId,
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
		ownerField.createEl("label", {
			cls: "okr-label",
			text: this.t("modals.fields.owner"),
		});
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
			this.status = statusSelect.value as KeyResult["status"];
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
			this.unit = unitSelect.value as KeyResult["unit"];
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
		});
		currentInput.setAttribute("min", "0");
		currentInput.setAttribute("step", "any");
		currentInput.value = String(this.current);
		const currentError = currentField.createDiv({
			cls: "okr-input-error",
			text: this.t("modals.input.currentError"),
		});
		currentInput.addEventListener("input", () => {
			this.validate();
		});

		const targetField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(targetField, this.t("modals.fields.targetValue"));
		const targetInput = targetField.createEl("input", {
			cls: "okr-input",
			type: "number",
		});
		targetInput.setAttribute("min", "0");
		targetInput.setAttribute("step", "any");
		targetInput.value = String(this.target);
		const targetError = targetField.createDiv({
			cls: "okr-input-error",
			text: this.t("modals.input.targetError"),
		});
		targetInput.addEventListener("input", () => {
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
			this.due = dueInput.value;
			this.validate();
		});
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
				 this.titleValue.length > 0 &&
				!!parseLocalDate(this.due) &&
				numbers.valid;
			confirmBtn.disabled = !valid;
			return valid;
		};
		associateFields(contentEl);
		this.validate();
	}

	onClose(): void {
		this.active = false;
		this.generation++;
		super.onClose();
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		if (!this.active || this.saved || this.isSubmitting || !this.validate()) {
			return;
		}

		this.isSubmitting = true;
		this.setBusy(true);
		try {
			const updated = await this.manager.updateKeyResult(
				this.keyResult.id,
				this.keyResult.period,
				{
					title: this.titleValue,
					description: this.description,
					owner: this.owner,
					unit: this.unit,
					weight: this.weight,
					current: this.current,
					target: this.target,
					status: this.status,
					confidence: this.confidence,
					due: this.due,
				},
				this.keyResult,
			);
			this.saved = true;
			new Notice(
				this.t("modals.updateKeyResult.saved", {
					title: updated.title,
				}),
			);
			await this.options.onComplete?.();
		} catch (error) {
			new Notice(
				this.saved ? this.t("modals.savedFollowUpFailed") : error instanceof Error
					? this.t("modals.updateKeyResult.saveFailedWithReason", {
							message: error.message,
						})
					: this.t("modals.updateKeyResult.saveFailed"),
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

	private t(
		key: string,
		values?: Record<string, TranslationValue>,
	): string {
		return this.manager.getI18n().t(key, values);
	}
}
