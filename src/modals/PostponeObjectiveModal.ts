import { App, Modal, Notice } from "obsidian";
import { OKRManager } from "../manager/OKRManager";
import { Objective } from "../types";

interface PostponeObjectiveModalOptions {
	onComplete?: () => void;
}

export class PostponeObjectiveModal extends Modal {
	private due: string;
	private isSubmitting = false;
	private validate!: () => void;

	constructor(
		app: App,
		private manager: OKRManager,
		private objective: Objective,
		private options: PostponeObjectiveModalOptions = {},
	) {
		super(app);
		this.due = objective.due;
	}

	onOpen(): void {
		void super.onOpen();
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("okr-modal");

		contentEl.createEl("h2", {
			cls: "okr-modal-title",
			text: `延期 Objective ${this.objective.id}`,
		});
		contentEl.createEl("div", {
			cls: "okr-modal-subtitle",
			text: `当前截止日期：${this.objective.due || "未设置"}`,
		});

		const titleField = contentEl.createDiv("okr-field");
		titleField.createEl("label", {
			cls: "okr-label",
			text: "目标",
		});
		const titleInput = titleField.createEl("input", {
			cls: "okr-input",
			type: "text",
		});
		titleInput.value = this.objective.title;
		titleInput.disabled = true;

		const dueField = contentEl.createDiv("okr-field");
		dueField.createEl("label", {
			cls: "okr-label",
			text: "新的截止日期",
		});
		const dueInput = dueField.createEl("input", {
			cls: "okr-input",
			type: "date",
		});
		dueInput.value = this.due;
		dueInput.addEventListener("change", () => {
			this.due = dueInput.value;
			this.validate();
		});

		const hint = dueField.createEl("div", {
			cls: "okr-input-hint",
			text: "仅更新截止日期，其他目标字段保持不变。",
		});
		hint.setAttribute("role", "note");

		const footer = contentEl.createDiv("okr-modal-footer");
		const cancelBtn = footer.createEl("button", {
			cls: "okr-btn-cancel",
			text: "取消",
		});
		cancelBtn.addEventListener("click", () => this.close());

		const confirmBtn = footer.createEl("button", {
			cls: "okr-btn-confirm",
			text: "保存延期",
			attr: { type: "button" },
		});
		confirmBtn.addEventListener("click", () => {
			void this.submit();
		});

		this.validate = () => {
			confirmBtn.disabled =
				this.isSubmitting ||
				this.due.length === 0 ||
				this.due === this.objective.due;
		};
		this.validate();
		dueInput.focus();
	}

	onClose(): void {
		super.onClose();
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		this.validate();
		if (
			this.isSubmitting ||
			this.due.length === 0 ||
			this.due === this.objective.due
		) {
			return;
		}

		this.isSubmitting = true;
		this.validate();
		try {
			const updated = await this.manager.updateObjective(
				this.objective.id,
				this.objective.period,
				{
					title: this.objective.title,
					description: this.objective.description,
					owner: this.objective.owner,
					status: this.objective.status,
					due: this.due,
				},
			);
			new Notice(`已更新截止日期：${updated.due}`);
			this.options.onComplete?.();
			this.close();
		} catch (error) {
			new Notice(
				error instanceof Error
					? `更新截止日期失败：${error.message}`
					: "更新截止日期失败",
			);
		} finally {
			this.isSubmitting = false;
			this.validate();
		}
	}
}
