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
		const cls = typeof options === "string" ? options : options.cls ?? "";
		cls.split(" ").filter(Boolean).forEach((name) => this.classes.add(name));
		Object.assign(this, options.attr ?? {});
	}
	createEl(tag, options) { const child = new Element(tag, options); child.parentElement = this; child.ownerDocument = this.ownerDocument; child.doc = this.doc; this.children.push(child); return child; }
	createDiv(options) { return this.createEl("div", options); }
	createSpan(options) { return this.createEl("span", options); }
	empty() { this.children = []; }
	addClass(...names) { names.forEach((name) => this.classes.add(name)); }
	removeClass(name) { this.classes.delete(name); }
	hasClass(name) { return this.classes.has(name); }
	toggleClass(name, enabled) { if (enabled) this.classes.add(name); else this.classes.delete(name); }
	setAttribute(name, value) { this[name] = value; }
	removeAttribute(name) { delete this[name]; }
	getAttribute(name) { return this[name] ?? null; }
	get tagName() { return this.tag.toUpperCase(); }
	get classList() { return { contains: (name) => this.hasClass(name), add: (...names) => this.addClass(...names), remove: (name) => this.removeClass(name) }; }
	querySelectorAll(selector) { return this.all().filter((child) => selector.split(",").some((part) => child.matches(part.trim()))); }
	querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
	matches(selector) {
		const match = selector.match(/^([\w-]+)?(?:\.([\w-]+))?(?:\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\])?$/);
		return !!match && (!match[1] || this.tag === match[1]) && (!match[2] || this.hasClass(match[2])) && (!match[3] || (match[4] === undefined ? this[match[3]] !== undefined : this[match[3]] === match[4]));
	}
	remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this); }
	contains(element) { return this === element || this.all().includes(element); }
	removeEventListener(name, listener) { this.events[name] = (this.events[name] ?? []).filter((item) => item !== listener); }
	scrollIntoView() {}
	setText(text) { this.text = text; }
	addEventListener(name, listener) { (this.events[name] ??= []).push(listener); }
	append() {}
	appendText() {}
	focus() { this.ownerDocument.activeElement = this; }
	all() { return this.children.flatMap((child) => [child, ...child.all()]); }
}
export class Modal {
	static instances = [];
	constructor(app) { Modal.instances.push(this); this.app = app; this.modalEl = new Element(); this.contentEl = this.modalEl.createDiv(); this.scope = { register() {}, unregister() {} }; }
	onOpen() {}
	onClose() {}
	open() { this.onOpen(); }
	close() { this.onClose(); }
}
export class Notice { static messages = []; constructor(message) { this.message = message; Notice.messages.push(message); } }
