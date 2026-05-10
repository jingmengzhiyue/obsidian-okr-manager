import { App, Modal, Notice, TFile } from "obsidian";
import { OKRManager } from "../manager/OKRManager";
import { Confidence } from "../types";

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
		super.onOpen();
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("okr-modal");

		const today = new Date().toISOString().split("T")[0] ?? "";
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
			text: "新建 Key Result",
		});

		const periodField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(periodField, "周期");
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
				text: this.manager.getParser().formatPeriodLabel(p),
				value: p,
			});
		}
		periodSelect.value = this.period;
		periodSelect.addEventListener("change", async () => {
			this.period = periodSelect.value;
			await this.loadObjectives();
			this.objectiveId = this.objectives[0]?.id ?? "";
			this.renderObjectiveOptions(objSelect);
			this.validate();
		});

		const objField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(objField, "所属 Objective");
		const objSelect = objField.createEl("select", { cls: "okr-select" });
		this.renderObjectiveOptions(objSelect);
		objSelect.value = this.objectiveId;
		objSelect.addEventListener("change", () => {
			this.objectiveId = objSelect.value;
			this.validate();
		});

		const titleField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(titleField, "标题");
		const titleInput = titleField.createEl("input", {
			cls: "okr-input",
			type: "text",
			placeholder: "例如：NPS 提升至 60",
		});
		titleInput.addEventListener("input", () => {
			this.title = titleInput.value.trim();
			this.validate();
		});

		const ownerField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(ownerField, "负责人");
		const ownerInput = ownerField.createEl("input", {
			cls: "okr-input",
			type: "text",
		});
		ownerInput.addEventListener("input", () => {
			this.owner = ownerInput.value.trim();
			this.validate();
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
			this.unit = unitSelect.value as typeof this.unit;
		});

		const currentField = contentEl.createDiv("okr-field");
		currentField.createEl("label", { cls: "okr-label", text: "当前值" });
		const currentInput = currentField.createEl("input", {
			cls: "okr-input",
			type: "number",
			placeholder: "0",
		});
		currentInput.setAttribute("min", "0");
		currentInput.setAttribute("step", "any");
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
			placeholder: "0",
		});
		targetInput.setAttribute("min", "0");
		targetInput.setAttribute("step", "any");
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
			placeholder: "详细说明...",
		});
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
			text: "创建",
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
			const today = new Date().toISOString().split("T")[0] ?? "";
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

			new Notice(`已创建 Key Result：${kr.title}`);
			this.options.onComplete?.();
			this.close();
		} catch (error) {
			new Notice(
				error instanceof Error
					? `创建 Key Result 失败：${error.message}`
					: "创建 Key Result 失败",
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

	private renderObjectiveOptions(select: HTMLSelectElement): void {
		select.empty();
		if (this.objectives.length === 0) {
			select.createEl("option", {
				text: "当前周期暂无 Objective",
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
}
