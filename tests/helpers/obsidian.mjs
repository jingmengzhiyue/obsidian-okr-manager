import { load, dump, JSON_SCHEMA } from "js-yaml";

export const parseYaml = (text) => load(text, { schema: JSON_SCHEMA });
export const stringifyYaml = (value) => dump(value, { schema: JSON_SCHEMA, noRefs: true });

export class TAbstractFile {
	constructor(path) { this.path = path; this.name = path.split("/").at(-1); }
}
export class TFile extends TAbstractFile { extension = "md"; }
export class TFolder extends TAbstractFile { children = []; }
export class App {}

// Only the DOM operations exercised by the form regressions are simulated.
export class Element {
	constructor(tag = "div", options = {}) {
		this.tag = tag;
		Object.assign(this, options);
		this.children = [];
		this.events = {};
		this.value = "";
		this.checked = false;
		this.disabled = false;
		this.ownerDocument = { activeElement: null };
		this.doc = this.ownerDocument;
		this.classes = new Set();
	}
	createEl(tag, options) { const child = new Element(tag, options); this.children.push(child); return child; }
	createDiv(options) { return this.createEl("div", options); }
	createSpan(options) { return this.createEl("span", options); }
	empty() { this.children = []; }
	addClass(...names) { names.forEach((name) => this.classes.add(name)); }
	removeClass(name) { this.classes.delete(name); }
	hasClass(name) { return this.classes.has(name); }
	toggleClass(name, enabled) { if (enabled) this.classes.add(name); else this.classes.delete(name); }
	setAttribute(name, value) { this[name] = value; }
	removeAttribute(name) { delete this[name]; }
	setText(text) { this.text = text; }
	addEventListener(name, listener) { (this.events[name] ??= []).push(listener); }
	append() {}
	appendText() {}
	focus() { this.ownerDocument.activeElement = this; }
	all() { return this.children.flatMap((child) => [child, ...child.all()]); }
}
export class Modal {
	constructor(app) { this.app = app; this.contentEl = new Element(); this.modalEl = new Element(); }
	onOpen() {}
	onClose() {}
	open() { this.onOpen(); }
	close() { this.onClose(); }
}
export class Notice { constructor(message) { this.message = message; } }
