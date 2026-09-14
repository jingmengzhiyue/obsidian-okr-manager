import test from "node:test";
import assert from "node:assert/strict";

const parserModule = await import("../src/manager/FileParser.ts");
const { FileParser } = parserModule.default ?? parserModule;
const parser = new FileParser({});
const file = { path: "OKR/2026-Q2/O1.md" };
const frontmatter = () => ({
	"okr-id": "O1", "okr-period": "2026-Q2", "okr-period-type": "quarter",
	"key-results": [{ "okr-id": "O1-KR1", current: 4, target: 10, progress: 40 }],
});
const block = (bullet = "-") => [
	"<!-- OKR-CHECKINS-START -->", "### O1-KR1 Progress",
	`${bullet} **2026-05-01** 40% (+40) \`check-1\``,
	`  ${bullet} note: saved note`, "<!-- OKR-CHECKINS-END -->",
].join("\n");

test("parser preserves custom Objective and KR fields when rebuilding frontmatter", () => {
	const fm = { ...frontmatter(), tags: ["custom"], aliases: ["Goal"], project: "Project" };
	fm["key-results"][0].evidence = "[[Evidence]]";
	const objective = parser.parseObjective(file, fm);
	const rebuilt = parser.buildObjectiveFrontmatter(objective, fm);
	assert.deepEqual(rebuilt.tags, ["custom"]);
	assert.deepEqual(rebuilt.aliases, ["Goal"]);
	assert.equal(rebuilt.project, "Project");
	assert.equal(rebuilt["key-results"][0].evidence, "[[Evidence]]");
});

test("parser rejects malformed KR collections and explicit invalid numbers", () => {
	for (const value of [{}, null, "invalid"]) {
		assert.throws(() => parser.parseObjective(file, { ...frontmatter(), "key-results": value }), /key-results/i);
	}
	for (const field of ["current", "target", "progress"]) {
		const fm = frontmatter();
		fm["key-results"][0][field] = "invalid";
		assert.throws(() => parser.parseObjective(file, fm), /Invalid/);
	}
});

test("Markdown list markers round trip check-ins", () => {
	for (const bullet of ["-", "*", "+"]) {
		const objective = parser.parseObjective(file, frontmatter(), block(bullet));
		assert.equal(objective.keyResults[0].checkIns.length, 1);
		assert.equal(objective.keyResults[0].checkIns[0].note, "saved note");
		const written = parser.syncCheckInsMarkdown(block(bullet), objective);
		assert.equal(parser.parseObjective(file, frontmatter(), written).keyResults[0].checkIns[0].note, "saved note");
	}
});

test("unknown or broken managed content cannot be silently overwritten", () => {
	const objective = parser.parseObjective(file, frontmatter());
	for (const text of [
		block().replace("40%", "broken"),
		block().replace("<!-- OKR-CHECKINS-END -->", ""),
		block().replace("### O1-KR1 Progress", "<!-- OKR-CHECKINS-START -->"),
		block().replace("  - note:", "  - unknown:"),
		block().replace("### O1-KR1 Progress", "### O1-KR2 Progress"),
	]) {
		assert.throws(() => parser.parseObjective(file, frontmatter(), text));
	}
	assert.throws(() => parser.syncCheckInsMarkdown(block().replace("40%", "broken"), objective));
});

test("identical duplicate regions merge but conflicting histories are rejected", () => {
	assert.equal(parser.parseObjective(file, frontmatter(), `${block()}\n${block()}`).keyResults[0].checkIns.length, 1);
	assert.throws(() => parser.parseObjective(file, frontmatter(), `${block()}\n${block().replace("saved note", "different note")}`), /Conflicting duplicate/);
});

test("legacy frontmatter history migrates without losing extension fields", () => {
	const fm = frontmatter();
	fm["key-results"][0].checkIns = [{ id: "old", date: "2026-04-01", progress: 20, delta: 20, note: "legacy", blocker: "" }];
	fm["key-results"][0].evidence = "source";
	const objective = parser.parseObjective(file, fm);
	const updated = parser.buildObjectiveFrontmatter(objective, fm);
	assert.equal(updated["key-results"][0].checkIns, undefined);
	assert.equal(updated["key-results"][0].evidence, "source");
	assert.equal(fm["key-results"][0].checkIns.length, 1);
	const reread = parser.parseObjective(file, updated, parser.syncCheckInsMarkdown("", objective));
	assert.equal(reread.keyResults[0].checkIns[0].note, "legacy");
	assert.equal(parser.parseObjective(file, { ...frontmatter(), "key-results": undefined }).keyResults.length, 0);
});
