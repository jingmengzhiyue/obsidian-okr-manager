import type { Workspace, WorkspaceLeaf } from "obsidian";

type WorkspaceRevealCompat = Pick<Workspace, "setActiveLeaf"> &
	Partial<Pick<Workspace, "revealLeaf">>;

export async function revealLeafCompat(
	workspace: WorkspaceRevealCompat,
	leaf: WorkspaceLeaf,
): Promise<void> {
	if (typeof workspace.revealLeaf === "function") {
		await workspace.revealLeaf(leaf);
		return;
	}

	workspace.setActiveLeaf(leaf, { focus: true });
}
