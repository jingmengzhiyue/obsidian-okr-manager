/** A field was changed both in the open editor and in the saved document. */
export class EditConflictError extends Error {
	constructor(readonly fields: string[]) {
		super(`The document changed while this editor was open (${fields.join(", ")}). Reopen it and apply your changes again.`);
		this.name = "EditConflictError";
	}
}

/** Compare scalar form fields against their opening values before applying them. */
export function getEditPatch<T extends object>(
	base: T,
	latest: T,
	desired: Partial<T>,
): Partial<T> {
	const patch: Partial<T> = {};
	const conflicts: string[] = [];
	for (const key of Object.keys(desired) as (keyof T)[]) {
		if (Object.is(desired[key], base[key])) {
			continue;
		}
		if (!Object.is(latest[key], base[key]) && !Object.is(latest[key], desired[key])) {
			conflicts.push(String(key));
		} else {
			patch[key] = desired[key];
		}
	}
	if (conflicts.length > 0) {
		throw new EditConflictError(conflicts);
	}
	return patch;
}
