import type { InitialKeyResult, KRUnit, Confidence } from "../types";
import type { I18n } from "../i18n";
import { parseLocalDate } from "../utils/date";
import { parseKRNumbers } from "../utils/krForm";
import { associateFields, setFieldError } from "../utils/form";

interface DraftCard {
	id: number;
	root: HTMLDetailsElement;
	summary: HTMLElement;
	inputs: Record<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
	errors: Record<string, HTMLElement>;
	ownerEdited: boolean;
	dueEdited: boolean;
	targetEdited: boolean;
}

/** These cards only hold form inputs. The parent submits all drafts in one write. */
export class KRDraftEditor {
	private cards: DraftCard[] = [];
	private nextId = 0;
	private list: HTMLElement;
	private addButton: HTMLButtonElement;
	constructor(container: HTMLElement, private i18n: I18n, private parent: () => { owner: string; due: string }, private onChange: () => void) {
		container.createEl("h3", { text: i18n.t("modals.drafts.title") });
		container.createEl("p", { cls: "okr-input-hint", text: i18n.t("modals.drafts.hint") });
		this.list = container.createDiv("okr-draft-list");
		this.addButton = container.createEl("button", { text: i18n.t("actions.addKeyResult"), cls: "okr-btn-secondary", attr: { type: "button" } });
		this.addButton.addEventListener("click", () => this.add());
	}

	private add(): void {
		const root = this.list.createEl("details", { cls: "okr-draft-card" });
		root.open = true;
		const summary = root.createEl("summary");
		const body = root.createDiv("okr-draft-body");
		const card: DraftCard = { id: ++this.nextId, root, summary, inputs: {}, errors: {}, ownerEdited: false, dueEdited: false, targetEdited: false };
		this.cards.push(card);
		const inherited = this.parent();
		const field = (name: string, type: string, value: string, choices?: string[]): void => {
			const row = body.createDiv("okr-field");
			row.createEl("label", { cls: "okr-label", text: this.i18n.t(`modals.fields.${name}`) });
			const input = choices ? row.createEl("select", { cls: "okr-select" })
				: type === "textarea" ? row.createEl("textarea", { cls: "okr-textarea" })
					: row.createEl("input", { cls: "okr-input", type });
			if (choices) choices.forEach((choice) => input.createEl("option", { value: choice, text: this.i18n.t(`modals.select.${choice}`) }));
			if (type === "number") { input.setAttribute("min", "0"); input.setAttribute("step", "any"); }
			input.value = value;
			card.inputs[name] = input;
			card.errors[name] = row.createDiv("okr-input-error");
			const change = (): void => {
				if (name === "owner") card.ownerEdited = true;
				if (name === "dueDate") card.dueEdited = true;
				if (name === "targetValue") card.targetEdited = true;
				if (name === "unit" && input.value === "boolean" && !card.targetEdited && card.inputs.targetValue) card.inputs.targetValue.value = "1";
				this.validateCard(card);
				this.onChange();
			};
			input.addEventListener("input", change);
			input.addEventListener("change", change);
		};
		field("title", "text", ""); field("owner", "text", inherited.owner);
		field("unit", "select", "score", ["score", "percentage", "number", "boolean"]);
		field("weight", "number", "1"); field("currentValue", "number", "0"); field("targetValue", "number", "");
		field("dueDate", "date", inherited.due);
		field("confidence", "select", "medium", ["low", "medium", "high"]);
		field("description", "textarea", "");
		const remove = body.createEl("button", { cls: "okr-btn-secondary", text: this.i18n.t("modals.drafts.remove"), attr: { type: "button" } });
		remove.addEventListener("click", () => {
			const index = this.cards.indexOf(card);
			this.cards = this.cards.filter((item) => item.id !== card.id);
			root.remove();
			(this.cards[index]?.summary ?? this.cards[index - 1]?.summary ?? this.addButton).focus();
			this.onChange();
		});
		root.addEventListener("toggle", () => {
			if (!root.open && body.contains(root.ownerDocument.activeElement)) summary.focus();
		});
		associateFields(root);
		this.validateCard(card);
		this.onChange();
		card.inputs.title?.focus();
	}

	inherit(): void {
		const parent = this.parent();
		for (const card of this.cards) {
			if (!card.ownerEdited && card.inputs.owner) card.inputs.owner.value = parent.owner;
			if (!card.dueEdited && card.inputs.dueDate) card.inputs.dueDate.value = parent.due;
			this.validateCard(card);
		}
	}

	private validateCard(card: DraftCard): boolean {
		const value = (name: string): string => card.inputs[name]?.value ?? "";
		const unit = value("unit") as KRUnit;
		const numbers = parseKRNumbers(unit, value("currentValue"), value("targetValue"), value("weight"));
		if ((card.inputs.currentValue as HTMLInputElement | undefined)?.validity?.badInput) {
			numbers.currentValid = false;
			numbers.valid = false;
		}
		const check = (name: string, valid: boolean, key: string): void => {
			const input = card.inputs[name], error = card.errors[name];
			if (input && error) { error.setText(this.i18n.t(key)); setFieldError(input, error, valid); }
		};
		check("title", !!value("title").trim(), "modals.input.titleRequired");
		check("dueDate", !!parseLocalDate(value("dueDate")), "modals.input.dateError");
		check("currentValue", numbers.currentValid, unit === "boolean" ? "modals.input.booleanCurrentError" : "modals.input.currentError");
		check("targetValue", numbers.targetValid, unit === "boolean" ? "modals.input.booleanTargetError" : "modals.input.targetError");
		check("weight", numbers.weightValid, "modals.input.weightError");
		for (const name of ["currentValue", "targetValue"]) {
			const input = card.inputs[name];
			input?.setAttribute("step", unit === "boolean" ? "1" : "any");
			if (unit === "boolean") input?.setAttribute("max", "1"); else input?.removeAttribute("max");
			if (name === "targetValue") input?.setAttribute("min", unit === "boolean" ? "1" : "0");
		}
		const valid = !!value("title").trim() && !!parseLocalDate(value("dueDate")) && numbers.valid;
		card.summary.setText(`${value("title") || this.i18n.t("modals.drafts.untitled")} · ${this.i18n.t(`modals.select.${unit}`)} · ${value("currentValue") || "0"}/${value("targetValue") || "?"} · ${this.i18n.t("modals.fields.weight")} ${value("weight")} ${valid ? "" : this.i18n.t("modals.drafts.invalid")}`);
		return valid;
	}

	isValid(): boolean { return this.cards.map((card) => this.validateCard(card)).every(Boolean); }

	snapshot(): InitialKeyResult[] {
		return this.cards.map((card) => {
			const value = (name: string): string => card.inputs[name]?.value ?? "";
			const unit = value("unit") as KRUnit;
			const { current, target, weight } = parseKRNumbers(unit, value("currentValue"), value("targetValue"), value("weight"));
			return { title: value("title"), owner: value("owner"), description: value("description"), unit, current, target, weight, due: value("dueDate"), confidence: value("confidence") as Confidence };
		});
	}
}
