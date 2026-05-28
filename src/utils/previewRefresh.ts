function normalizeComparablePath(path: string): string {
	return path.replace(/\\/g, "/");
}

export function shouldRefreshActivePreview(
	activeFilePath: string | null | undefined,
	sourcePath: string,
): boolean {
	if (!activeFilePath) {
		return false;
	}

	return (
		normalizeComparablePath(activeFilePath) ===
		normalizeComparablePath(sourcePath)
	);
}
