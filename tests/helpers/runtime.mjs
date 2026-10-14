import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";

// Obsidian ships declarations, not its runtime. Bundle the unchanged application
// modules against the test adapter so tests exercise their real persistence code.
const result = await build({
	stdin: {
		contents: `
export { OKRManager } from './src/manager/OKRManager.ts';
export { FileParser } from './src/manager/FileParser.ts';
export { ReviewRepository } from './src/manager/ReviewRepository.ts';
export { ClosePeriodModal } from './src/modals/ClosePeriodModal.ts';
export { EditKRModal } from './src/modals/EditKRModal.ts';
export { NewKRModal } from './src/modals/NewKRModal.ts';
export { NewObjectiveModal } from './src/modals/NewObjectiveModal.ts';
export { CheckInModal } from './src/modals/CheckInModal.ts';
export { PeriodReviewsModal } from './src/modals/PeriodReviewsModal.ts';
export { EditObjectiveModal } from './src/modals/EditObjectiveModal.ts';
export { PostponeObjectiveModal } from './src/modals/PostponeObjectiveModal.ts';
export { ReviewEditorModal } from './src/modals/ReviewEditorModal.ts';
export { DEFAULT_SETTINGS } from './src/types.ts';
export { createEmptyReviewSections } from './src/utils/review.ts';
export * from 'obsidian';`,
		resolveDir: fileURLToPath(new URL("../../", import.meta.url)),
		loader: "ts",
	},
	bundle: true,
	platform: "node",
	format: "cjs",
	write: false,
	plugins: [{
		name: "obsidian-test-adapter",
		setup(builder) {
			builder.onResolve({ filter: /^obsidian$/ }, () => ({
				path: fileURLToPath(new URL("./obsidian.mjs", import.meta.url)),
			}));
		},
	}],
});
const compiled = { exports: {} };
const evaluate = runInThisContext(
	`(function(require, module, exports) {${result.outputFiles[0].text}\n})`,
	{ filename: "okr-test-runtime.cjs" },
);
evaluate(createRequire(import.meta.url), compiled, compiled.exports);
export const runtime = compiled.exports;

export function createVault() {
	const { TFile, TFolder, parseYaml } = runtime;
	const files = new Map();
	const contents = new Map();
	const queues = new Map();
	const root = new TFolder("");
	files.set("", root);
	function attach(file) {
		const parentPath = file.path.split("/").slice(0, -1).join("/");
		const parent = files.get(parentPath);
		if (!(parent instanceof TFolder)) throw new Error(`Missing folder: ${parentPath}`);
		file.parent = parent;
		parent.children.push(file);
		files.set(file.path, file);
	}
	const app = {
		vault: {
			getAbstractFileByPath: (path) => files.get(path) ?? null,
			async createFolder(path) {
				if (files.has(path)) throw new Error(`Exists: ${path}`);
				const folder = new TFolder(path);
				attach(folder);
				return folder;
			},
			async create(path, content) {
				if (files.has(path)) throw new Error(`Exists: ${path}`);
				const file = new TFile(path);
				attach(file);
				contents.set(path, content);
				return file;
			},
			async read(file) {
				if (!contents.has(file.path)) throw new Error(`Missing: ${file.path}`);
				return contents.get(file.path);
			},
			async process(file, callback) {
				const previous = queues.get(file.path) ?? Promise.resolve();
				const operation = previous.catch(() => {}).then(async () => {
					const next = callback(await this.read(file));
					contents.set(file.path, next);
					return next;
				});
				queues.set(file.path, operation);
				return operation;
			},
		},
		metadataCache: {
			getFileCache(file) {
				const match = contents.get(file.path)?.match(/^---\n([\s\S]*?)\n---/);
				return match ? { frontmatter: parseYaml(match[1]) } : null;
			},
		},
		fileManager: {
			async trashFile(file) {
				file.parent.children = file.parent.children.filter((child) => child !== file);
				files.delete(file.path);
				contents.delete(file.path);
			},
		},
	};
	return { app, files, contents };
}
