import { App, Modal, Notice } from "obsidian";
import { createI18n, detectLocale, type I18n } from "../i18n";

interface ConfirmModalOptions {
	title: string;
	message: string;
	confirmText?: string;
	errorNotice?: string;
	onConfirm: () => Promise<void> | void;
}

export class ConfirmModal extends Modal {
	private isSubmitting = false;
	private readonly i18n: I18n;

	constructor(
		app: App,
		private options: ConfirmModalOptions,
	) {
		super(app);
		this.i18n = createI18n(detectLocale(app));
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
			text: this.i18n.t("modals.confirm.cancel"),
		});
		cancelBtn.addEventListener("click", () => this.close());

		const confirmBtn = footer.createEl("button", {
			cls: "okr-btn-confirm okr-btn-danger",
			text: this.options.confirmText ?? this.i18n.t("actions.confirm"),
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

		const action =
			this.options.confirmText ?? this.i18n.t("actions.confirm");
		return this.i18n.t("errors.confirmActionFailed", { action });
	}
}
