let nextFieldId = 0;

/** Associate fields inside this modal only; IDs stay unique across pop-out windows. */
export function associateFields(container: HTMLElement): void {
	container.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
		button.type = "button";
		// IME confirmation must not trigger a focused button's native activation.
		button.addEventListener("keydown", (event) => {
			if (event.isComposing || Reflect.get(event, "keyCode") === 229) event.preventDefault();
		});
	});
	container.querySelectorAll<HTMLElement>(".okr-field").forEach((field) => {
		const input = field.querySelector<HTMLInputElement>("input, select, textarea");
		const label = field.querySelector<HTMLLabelElement>("label");
		if (!input) return;
		if (!input.id) input.id = `okr-field-${++nextFieldId}`;
		if (label) label.htmlFor = input.id;
		const descriptions = field.querySelectorAll<HTMLElement>(".okr-input-error, .okr-input-hint");
		const ids: string[] = [];
		descriptions.forEach((description) => {
			if (!description.id) description.id = `okr-field-${++nextFieldId}`;
			ids.push(description.id);
		});
		if (ids.length) input.setAttribute("aria-describedby", ids.join(" "));
	});
}

export function setFieldError(input: HTMLElement, error: HTMLElement, valid: boolean): void {
	input.toggleClass("okr-invalid", !valid);
	input.setAttribute("aria-invalid", String(!valid));
	error.toggleClass("visible", !valid);
}
