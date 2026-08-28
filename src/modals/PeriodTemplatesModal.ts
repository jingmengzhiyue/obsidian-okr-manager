import { App, Modal, Notice } from "obsidian";
import { OKRManager } from "../manager/OKRManager";
import type { PeriodTemplateSummary } from "../types";
import { ConfirmModal } from "./ConfirmModal";

export class PeriodTemplatesModal extends Modal {
	constructor(
		app: App,
		private manager: OKRManager,
		private onComplete?: (targetPeriod?: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		void super.onOpen();
		this.modalEl.addClass("okr-modal", "okr-period-template-modal");
		void this.renderTemplates();
	}

	onClose(): void {
		super.onClose();
		this.contentEl.empty();
	}

	private async renderTemplates(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.createEl("h2", {
			cls: "okr-modal-title",
			text: this.t("modals.templates.title"),
		});
		try {
			const templates = await this.manager.listPeriodTemplates();
			if (templates.length === 0) {
				this.contentEl.createEl("p", {
					text: this.t("modals.templates.empty"),
				});
				return;
			}
			for (const template of templates) {
				this.renderTemplate(template);
			}
		} catch (error) {
			new Notice(this.errorMessage(error));
		}
	}

	private renderTemplate(template: PeriodTemplateSummary): void {
		const row = this.contentEl.createDiv("okr-period-template-row");
		const summary = row.createDiv("okr-period-template-summary");
		summary.createEl("strong", { text: template.name });
		summary.createDiv({
			text: this.t("modals.templates.summary", {
				type: template.periodType,
				count: template.objectiveCount,
			}),
		});
		const controls = row.createDiv("okr-period-template-controls");
		const target = controls.createEl("input", {
			cls: "okr-input",
			type: "text",
			attr: { "aria-label": this.t("modals.templates.targetPeriod") },
		});
		target.value = this.manager.getParser().getCurrentPeriod(template.periodType);
		const apply = controls.createEl("button", {
			cls: "okr-btn-confirm",
			text: this.t("actions.applyTemplate"),
		});
		apply.addEventListener("click", () => {
			void this.applyTemplate(template.id, target.value.trim());
		});
		const remove = controls.createEl("button", {
			cls: "okr-btn-cancel",
			text: this.t("actions.delete"),
		});
		remove.addEventListener("click", () => {
			new ConfirmModal(this.app, {
				title: this.t("modals.templates.deleteTitle"),
				message: this.t("modals.templates.deleteConfirm", {
					name: template.name,
				}),
				confirmText: this.t("actions.delete"),
				onConfirm: async () => {
					await this.manager.deletePeriodTemplate(template.id);
					new Notice(this.t("notices.templateDeleted"));
					await this.renderTemplates();
				},
			}).open();
		});
	}

	private async applyTemplate(templateId: string, targetPeriod: string): Promise<void> {
		try {
			await this.manager.applyPeriodTemplate({ templateId, targetPeriod });
			new Notice(this.t("notices.templateApplied", { period: targetPeriod }));
			this.close();
			this.onComplete?.(targetPeriod);
		} catch (error) {
			new Notice(this.errorMessage(error));
		}
	}

	private errorMessage(error: unknown): string {
		return error instanceof Error ? error.message : this.t("errors.unknown");
	}

	private t(key: string, values?: Record<string, string | number>): string {
		return this.manager.getI18n().t(key, values);
	}
}
