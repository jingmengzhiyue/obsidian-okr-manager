export interface FileLikeNode {
	path: string;
	extension?: string;
	children?: FileLikeNode[];
}

function isFolderLike(node: FileLikeNode): node is FileLikeNode & {
	children: FileLikeNode[];
} {
	return Array.isArray(node.children);
}

function isMarkdownFileLike(node: FileLikeNode): boolean {
	return !isFolderLike(node) && node.extension === "md";
}

export function collectMarkdownFilesFromTree<T extends FileLikeNode>(
	root: T,
): Array<T extends { children: FileLikeNode[] } ? FileLikeNode : T> {
	const files: FileLikeNode[] = [];

	if (!isFolderLike(root)) {
		return (isMarkdownFileLike(root) ? [root] : []) as Array<
			T extends { children: FileLikeNode[] } ? FileLikeNode : T
		>;
	}

	for (const child of root.children) {
		if (isFolderLike(child)) {
			files.push(...collectMarkdownFilesFromTree(child));
			continue;
		}

		if (isMarkdownFileLike(child)) {
			files.push(child);
		}
	}

	return files as Array<T extends { children: FileLikeNode[] } ? FileLikeNode : T>;
}
