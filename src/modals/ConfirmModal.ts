import { App, Modal, Notice } from "obsidian";

interface ConfirmModalOptions {
	title: string;
	message: string;
	confirmText?: string;
	errorNotice?: string;
	onConfirm: () => Promise<void> | void;
}

export class ConfirmModal extends Modal {
	private isSubmitting = false;

	constructor(
		app: App,
		private options: ConfirmModalOptions,
	) {
		super(app);
	}

	onOpen(): void {
		void super.onOpen();
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("okr-modal", "okr-confirm-modal");

		contentEl.createEl("h2", {
			cls: "okr-modal-title",
			text: this.options.title,
		});
		contentEl.createEl("p", {
			cls: "okr-confirm-message",
			text: this.options.message,
		});

		const footer = contentEl.createDiv("okr-modal-footer");
		const cancelBtn = footer.createEl("button", {
			cls: "okr-btn-cancel",
			text: "取消",
		});
		cancelBtn.addEventListener("click", () => this.close());

		const confirmBtn = footer.createEl("button", {
			cls: "okr-btn-confirm okr-btn-danger",
			text: this.options.confirmText ?? "确认",
		});
		confirmBtn.addEventListener("click", () => {
			void this.confirm();
		});
	}

	onClose(): void {
		super.onClose();
		this.contentEl.empty();
	}

	private async confirm(): Promise<void> {
		if (this.isSubmitting) {
			return;
		}

		this.isSubmitting = true;
		try {
			await this.options.onConfirm();
			this.close();
		} catch (error) {
			new Notice(this.getErrorNotice(error));
		} finally {
			this.isSubmitting = false;
		}
	}

	private getErrorNotice(error: unknown): string {
		if (this.options.errorNotice) {
			return this.options.errorNotice;
		}

		if (error instanceof Error && error.message.trim().length > 0) {
			return error.message;
		}

		const action = this.options.confirmText ?? "确认";
		return `${action}操作失败，请稍后重试`;
	}
}
