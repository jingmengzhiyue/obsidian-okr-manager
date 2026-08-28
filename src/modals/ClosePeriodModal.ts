import { App, Modal, Notice } from "obsidian";
import { OKRManager } from "../manager/OKRManager";
import type { RolloverCandidate, RolloverSelection } from "../types";
import { getNextPeriod } from "../utils/period";
import { ConfirmModal } from "./ConfirmModal";
import { ReviewEditorModal } from "./ReviewEditorModal";

export class ClosePeriodModal extends Modal {
	private candidates: RolloverCandidate[] = [];
	private targetPeriod = "";
	private readonly selectedObjectives = new Set<string>();
	private readonly selectedKeyResults = new Set<string>();
	private isSubmitting = false;
	private hasRetrospective = false;

	constructor(
		app: App,
		private manager: OKRManager,
		private period: string,
		private onComplete?: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		void super.onOpen();
		this.modalEl.addClass("okr-modal", "okr-close-period-modal");
		void this.load();
	}

	onClose(): void {
		super.onClose();
		this.contentEl.empty();
	}

	private async load(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.createEl("h2", {
			cls: "okr-modal-title",
			text: this.t("modals.closePeriod.title", { period: this.period }),
		});
		this.contentEl.createDiv({ text: this.t("common.loading") });
		try {
			const info = await this.manager.getPeriodInfo(this.period);
			this.targetPeriod = getNextPeriod(this.period, info.periodType) ?? "";
			[this.candidates, this.hasRetrospective] = await Promise.all([
				this.manager.getRolloverCandidates(this.period),
				this.manager.hasPeriodReview(this.period, "retrospective"),
			]);
			for (const candidate of this.candidates) {
				this.selectedObjectives.add(candidate.objective.id);
				for (const keyResult of candidate.keyResults) {
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
			text: this.t("modals.closePeriod.title", { period: this.period }),
		});
		if (!this.hasRetrospective) {
			const warning = this.contentEl.createDiv("okr-review-required-warning");
			warning.createEl("strong", {
				text: this.t("modals.closePeriod.missingRetrospectiveWarning"),
			});
			const createReview = warning.createEl("button", {
				cls: "okr-btn-secondary",
				text: this.t("actions.writeRetrospective"),
			});
			createReview.addEventListener("click", () => {
				new ReviewEditorModal(
					this.app,
					this.manager,
					this.period,
					"retrospective",
					undefined,
					() => {
						this.hasRetrospective = true;
						this.renderForm();
					},
				).open();
			});
		}

		const targetField = this.contentEl.createDiv("okr-field");
		const targetLabel = targetField.createEl("label", {
			text: this.t("modals.closePeriod.targetPeriod"),
		});
		const targetInput = targetField.createEl("input", {
			cls: "okr-input",
			type: "text",
		});
		targetInput.id = "okr-close-period-target";
		targetLabel.htmlFor = targetInput.id;
		targetInput.value = this.targetPeriod;
		targetInput.addEventListener("input", () => {
			this.targetPeriod = targetInput.value.trim();
		});

		const selection = this.contentEl.createDiv("okr-period-selection");
		selection.createEl("h3", {
			text: this.t("modals.closePeriod.rolloverHeading"),
		});
		if (this.candidates.length === 0) {
			selection.createEl("p", {
				text: this.t("modals.closePeriod.noCandidates"),
			});
		}
		for (const candidate of this.candidates) {
			const group = selection.createDiv("okr-period-selection-group");
			const objectiveLabel = group.createEl("label");
			const objectiveCheckbox = objectiveLabel.createEl("input", {
				type: "checkbox",
			});
			objectiveCheckbox.checked = true;
			objectiveLabel.append(` ${candidate.objective.id} ${candidate.objective.title}`);
			const childCheckboxes: HTMLInputElement[] = [];
			for (const keyResult of candidate.keyResults) {
				const keyResultLabel = group.createEl("label", {
					cls: "okr-period-selection-child",
				});
				const checkbox = keyResultLabel.createEl("input", {
					type: "checkbox",
				});
				checkbox.checked = true;
				checkbox.addEventListener("change", () => {
					if (checkbox.checked) {
						this.selectedKeyResults.add(keyResult.id);
					} else {
						this.selectedKeyResults.delete(keyResult.id);
					}
				});
				keyResultLabel.append(` ${keyResult.id} ${keyResult.title}`);
				childCheckboxes.push(checkbox);
			}
			objectiveCheckbox.addEventListener("change", () => {
				if (objectiveCheckbox.checked) {
					this.selectedObjectives.add(candidate.objective.id);
				} else {
					this.selectedObjectives.delete(candidate.objective.id);
				}
				for (const checkbox of childCheckboxes) {
					checkbox.disabled = !objectiveCheckbox.checked;
				}
			});
		}

		const footer = this.contentEl.createDiv("okr-modal-footer");
		const cancel = footer.createEl("button", {
			cls: "okr-btn-cancel",
			text: this.t("actions.cancel"),
		});
		cancel.addEventListener("click", () => this.close());
		const confirm = footer.createEl("button", {
			cls: "okr-btn-confirm",
			text: this.t("actions.closePeriod"),
		});
		confirm.addEventListener("click", () => void this.confirm());
	}

	private async confirm(): Promise<void> {
		const selections = this.buildSelections();
		if (this.candidates.length > 0 && selections.length === 0) {
			new ConfirmModal(this.app, {
				title: this.t("modals.closePeriod.noRolloverTitle"),
				message: this.t("modals.closePeriod.noRolloverConfirm"),
				confirmText: this.t("actions.closePeriod"),
				onConfirm: () =>
					this.confirmRetrospective(selections, true),
			}).open();
			return;
		}
		await this.confirmRetrospective(selections, false);
	}

	private async confirmRetrospective(
		selections: RolloverSelection[],
		allowUnfinishedWithoutRollover: boolean,
	): Promise<void> {
		if (!this.hasRetrospective) {
			new ConfirmModal(this.app, {
				title: this.t("modals.closePeriod.missingRetrospectiveTitle"),
				message: this.t("modals.closePeriod.missingRetrospectiveConfirm"),
				confirmText: this.t("actions.closePeriod"),
				onConfirm: () =>
					this.submit(
						selections,
						allowUnfinishedWithoutRollover,
						true,
					),
			}).open();
			return;
		}
		await this.submit(selections, allowUnfinishedWithoutRollover, false);
	}

	private buildSelections(): RolloverSelection[] {
		return this.candidates
			.filter((candidate) => this.selectedObjectives.has(candidate.objective.id))
			.map((candidate) => ({
				objectiveId: candidate.objective.id,
				keyResultIds: candidate.keyResults
					.filter((keyResult) => this.selectedKeyResults.has(keyResult.id))
					.map((keyResult) => keyResult.id),
			}));
	}

	private async submit(
		selections: RolloverSelection[],
		allowUnfinishedWithoutRollover: boolean,
		allowMissingRetrospective: boolean,
	): Promise<void> {
		if (this.isSubmitting) {
			return;
		}
		this.isSubmitting = true;
		try {
			await this.manager.closePeriod({
				period: this.period,
				targetPeriod: this.targetPeriod,
				selections,
				allowUnfinishedWithoutRollover,
				allowMissingRetrospective,
			});
			new Notice(this.t("notices.periodClosed", { period: this.period }));
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
