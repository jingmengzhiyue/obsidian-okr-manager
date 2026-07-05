import { App, Modal, Notice } from "obsidian";
import { type TranslationValue } from "../i18n";
import { OKRManager } from "../manager/OKRManager";
import { KeyResult } from "../types";
import { getTodayLocalDate } from "../utils/date";
import { getElementDocument, isActiveElement } from "../utils/document";

interface CheckInModalOptions {
	prefillKrId?: string;
	prefillPeriod?: string;
	onComplete?: () => void;
}

export class CheckInModal extends Modal {
	private krId = "";
	private period = "";
	private date: string = "";
	private current: number = 0;
	private progress: number = 0;
	private note: string = "";
	private blocker: string = "";
	private krs: KeyResult[] = [];
	private isSubmitting = false;
	private validate!: () => void;

	constructor(
		app: App,
		private manager: OKRManager,
		private options: CheckInModalOptions = {},
	) {
		super(app);
		this.krId = options.prefillKrId ?? "";
		this.period = options.prefillPeriod ?? "";
		this.date = getTodayLocalDate();
	}

	async onOpen(): Promise<void> {
		await super.onOpen();
		const { contentEl } = this;
		const modalDoc = getElementDocument(this.modalEl);
		contentEl.empty();
		this.modalEl.addClass("okr-modal");

		contentEl.createEl("h2", {
			cls: "okr-modal-title",
			text: this.t("modals.checkIn.title"),
		});

		this.krs = await this.loadAllKeyResults();
		if (this.krId) {
			const selected = this.findSelectedKR();
			this.period = selected?.period ?? this.period;
		}
		if (!this.krId && this.krs.length > 0) {
			const first = this.krs[0];
			this.krId = first?.id ?? "";
			this.period = first?.period ?? "";
		}
		this.syncSelectedKRValues();

		const krField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(krField, this.t("modals.checkIn.selectKeyResult"));
		const krSelect = krField.createEl("select", { cls: "okr-select" });
		if (this.krs.length === 0) {
			krSelect.createEl("option", {
				text: this.t("modals.checkIn.noKeyResults"),
				value: "",
			});
			krSelect.disabled = true;
		} else {
			for (const kr of this.krs) {
				krSelect.createEl("option", {
					text: `${kr.period} · ${kr.id} ${kr.title}`,
					value: this.getSelectValue(kr),
				});
			}
		}
		krSelect.value = this.getSelectedValue();
		krSelect.addEventListener("change", () => {
			const selected = this.parseSelectValue(krSelect.value);
			this.period = selected.period;
			this.krId = selected.krId;
			this.syncSelectedKRValues();
			currentInput.value = String(this.current);
			progressInput.value = String(this.progress);
			slider.value = String(this.progress);
			sliderVal.setText(`${this.progress}%`);
			this.validate();
		});

		const dateField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(dateField, this.t("modals.checkIn.date"));
		const dateInput = dateField.createEl("input", {
			cls: "okr-input",
			type: "date",
		});
		dateInput.value = this.date;
		dateInput.addEventListener("change", () => {
			this.date = dateInput.value;
			this.validate();
		});

		const currentField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(currentField, this.t("modals.checkIn.value"));
		const currentInput = currentField.createEl("input", {
			cls: "okr-input",
			type: "number",
			placeholder: "0",
		});
		const currentError = currentField.createEl("div", {
			cls: "okr-input-error",
			text: this.t("modals.checkIn.currentError"),
		});
		currentInput.setAttribute("step", "any");
		currentInput.setAttribute("min", "0");
		currentInput.value = String(this.current);
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
			this.progress = this.calculateProgressFromCurrent();
			progressInput.value = String(this.progress);
			slider.value = String(this.progress);
			sliderVal.setText(`${this.progress}%`);
			this.validate();
		});

		const progressField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(
			progressField,
			this.t("modals.checkIn.progress"),
		);
		const progressInput = progressField.createEl("input", {
			cls: "okr-input",
			type: "number",
			placeholder: "0-100",
		});
		progressInput.setAttribute("min", "0");
		progressInput.setAttribute("max", "100");
		progressInput.value = String(this.progress);
		const progressError = progressField.createEl("div", {
			cls: "okr-input-error",
			text: this.t("modals.checkIn.progressError"),
		});
		progressInput.addEventListener("input", () => {
			const value = Number(progressInput.value);
			const valid = Number.isFinite(value) && value >= 0 && value <= 100;
			this.progress = valid ? Math.round(value) : 0;
			progressInput.toggleClass(
				"okr-invalid",
				progressInput.value.length > 0 && !valid,
			);
			progressError.toggleClass(
				"visible",
				progressInput.value.length > 0 && !valid,
			);
			slider.value = String(this.progress);
			sliderVal.setText(`${this.progress}%`);
			this.current = this.calculateCurrentFromProgress();
			if (!isActiveElement(currentInput, modalDoc)) {
				currentInput.value = String(this.current);
			}
			this.validate();
		});

		const sliderRow = progressField.createDiv("okr-slider-row");
		const slider = sliderRow.createEl("input", {
			cls: "okr-slider",
			type: "range",
		});
		slider.setAttribute("min", "0");
		slider.setAttribute("max", "100");
		slider.setAttribute("step", "1");
		slider.value = String(this.progress);
		const sliderVal = sliderRow.createEl("span", {
			cls: "okr-slider-value",
			text: `${this.progress}%`,
		});
		slider.addEventListener("input", () => {
			this.progress = Number.parseInt(slider.value, 10);
			sliderVal.setText(`${this.progress}%`);
			progressInput.value = String(this.progress);
			progressInput.removeClass("okr-invalid");
			progressError.removeClass("visible");
			this.current = this.calculateCurrentFromProgress();
			if (!isActiveElement(currentInput, modalDoc)) {
				currentInput.value = String(this.current);
			}
			this.validate();
		});

		const noteField = contentEl.createDiv("okr-field");
		noteField.createEl("label", {
			cls: "okr-label",
			text: this.t("modals.checkIn.note"),
		});
		const noteInput = noteField.createEl("textarea", {
			cls: "okr-textarea",
			placeholder: this.t("modals.checkIn.notePlaceholder"),
		});
		noteInput.addEventListener("input", () => {
			this.note = noteInput.value.trim();
		});

		const blockerField = contentEl.createDiv("okr-field");
		blockerField.createEl("label", {
			cls: "okr-label",
			text: this.t("modals.checkIn.blocker"),
		});
		const blockerInput = blockerField.createEl("textarea", {
			cls: "okr-textarea",
			placeholder: this.t("modals.checkIn.blockerPlaceholder"),
		});
		blockerInput.addEventListener("input", () => {
			this.blocker = blockerInput.value.trim();
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
			attr: { disabled: "true", type: "button" },
		});
		confirmBtn.addEventListener("click", () => {
			void this.submit();
		});

		this.validate = () => {
			const valid =
				!this.isSubmitting &&
				this.krId.length > 0 &&
				this.date.length > 0 &&
				this.krs.length > 0 &&
				!currentInput.hasClass("okr-invalid") &&
				!progressInput.hasClass("okr-invalid");
			confirmBtn.disabled = !valid;
		};
		this.validate();

		this.modalEl.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				this.close();
				return;
			}

			if (
				e.key === "Enter" &&
				!isActiveElement(noteInput, modalDoc) &&
				!isActiveElement(blockerInput, modalDoc)
			) {
				e.preventDefault();
				void this.submit();
			}
		});
	}

	private async submit(): Promise<void> {
		this.validate();
		if (this.isSubmitting || !this.krId) {
			return;
		}

		this.isSubmitting = true;
		this.validate();
		try {
			await this.manager.recordCheckIn({
				krId: this.krId,
				period: this.period,
				date: this.date,
				current: this.current,
				progress: this.progress,
				note: this.note,
				blocker: this.blocker,
			});

			new Notice(
				this.t("modals.checkIn.saved", {
					krId: this.krId,
					progress: this.progress,
				}),
			);
			this.options.onComplete?.();
			this.close();
		} catch (error) {
			new Notice(
				error instanceof Error
					? this.t("modals.checkIn.saveFailedWithReason", {
							message: error.message,
						})
					: this.t("modals.checkIn.saveFailed"),
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

	private async loadAllKeyResults(): Promise<KeyResult[]> {
		return this.manager.getAllKeyResults();
	}

	private syncSelectedKRValues(): void {
		const selected = this.findSelectedKR();
		if (!selected) {
			this.current = 0;
			this.progress = 0;
			return;
		}

		this.current = selected.current;
		this.progress = selected.progress;
	}

	private calculateProgressFromCurrent(): number {
		const kr = this.findSelectedKR();
		if (!kr) {
			return 0;
		}

		if (kr.unit === "boolean") {
			return this.current >= kr.target ? 100 : 0;
		}

		if (kr.target <= 0) {
			return 0;
		}

		return Math.max(
			0,
			Math.min(100, Math.round((this.current / kr.target) * 100)),
		);
	}

	private calculateCurrentFromProgress(): number {
		const kr = this.findSelectedKR();
		if (!kr) {
			return 0;
		}

		if (kr.unit === "boolean") {
			return this.progress >= 100 ? 1 : 0;
		}

		if (kr.target <= 0) {
			return 0;
		}

		return Math.round((this.progress / 100) * kr.target);
	}

	private findSelectedKR(): KeyResult | undefined {
		return this.krs.find(
			(item) =>
				item.id === this.krId &&
				(!this.period || item.period === this.period),
		);
	}

	private getSelectValue(keyResult: KeyResult): string {
		return `${keyResult.period}::${keyResult.id}`;
	}

	private getSelectedValue(): string {
		return this.period && this.krId ? `${this.period}::${this.krId}` : "";
	}

	private parseSelectValue(value: string): { period: string; krId: string } {
		const [period = "", krId = ""] = value.split("::");
		return { period, krId };
	}

	private createRequiredLabel(container: HTMLElement, text: string): void {
		const label = container.createEl("label", { cls: "okr-label" });
		label.appendText(text);
		label.createEl("span", { cls: "okr-required", text: "*" });
	}

	private t(
		key: string,
		values?: Record<string, TranslationValue>,
	): string {
		return this.manager.getI18n().t(key, values);
	}
}
