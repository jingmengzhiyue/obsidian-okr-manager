import { App, Modal, Notice, TFile } from "obsidian";
import { OKRManager } from "../manager/OKRManager";
import { OKRPeriodType } from "../types";

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
		super.onOpen();
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("okr-modal");
		const parser = this.manager.getParser();
		this.periodType = this.manager.getSettings().defaultPeriodType;
		this.period = parser.getCurrentPeriod(this.periodType);
		this.due = parser.getDefaultDue(this.periodType);

		contentEl.createEl("h2", {
			cls: "okr-modal-title",
			text: "新建 Objective",
		});

		const periodTypeField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(periodTypeField, "周期类型");
		const periodTypeSelect = periodTypeField.createEl("select", {
			cls: "okr-select",
		});
		periodTypeSelect.createEl("option", { text: "周", value: "week" });
		periodTypeSelect.createEl("option", { text: "月", value: "month" });
		periodTypeSelect.createEl("option", { text: "季度", value: "quarter" });
		periodTypeSelect.createEl("option", { text: "年", value: "year" });
		periodTypeSelect.value = this.periodType;

		const periodField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(periodField, "周期");
		const periodInput = periodField.createEl("input", {
			cls: "okr-input",
			type: "text",
			attr: { placeholder: "例如：2026-Q2" },
		});
		periodInput.value = this.period;
		const periodHint = periodField.createEl("div", {
			cls: "okr-input-hint",
			text: this.getPeriodHint(this.periodType),
		});
		const periodError = periodField.createEl("div", {
			cls: "okr-input-error",
			text: "周期格式不正确",
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
		this.createRequiredLabel(titleField, "标题");
		const titleInput = titleField.createEl("input", {
			cls: "okr-input",
			type: "text",
			placeholder: "例如：提升产品用户体验",
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
			placeholder: "背景描述...",
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

			if (e.key === "Enter" && document.activeElement !== descInput) {
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
			const today = new Date().toISOString().split("T")[0] ?? "";
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

			new Notice(`已创建 Objective：${obj.title}`);
			this.onComplete?.();
			this.close();
		} catch (error) {
			new Notice(
				error instanceof Error
					? `创建 Objective 失败：${error.message}`
					: "创建 Objective 失败",
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
				return "格式：YYYY-Www，例如 2026-W20";
			case "month":
				return "格式：YYYY-MM，例如 2026-05";
			case "quarter":
				return "格式：YYYY-Qn，例如 2026-Q2";
			case "year":
			default:
				return "格式：YYYY，例如 2026";
		}
	}
}
