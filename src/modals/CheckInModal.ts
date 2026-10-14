import { App, Modal, Notice } from "obsidian";
import { type TranslationValue } from "../i18n";
import { OKRManager } from "../manager/OKRManager";
import { KeyResult } from "../types";
import { getTodayLocalDate, parseLocalDate } from "../utils/date";
import { getElementDocument, isActiveElement } from "../utils/document";
import { isValidCheckInFields } from "../utils/validation";
import { associateFields, setFieldError } from "../utils/form";

interface CheckInModalOptions {
	prefillKrId?: string;
	prefillPeriod?: string;
	onComplete?: () => void | Promise<void>;
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
	private saved = false;
	private active = false;
	private generation = 0;
	private restoreControls?: () => void;
	private inputSource: "current" | "progress" = "current";
	private validate!: () => boolean;

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
		if (this.isSubmitting || this.saved) return;
		this.active = true;
		const generation = ++this.generation;
		await super.onOpen();
		if (!this.active || generation !== this.generation) return;
		const { contentEl } = this;
		const modalDoc = getElementDocument(this.modalEl);
		contentEl.empty();
		this.modalEl.addClass("okr-modal");

		contentEl.createEl("h2", {
			cls: "okr-modal-title",
			text: this.t("modals.checkIn.title"),
		});

		try {
			const krs = await this.loadAllKeyResults();
			if (!this.active || generation !== this.generation) return;
			this.krs = krs;
		} catch (error) {
			if (!this.active || generation !== this.generation) return;
			this.krs = [];
			new Notice(
				this.t("dashboard.loadFailedWithReason", {
					message:
						error instanceof Error
							? error.message
							: this.t("errors.unknown"),
				}),
			);
			contentEl.createEl("p", { text: this.t("modals.checkIn.loadFailed") });
			const retry = contentEl.createEl("button", { text: this.t("actions.retry"), attr: { type: "button" } });
			retry.addEventListener("click", () => { void this.onOpen(); });
			return;
		}
		if (this.krId) {
			const selected = this.findSelectedKR();
			this.period = selected?.period ?? this.period;
		}
		if (!this.findSelectedKR() && !this.options.prefillKrId && !this.options.prefillPeriod && this.krs.length > 0) {
			const first = this.krs[0];
			this.krId = first?.id ?? "";
			this.period = first?.period ?? "";
		}
		this.syncSelectedKRValues();

		const krField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(krField, this.t("modals.checkIn.selectKeyResult"));
		const krSelect = krField.createEl("select", { cls: "okr-select" });
		if (!this.findSelectedKR() && (this.options.prefillKrId || this.options.prefillPeriod)) {
			krField.createDiv({ cls: "okr-input-hint", text: this.t("modals.checkIn.invalidContext") });
			krSelect.createEl("option", { text: this.t("modals.checkIn.invalidContext"), value: "" });
		}
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
			currentInput.removeClass("okr-invalid");
			currentError.removeClass("visible");
			progressInput.removeClass("okr-invalid");
			progressError.removeClass("visible");
			this.validate();
		});

		const dateField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(dateField, this.t("modals.checkIn.date"));
		const dateInput = dateField.createEl("input", {
			cls: "okr-input",
			type: "date",
		});
		dateInput.value = this.date;
		const updateDate = (): void => {
			this.date = dateInput.value;
			this.validate();
		};
		dateInput.addEventListener("input", updateDate);
		dateInput.addEventListener("change", updateDate);
		const dateError = dateField.createDiv({ cls: "okr-input-error", text: this.t("modals.input.dateError") });

		const currentField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(currentField, this.t("modals.checkIn.value"));
		const currentInput = currentField.createEl("input", {
			cls: "okr-input",
			type: "number",
			placeholder: "0",
		});
		const currentError = currentField.createDiv({
			cls: "okr-input-error",
			text: this.t("modals.checkIn.currentError"),
		});
		currentInput.setAttribute("step", "any");
		currentInput.setAttribute("min", "0");
		currentInput.value = String(this.current);
		currentInput.addEventListener("input", () => {
			const value = Number(currentInput.value);
			const selected = this.findSelectedKR();
			const valid =
				currentInput.value.length > 0 &&
				Number.isFinite(value) &&
				value >= 0 &&
				(selected?.unit !== "boolean" || value === 0 || value === 1);
			this.current = valid ? value : 0;
			this.inputSource = "current";
			currentInput.toggleClass(
				"okr-invalid",
				currentInput.value.length > 0 && !valid,
			);
			currentError.toggleClass(
				"visible",
				currentInput.value.length > 0 && !valid,
			);
			if (valid && this.manager.getSettings().autoComputeProgress) {
				this.progress = this.calculateProgressFromCurrent();
				progressInput.value = String(this.progress);
				slider.value = String(this.progress);
				sliderVal.setText(`${this.progress}%`);
			}
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
		const progressError = progressField.createDiv({
			cls: "okr-input-error",
			text: this.t("modals.checkIn.progressError"),
		});
		progressInput.addEventListener("input", () => {
			const value = Number(progressInput.value);
			const selected = this.findSelectedKR();
			const valid =
				progressInput.value.length > 0 &&
				Number.isFinite(value) &&
				Number.isInteger(value) &&
				value >= 0 &&
				value <= 100 &&
				(selected?.unit !== "boolean" || value === 0 || value === 100);
			this.progress = valid ? Math.round(value) : 0;
			this.inputSource = "progress";
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
			if (valid && this.manager.getSettings().autoComputeProgress) {
				this.current = this.calculateCurrentFromProgress();
				if (!isActiveElement(currentInput, modalDoc)) {
					currentInput.value = String(this.current);
				}
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
		slider.setAttribute("aria-label", this.t("modals.checkIn.progress"));
		slider.value = String(this.progress);
		const sliderVal = sliderRow.createSpan({
			cls: "okr-slider-value",
			text: `${this.progress}%`,
		});
		slider.addEventListener("input", () => {
			this.progress = Number.parseInt(slider.value, 10);
			this.inputSource = "progress";
			sliderVal.setText(`${this.progress}%`);
			progressInput.value = String(this.progress);
			const valid =
				this.findSelectedKR()?.unit !== "boolean" ||
				this.progress === 0 ||
				this.progress === 100;
			progressInput.toggleClass("okr-invalid", !valid);
			progressError.toggleClass("visible", !valid);
			if (valid && this.manager.getSettings().autoComputeProgress) {
				this.current = this.calculateCurrentFromProgress();
				if (!isActiveElement(currentInput, modalDoc)) {
					currentInput.value = String(this.current);
				}
			}
			this.validate();
		});
		const syncUnitConstraints = (): void => {
			const isBoolean = this.findSelectedKR()?.unit === "boolean";
			currentInput.setAttribute("step", isBoolean ? "1" : "any");
			if (isBoolean) {
				currentInput.setAttribute("max", "1");
			} else {
				currentInput.removeAttribute("max");
			}
			progressInput.setAttribute("step", isBoolean ? "100" : "1");
			slider.setAttribute("step", isBoolean ? "100" : "1");
		};
		syncUnitConstraints();
		krSelect.addEventListener("change", syncUnitConstraints);

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
			if (!this.active) return false;
			const selected = this.findSelectedKR();
			this.date = dateInput.value;
			setFieldError(dateInput, dateError, !!parseLocalDate(this.date));
			const current = Number(currentInput.value), progress = Number(progressInput.value);
			const boolean = selected?.unit === "boolean";
			const currentValid = currentInput.value.length > 0 && Number.isFinite(current) && current >= 0 && (!boolean || current === 0 || current === 1);
			const progressValid = progressInput.value.length > 0 && Number.isInteger(progress) && progress >= 0 && progress <= 100 && (!boolean || progress === 0 || progress === 100);
			currentError.setText(this.t(boolean ? "modals.input.booleanCurrentError" : "modals.checkIn.currentError"));
			progressError.setText(this.t(boolean ? "modals.input.booleanProgressError" : "modals.checkIn.progressError"));
			setFieldError(currentInput, currentError, currentValid);
			setFieldError(progressInput, progressError, progressValid);
			if (currentValid) this.current = current;
			if (progressValid) this.progress = progress;
			const valid =
				this.active && !this.saved && !this.isSubmitting && !!selected &&
				this.krId.length > 0 &&
				this.krs.length > 0 &&
				isValidCheckInFields(
					this.date,
					currentInput.value,
					progressInput.value,
					selected?.unit,
				);
			confirmBtn.disabled = !valid;
			return valid;
		};
		this.validate();
		associateFields(contentEl);
	}

	private async submit(): Promise<void> {
		if (!this.active || this.saved || this.isSubmitting || !this.validate()) {
			return;
		}

		this.isSubmitting = true;
		const generation = this.generation;
		const controls = Array.from(this.contentEl.querySelectorAll<HTMLInputElement>("input, select, textarea, button"));
		const disabled = controls.map(control => control.disabled);
		controls.forEach(control => { control.disabled = true; });
		this.restoreControls = () => { controls.forEach((control, index) => { control.disabled = disabled[index] ?? false; }); };
		const button = this.contentEl.querySelector<HTMLButtonElement>(".okr-btn-confirm");
		button?.setText(this.t("actions.saving"));
		this.validate();
		try {
			await this.manager.recordCheckIn({
				krId: this.krId,
				period: this.period,
				date: this.date,
				current:
					!this.manager.getSettings().autoComputeProgress ||
					this.inputSource === "current"
						? this.current
						: undefined,
				progress: this.progress,
				note: this.note,
				blocker: this.blocker,
			});
			this.saved = true;

			new Notice(
				this.t("modals.checkIn.saved", {
					krId: this.krId,
					progress: this.progress,
				}),
			);
			if (this.active && generation === this.generation) await this.options.onComplete?.();
		} catch (error) {
			new Notice(
				this.saved ? this.t("modals.savedFollowUpFailed") : error instanceof Error
					? this.t("modals.checkIn.saveFailedWithReason", {
							message: error.message,
						})
					: this.t("modals.checkIn.saveFailed"),
			);
		} finally {
			this.isSubmitting = false;
			if (this.active && generation === this.generation) {
				this.restoreControls?.();
				button?.setText(this.t("actions.save"));
				if (this.saved) this.close(); else this.validate();
			}
		}
	}

	onClose(): void {
		this.active = false;
		this.generation++;
		super.onClose();
		const { contentEl } = this;
		contentEl.empty();
	}

	close(): void { if (!this.isSubmitting) super.close(); }

	private async loadAllKeyResults(): Promise<KeyResult[]> {
		const writablePeriods = await this.manager.getWritablePeriods();
		const nested = await Promise.all(
			writablePeriods.map((period) =>
				this.manager.getAllKeyResultSummaries(period),
			),
		);
		return nested.flat();
	}

	private syncSelectedKRValues(): void {
		this.inputSource = "current";
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

		return (this.progress / 100) * kr.target;
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
		label.createSpan({ cls: "okr-required", text: "*" });
	}

	private t(
		key: string,
		values?: Record<string, TranslationValue>,
	): string {
		return this.manager.getI18n().t(key, values);
	}
}
