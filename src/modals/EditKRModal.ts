import { App, Modal, Notice } from "obsidian";
import { OKRManager } from "../manager/OKRManager";
import { Confidence, KeyResult } from "../types";

interface EditKRModalOptions {
	onComplete?: () => void;
}

export class EditKRModal extends Modal {
	private titleValue: string;
	private owner: string;
	private unit: KeyResult["unit"];
	private current: number;
	private target: number;
	private confidence: Confidence;
	private due: string;
	private description: string;
	private status: KeyResult["status"];
	private isSubmitting = false;
	private validate!: () => void;

	constructor(
		app: App,
		private manager: OKRManager,
		private keyResult: KeyResult,
		private options: EditKRModalOptions = {},
	) {
		super(app);
		this.titleValue = keyResult.title;
		this.owner = keyResult.owner;
		this.unit = keyResult.unit;
		this.current = keyResult.current;
		this.target = keyResult.target;
		this.confidence = keyResult.confidence;
		this.due = keyResult.due;
		this.description = keyResult.description;
		this.status = keyResult.status;
	}

	onOpen(): void {
		void super.onOpen();
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("okr-modal");

		contentEl.createEl("h2", {
			cls: "okr-modal-title",
			text: `编辑 Key Result ${this.keyResult.id}`,
		});
		contentEl.createEl("div", {
			cls: "okr-modal-subtitle",
			text: `所属 Objective：${this.keyResult.objectiveId}`,
		});

		const titleField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(titleField, "标题");
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
		this.createRequiredLabel(ownerField, "负责人");
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
		statusField.createEl("label", { cls: "okr-label", text: "状态" });
		const statusSelect = statusField.createEl("select", {
			cls: "okr-select",
		});
		statusSelect.createEl("option", { text: "进行中", value: "active" });
		statusSelect.createEl("option", { text: "已完成", value: "completed" });
		statusSelect.createEl("option", { text: "暂停中", value: "on-hold" });
		statusSelect.createEl("option", { text: "已取消", value: "cancelled" });
		statusSelect.value = this.status;
		statusSelect.addEventListener("change", () => {
			this.status = statusSelect.value as KeyResult["status"];
		});

		const unitField = contentEl.createDiv("okr-field");
		unitField.createEl("label", { cls: "okr-label", text: "进度单位" });
		const unitSelect = unitField.createEl("select", { cls: "okr-select" });
		unitSelect.createEl("option", { text: "分数 (score)", value: "score" });
		unitSelect.createEl("option", {
			text: "百分比 (percentage)",
			value: "percentage",
		});
		unitSelect.createEl("option", {
			text: "数值 (number)",
			value: "number",
		});
		unitSelect.createEl("option", {
			text: "布尔 (boolean)",
			value: "boolean",
		});
		unitSelect.value = this.unit;
		unitSelect.addEventListener("change", () => {
			this.unit = unitSelect.value as KeyResult["unit"];
		});

		const currentField = contentEl.createDiv("okr-field");
		currentField.createEl("label", { cls: "okr-label", text: "当前值" });
		const currentInput = currentField.createEl("input", {
			cls: "okr-input",
			type: "number",
		});
		currentInput.setAttribute("min", "0");
		currentInput.setAttribute("step", "any");
		currentInput.value = String(this.current);
		const currentError = currentField.createEl("div", {
			cls: "okr-input-error",
			text: "当前值必须是大于等于 0 的数字",
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
		this.createRequiredLabel(targetField, "目标值");
		const targetInput = targetField.createEl("input", {
			cls: "okr-input",
			type: "number",
		});
		targetInput.setAttribute("min", "0");
		targetInput.setAttribute("step", "any");
		targetInput.value = String(this.target);
		const targetError = targetField.createEl("div", {
			cls: "okr-input-error",
			text: "目标值必须是大于等于 0 的数字",
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
		confField.createEl("label", { cls: "okr-label", text: "信心度" });
		const confSelect = confField.createEl("select", { cls: "okr-select" });
		confSelect.createEl("option", { text: "低", value: "low" });
		confSelect.createEl("option", { text: "中", value: "medium" });
		confSelect.createEl("option", { text: "高", value: "high" });
		confSelect.value = this.confidence;
		confSelect.addEventListener("change", () => {
			this.confidence = confSelect.value as Confidence;
		});

		const dueField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(dueField, "截止日期");
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
		descField.createEl("label", { cls: "okr-label", text: "描述" });
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
			text: "取消",
		});
		cancelBtn.addEventListener("click", () => this.close());

		const confirmBtn = footer.createEl("button", {
			cls: "okr-btn-confirm",
			text: "保存",
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
				this.due.length === 0 ||
				targetInput.value.length === 0 ||
				targetInput.hasClass("okr-invalid") ||
				currentInput.hasClass("okr-invalid");
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
			const updated = await this.manager.updateKeyResult(
				this.keyResult.id,
				this.keyResult.period,
				{
					title: this.titleValue,
					description: this.description,
					owner: this.owner,
					unit: this.unit,
					current: this.current,
					target: this.target,
					status: this.status,
					confidence: this.confidence,
					due: this.due,
				},
			);
			new Notice(`已更新 Key Result：${updated.title}`);
			this.options.onComplete?.();
			this.close();
		} catch (error) {
			new Notice(
				error instanceof Error
					? `更新 Key Result 失败：${error.message}`
					: "更新 Key Result 失败",
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
}
