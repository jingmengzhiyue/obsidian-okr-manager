type HasDocument = {
	doc?: Document | null;
};

export function getElementDocument(
	element: HasDocument | null | undefined,
	fallback?: Document,
): Document {
	const doc = element?.doc ?? fallback;
	if (!doc) {
		throw new Error("Document context is required");
	}
	return doc;
}

export function isActiveElement(
	element: (Element & HasDocument) | null | undefined,
	doc?: Document,
): boolean {
	return (doc ?? getElementDocument(element)).activeElement === element;
}
