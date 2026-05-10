import { App, Modal, Notice } from "obsidian";
import { OKRManager } from "../manager/OKRManager";
import { KeyResult } from "../types";
import { getTodayLocalDate } from "../utils/date";

interface CheckInModalOptions {
	prefillKrId?: string;
	onComplete?: () => void;
}

export class CheckInModal extends Modal {
	private krId = "";
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
		this.date = getTodayLocalDate();
	}

	async onOpen(): Promise<void> {
		await super.onOpen();
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("okr-modal");

		contentEl.createEl("h2", {
			cls: "okr-modal-title",
			text: "记录进度",
		});

		this.krs = await this.loadAllKeyResults();
		if (!this.krId && this.krs.length > 0) {
			this.krId = this.krs[0]?.id ?? "";
		}
		this.syncSelectedKRValues();

		const krField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(krField, "Key Result");
		const krSelect = krField.createEl("select", { cls: "okr-select" });
		if (this.krs.length === 0) {
			krSelect.createEl("option", {
				text: "暂无可记录的关键结果",
				value: "",
			});
			krSelect.disabled = true;
		} else {
			for (const kr of this.krs) {
				krSelect.createEl("option", {
					text: `${kr.id} ${kr.title}`,
					value: kr.id,
				});
			}
		}
		krSelect.value = this.krId;
		krSelect.addEventListener("change", () => {
			this.krId = krSelect.value;
			this.syncSelectedKRValues();
			currentInput.value = String(this.current);
			progressInput.value = String(this.progress);
			slider.value = String(this.progress);
			sliderVal.setText(`${this.progress}%`);
			this.validate();
		});

		const dateField = contentEl.createDiv("okr-field");
		this.createRequiredLabel(dateField, "日期");
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
		this.createRequiredLabel(currentField, "当前值");
		const currentInput = currentField.createEl("input", {
			cls: "okr-input",
			type: "number",
			placeholder: "0",
		});
		const currentError = currentField.createEl("div", {
			cls: "okr-input-error",
			text: "当前值必须是大于等于 0 的数字",
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
		this.createRequiredLabel(progressField, "进度 (%)");
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
			text: "进度必须是 0 到 100 之间的整数",
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
			if (document.activeElement !== currentInput) {
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
			if (document.activeElement !== currentInput) {
				currentInput.value = String(this.current);
			}
			this.validate();
		});

		const noteField = contentEl.createDiv("okr-field");
		noteField.createEl("label", { cls: "okr-label", text: "本次进展" });
		const noteInput = noteField.createEl("textarea", {
			cls: "okr-textarea",
			placeholder: "这周做了什么...",
		});
		noteInput.addEventListener("input", () => {
			this.note = noteInput.value.trim();
		});

		const blockerField = contentEl.createDiv("okr-field");
		blockerField.createEl("label", { cls: "okr-label", text: "阻碍因素" });
		const blockerInput = blockerField.createEl("textarea", {
			cls: "okr-textarea",
			placeholder: "遇到了什么问题...",
		});
		blockerInput.addEventListener("input", () => {
			this.blocker = blockerInput.value.trim();
		});

		const footer = contentEl.createDiv("okr-modal-footer");
		const cancelBtn = footer.createEl("button", {
			cls: "okr-btn-cancel",
			text: "取消",
		});
		cancelBtn.addEventListener("click", () => this.close());

		const confirmBtn = footer.createEl("button", {
			cls: "okr-btn-confirm",
			text: "保存",
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
				document.activeElement !== noteInput &&
				document.activeElement !== blockerInput
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
			const history = await this.manager.getCheckIns(this.krId);
			const latestProgress = history[0]?.progress ?? 0;
			const delta =
				history.length > 0
					? this.progress - latestProgress
					: this.progress;

			await this.manager.recordCheckIn({
				krId: this.krId,
				date: this.date,
				progress: this.progress,
				delta,
				note: this.note,
				blocker: this.blocker,
			});

			new Notice(`已记录 Check-in：${this.krId} ${this.progress}%`);
			this.options.onComplete?.();
			this.close();
		} catch (error) {
			new Notice(
				error instanceof Error
					? `记录 Check-in 失败：${error.message}`
					: "记录 Check-in 失败",
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
		const selected = this.krs.find((kr) => kr.id === this.krId);
		if (!selected) {
			this.current = 0;
			this.progress = 0;
			return;
		}

		this.current = selected.current;
		this.progress = selected.progress;
	}

	private calculateProgressFromCurrent(): number {
		const kr = this.krs.find((item) => item.id === this.krId);
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
		const kr = this.krs.find((item) => item.id === this.krId);
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

	private createRequiredLabel(container: HTMLElement, text: string): void {
		const label = container.createEl("label", { cls: "okr-label" });
		label.appendText(text);
		label.createEl("span", { cls: "okr-required", text: "*" });
	}
}
