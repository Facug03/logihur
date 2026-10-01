// Record Logisim 2.7.1's -tty table for a project that loads nested
// `file#` libraries (tests/golden/libraries.ts) into tests/golden/libs/.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readCirc } from "@/format/circ-reader";
import { writeCirc } from "@/format/circ-writer";
import { renderMessage } from "@/i18n/i18n";
import { addHarness } from "../tests/golden/harness";
import { libraryFiles } from "../tests/golden/libraries";

const root = path.resolve(import.meta.dirname, "..");
const java =
	process.env.JAVA ??
	(existsSync("/opt/homebrew/opt/openjdk/bin/java") ? "/opt/homebrew/opt/openjdk/bin/java" : "java");
const jar = process.argv[2] ?? process.env.LOGISIM_JAR ?? path.join(root, ".cache/logisim-generic-2.7.1.jar");
const dir = path.join(root, "tests/golden/libs");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const files = libraryFiles();
const sources = new Map(Object.entries(files));
const main = readCirc(files["principal.circ"], sources);
if (main.missingLibraries.length > 0 || main.messages.length > 0)
	throw new Error(main.messages.map(renderMessage).join("\n"));
addHarness(main, main.circuits[0]);
writeFileSync(path.join(dir, "base.circ"), files["base.circ"]);
writeFileSync(path.join(dir, "compuertas.circ"), files["compuertas.circ"]);
const file = path.join(dir, "principal.circ");
writeFileSync(file, writeCirc(main));
const out = execFileSync(java, ["-Djava.awt.headless=true", "-jar", jar, file, "-tty", "table"], {
	encoding: "utf8",
	timeout: 60_000,
});
writeFileSync(path.join(dir, "expected.txt"), out);
console.log(`${out.trim().split("\n").length} rows recorded from Logisim 2.7.1`);
