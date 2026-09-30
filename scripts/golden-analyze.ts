// Record Logisim 2.7.1's combinational analysis (minimization, parser,
// circuit analysis and Build Circuit) for tests/analyze-reference.test.ts.
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { analyzeCases, caseLine, writeAnalyzableCircuits } from "../tests/golden/analyze-cases";

const root = path.resolve(import.meta.dirname, "..");
const java =
	process.env.JAVA ??
	(existsSync("/opt/homebrew/opt/openjdk/bin/java") ? "/opt/homebrew/opt/openjdk/bin/java" : "java");
const jar = process.argv[2] ?? process.env.LOGISIM_JAR ?? path.join(root, ".cache/logisim-generic-2.7.1.jar");
writeAnalyzableCircuits();
const cases = analyzeCases();
const input = path.join(root, ".cache/analyze-cases.tsv");
writeFileSync(input, cases.map(caseLine).join("\n"));
const output = execFileSync(
	java,
	["-Djava.awt.headless=true", "-cp", jar, path.join(root, "scripts/analyze-reference.java"), input],
	{ encoding: "utf8", timeout: 600000, maxBuffer: 1 << 28 },
);
const results = output
	.trim()
	.split("\n")
	.map((s) => JSON.parse(s));
if (results.length !== cases.length)
	throw new Error(`expected ${cases.length} results, got ${results.length}`);
writeFileSync(
	path.join(root, "tests/golden/analyze-reference.json"),
	execFileSync(
		path.join(root, "node_modules/.bin/biome"),
		["format", "--stdin-file-path", "tests/golden/analyze-reference.json"],
		{ cwd: root, input: JSON.stringify(results), encoding: "utf8", maxBuffer: 1 << 28 },
	),
);
console.log(`${cases.length} analysis cases recorded from Logisim 2.7.1`);
