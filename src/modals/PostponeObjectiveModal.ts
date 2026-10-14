import { App, Modal, Notice } from "obsidian";
import { type TranslationValue } from "../i18n";
import { OKRManager } from "../manager/OKRManager";
import { Objective } from "../types";
import { addLocalDays, getTodayLocalDate, parseLocalDate } from "../utils/date";
import { isValidPostponeDate } from "../utils/validation";

interface PostponeObjectiveModalOptions {
	onComplete?: () => void | Promise<void>;
}
let nextPostponeId = 0;

export class PostponeObjectiveModal extends Modal {
	private due = "";
	private isSubmitting = false;
	private saved = false;
	private opened = false;
	private lifecycle = 0;
	private validate!: () => boolean;
	private controls: (HTMLInputElement | HTMLButtonElement)[] = [];
	private confirmBtn!: HTMLButtonElement;

	constructor(app: App, private manager: OKRManager, private objective: Objective,
		private options: PostponeObjectiveModalOptions = {}) {
		super(app);
		this.objective = { ...objective };
	}

	onOpen(): void {
		if (this.isSubmitting || this.saved) return;
		void super.onOpen();
		this.opened = true;
		this.lifecycle++;
		const { contentEl } = this;
		contentEl.empty();
		this.controls = [];
		this.modalEl.addClass("okr-modal");
		const minimum = addLocalDays(this.objective.due, 1);
		const today = getTodayLocalDate();
		this.due = minimum ? (minimum > today ? minimum : today) : "";
		contentEl.createEl("h2", { cls: "okr-modal-title", text: this.t("modals.postpone.title", { id: this.objective.id }) });
		contentEl.createDiv({ cls: "okr-modal-subtitle", text: this.objective.due
			? this.t("modals.postpone.currentDueDate", { due: this.objective.due })
			: this.t("modals.postpone.currentDueDateUnset") });
		contentEl.createDiv({text:this.objective.title});
		const field = contentEl.createDiv("okr-field");
		const id = `okr-postpone-${++nextPostponeId}`;
		field.createEl("label", {cls:"okr-label",text:this.t("modals.fields.newDueDate"),attr:{for:id}});
		const input = field.createEl("input", {cls:"okr-input",type:"date",attr:{id,"aria-describedby":`${id}-message`}});
		input.value = this.due;
		if (minimum) input.min = minimum;
		const message = field.createDiv({cls:"okr-input-hint",attr:{id:`${id}-message`,"aria-live":"polite"}});
		const update = () => { this.due = input.value; this.validate(); };
		input.addEventListener("input", update);
		input.addEventListener("change", update);
		this.controls.push(input);
		const shortcuts = field.createDiv("okr-modal-footer");
		const shortcutHint = field.createDiv({ cls: "okr-input-hint", attr: { id: `${id}-shortcuts` } });
		const shortcutButtons: {button: HTMLButtonElement; days: number}[] = [];
		for (const days of [0,7,30]) {
			const button = shortcuts.createEl("button", {text:this.t(`modals.postpone.shortcut${days}`),attr:{type:"button"}});
			button.setAttribute("aria-describedby", `${id}-shortcuts`);
			button.addEventListener("click", () => {
				const candidate = addLocalDays(getTodayLocalDate(),days);
				if (this.isSubmitting || this.saved || !candidate || !isValidPostponeDate(this.objective.due,candidate)) return;
				input.value = candidate; update();
			});
			shortcutButtons.push({button,days});
		}
		contentEl.createDiv({cls:"okr-input-hint",text:this.t("modals.postpone.scope")});
		const footer = contentEl.createDiv("okr-modal-footer");
		const cancel = footer.createEl("button",{cls:"okr-btn-cancel",text:this.t("actions.cancel"),attr:{type:"button"}});
		cancel.addEventListener("click",()=>this.close());
		this.controls.push(cancel);
		this.confirmBtn = footer.createEl("button",{cls:"okr-btn-confirm",text:this.t("actions.savePostpone"),attr:{type:"button"}});
		this.confirmBtn.addEventListener("click",()=>{void this.submit();});
		this.validate = () => {
			this.due = input.value;
			const valid = isValidPostponeDate(this.objective.due,this.due);
			let key = "";
			if (!minimum) key = "modals.postpone.invalidOriginal";
			else if (!this.due) key = "modals.postpone.dateRequired";
			else if (!parseLocalDate(this.due)) key = "modals.postpone.invalidDate";
			else if (!valid) key = "modals.postpone.mustBeLater";
			else if (this.due < getTodayLocalDate()) key = "modals.postpone.stillOverdue";
			message.setText(key ? this.t(key) : "");
			input.setAttribute("aria-invalid",String(!valid));
			for (const control of this.controls) control.disabled = this.isSubmitting || this.saved;
			input.disabled = input.disabled || !minimum;
			for (const {button,days} of shortcutButtons) {
				const candidate = addLocalDays(getTodayLocalDate(),days);
				const allowed = !!candidate && isValidPostponeDate(this.objective.due,candidate);
				button.disabled = this.isSubmitting || this.saved || !allowed;
				button.title = allowed ? "" : this.t("modals.postpone.mustBeLater");
			}
			shortcutHint.setText(shortcutButtons.some(({ button }) => !!button.title) ? this.t("modals.postpone.mustBeLater") : "");
			this.confirmBtn.disabled = !valid || this.isSubmitting || this.saved;
			this.confirmBtn.setText(this.t(this.isSubmitting ? "modals.common.saving" : "actions.savePostpone"));
			return valid;
		};
		this.validate();
		input.focus();
	}

	close(): void { if (!this.isSubmitting) super.close(); }
	onClose(): void { this.lifecycle++; this.opened = false; super.onClose(); this.contentEl.empty(); }

	private async submit(): Promise<void> {
		if (!this.opened || this.isSubmitting || this.saved || !this.validate()) return;
		const due = this.due;
		const lifecycle = this.lifecycle;
		this.isSubmitting = true;
		this.validate();
		try {
			await this.manager.updateObjective(this.objective.id,this.objective.period,{
				title:this.objective.title,description:this.objective.description,owner:this.objective.owner,status:this.objective.status,due,
			},this.objective);
		} catch (error) {
			new Notice(error instanceof Error ? this.t("modals.postpone.saveFailedWithReason",{message:error.message}) : this.t("modals.postpone.saveFailed"));
			this.isSubmitting = false;
			if (this.opened && lifecycle === this.lifecycle) this.validate();
			return;
		}
		this.saved = true;
		this.isSubmitting = false;
		if (this.opened && lifecycle === this.lifecycle) this.validate();
		new Notice(this.t("modals.postpone.saved",{due}));
		try { await this.options.onComplete?.(); }
		catch { new Notice(this.t("modals.common.savedFollowupFailed")); }
		if (this.opened && lifecycle === this.lifecycle) this.close();
	}
	private t(key:string,values?:Record<string,TranslationValue>):string { return this.manager.getI18n().t(key,values); }
}
