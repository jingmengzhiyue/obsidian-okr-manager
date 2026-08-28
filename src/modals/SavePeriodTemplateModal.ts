import { App, Modal, Notice } from "obsidian";
import { OKRManager } from "../manager/OKRManager";
import type { Objective, RolloverSelection } from "../types";

export class SavePeriodTemplateModal extends Modal {
	private objectives: Objective[] = [];
	private readonly selectedObjectives = new Set<string>();
	private readonly selectedKeyResults = new Set<string>();
	private templateName = "";
	private isSubmitting = false;

	constructor(
		app: App,
		private manager: OKRManager,
		private sourcePeriod: string,
		private onComplete?: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		void super.onOpen();
		this.modalEl.addClass("okr-modal", "okr-period-template-modal");
		void this.load();
	}

	onClose(): void {
		super.onClose();
		this.contentEl.empty();
	}

	private async load(): Promise<void> {
		try {
			this.objectives = await this.manager.getObjectiveSummaries(this.sourcePeriod);
			for (const objective of this.objectives) {
				this.selectedObjectives.add(objective.id);
				for (const keyResult of objective.keyResults) {
					this.selectedKeyResults.add(keyResult.id);
				}
			}
			this.renderForm();
		} catch (error) {
			new Notice(this.errorMessage(error));
			this.close();
		}
	}

	private renderForm(): void {
		this.contentEl.empty();
		this.contentEl.createEl("h2", {
			cls: "okr-modal-title",
			text: this.t("modals.saveTemplate.title"),
		});
		const nameField = this.contentEl.createDiv("okr-field");
		nameField.createEl("label", { text: this.t("modals.saveTemplate.name") });
		const nameInput = nameField.createEl("input", {
			cls: "okr-input",
			type: "text",
			attr: { "aria-label": this.t("modals.saveTemplate.name") },
		});
		nameInput.addEventListener("input", () => {
			this.templateName = nameInput.value;
		});

		const selection = this.contentEl.createDiv("okr-period-selection");
		selection.createEl("h3", {
			text: this.t("modals.saveTemplate.selection"),
		});
		for (const objective of this.objectives) {
			const group = selection.createDiv("okr-period-selection-group");
			const label = group.createEl("label");
			const checkbox = label.createEl("input", { type: "checkbox" });
			checkbox.checked = true;
			label.append(` ${objective.id} ${objective.title}`);
			const children: HTMLInputElement[] = [];
			for (const keyResult of objective.keyResults) {
				const childLabel = group.createEl("label", {
					cls: "okr-period-selection-child",
				});
				const child = childLabel.createEl("input", { type: "checkbox" });
				child.checked = true;
				child.addEventListener("change", () => {
					if (child.checked) {
						this.selectedKeyResults.add(keyResult.id);
					} else {
						this.selectedKeyResults.delete(keyResult.id);
					}
				});
				childLabel.append(` ${keyResult.id} ${keyResult.title}`);
				children.push(child);
			}
			checkbox.addEventListener("change", () => {
				if (checkbox.checked) {
					this.selectedObjectives.add(objective.id);
				} else {
					this.selectedObjectives.delete(objective.id);
				}
				for (const child of children) {
					child.disabled = !checkbox.checked;
				}
			});
		}

		const footer = this.contentEl.createDiv("okr-modal-footer");
		const cancel = footer.createEl("button", {
			cls: "okr-btn-cancel",
			text: this.t("actions.cancel"),
		});
		cancel.addEventListener("click", () => this.close());
		const save = footer.createEl("button", {
			cls: "okr-btn-confirm",
			text: this.t("actions.saveTemplate"),
		});
		save.addEventListener("click", () => void this.submit());
	}

	private async submit(): Promise<void> {
		if (this.isSubmitting) {
			return;
		}
		this.isSubmitting = true;
		try {
			const selections: RolloverSelection[] = this.objectives
				.filter((objective) => this.selectedObjectives.has(objective.id))
				.map((objective) => ({
					objectiveId: objective.id,
					keyResultIds: objective.keyResults
						.filter((keyResult) => this.selectedKeyResults.has(keyResult.id))
						.map((keyResult) => keyResult.id),
				}));
			await this.manager.savePeriodTemplate({
				name: this.templateName,
				sourcePeriod: this.sourcePeriod,
				selections,
			});
			new Notice(this.t("notices.templateSaved"));
			this.close();
			this.onComplete?.();
		} catch (error) {
			new Notice(this.errorMessage(error));
		} finally {
			this.isSubmitting = false;
		}
	}

	private errorMessage(error: unknown): string {
		return error instanceof Error ? error.message : this.t("errors.unknown");
	}

	private t(key: string, values?: Record<string, string | number>): string {
		return this.manager.getI18n().t(key, values);
	}
}
