import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						"eslint.config.*",
						"manifest.json",
					],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: [".json"],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: ["package.json"],
		rules: {
			// The Vault test adapter uses the installed YAML parser; production uses Obsidian's API.
			"depend/ban-dependencies": ["error", { allowed: ["js-yaml"] }],
		},
	},
	{
		files: ["tests/**/*.mjs"],
		rules: {
			"obsidianmd/no-global-this": "off",
			"obsidianmd/no-nodejs-modules": "off",
			"obsidianmd/prefer-window-timers": "off",
		},
	},
	globalIgnores([
		"node_modules",
		"dist",
		".history",
		"esbuild.config.mjs",
		"eslint.config.*",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	]),
);
