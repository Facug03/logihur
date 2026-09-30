// Generate differential test cases and record real Logisim 2.7.1 output.
//
//   bun scripts/golden.ts [path/to/logisim-generic-2.7.1.jar]
//
// Needs Java. Writes tests/golden/cases/*.circ and tests/golden/expected/*.txt;
// the Vitest suite then checks LogiHUR produces the same tables (no Java needed).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readCirc } from "@/format/circ-reader";
import { writeCirc } from "@/format/circ-writer";
import type { Project } from "@/project/project";
import { COMPONENT_CASES, componentCircuit } from "../tests/golden/components";
import { addHarness, randomCircuit } from "../tests/golden/harness";

const root = path.resolve(import.meta.dirname, "..");
const jar = process.argv[2] ?? process.env.LOGISIM_JAR ?? path.join(root, ".cache/logisim-generic-2.7.1.jar");
const java =
	process.env.JAVA ??
	(existsSync("/opt/homebrew/opt/openjdk/bin/java") ? "/opt/homebrew/opt/openjdk/bin/java" : "java");

if (!existsSync(jar)) {
	console.error(`Logisim jar not found at ${jar}`);
	console.error("Download it from https://sourceforge.net/projects/circuit/files/2.7.x/2.7.1/");
	process.exit(1);
}

const casesDir = path.join(root, "tests/golden/cases");
const expectedDir = path.join(root, "tests/golden/expected");
rmSync(casesDir, { recursive: true, force: true });
rmSync(expectedDir, { recursive: true, force: true });
mkdirSync(casesDir, { recursive: true });
mkdirSync(expectedDir, { recursive: true });

const cases: [string, Project][] = [];

for (const file of readdirSync(path.join(root, "tests/fixtures"))) {
	if (!file.endsWith(".circ")) continue;
	const project = readCirc(readFileSync(path.join(root, "tests/fixtures", file), "utf8"));
	const target = project.mainCircuit;
	if (!target) continue;
	addHarness(project, target);
	cases.push([`fixture-${file.replace(/\.circ$/, "")}`, project]);
}

for (let seed = 1; seed <= 60; seed++) {
	const project = randomCircuit(seed);
	addHarness(project, project.mainCircuit as NonNullable<Project["mainCircuit"]>);
	cases.push([`random-${String(seed).padStart(3, "0")}`, project]);
}

for (let seed = 1001; seed <= 1020; seed++) {
	const project = randomCircuit(seed, { feedback: true });
	addHarness(project, project.mainCircuit as NonNullable<Project["mainCircuit"]>);
	cases.push([`feedback-${seed}`, project]);
}

for (const c of COMPONENT_CASES) {
	const project = componentCircuit(c);
	addHarness(project, project.mainCircuit as NonNullable<Project["mainCircuit"]>);
	cases.push([`comp-${c.name}`, project]);
}

let failures = 0;
for (const [name, project] of cases) {
	const file = path.join(casesDir, `${name}.circ`);
	writeFileSync(file, writeCirc(project));
	let out: string;
	let code = 0;
	try {
		out = execFileSync(java, ["-Djava.awt.headless=true", "-jar", jar, file, "-tty", "table"], {
			encoding: "utf8",
			timeout: 60_000,
		});
	} catch (e) {
		const err = e as { status?: number; stdout?: string };
		code = err.status ?? -1;
		out = err.stdout ?? "";
		if (code !== 1) {
			failures++;
			console.error(`${name}: logisim exited with ${code}`);
		}
	}
	writeFileSync(path.join(expectedDir, `${name}.txt`), `exit ${code}\n${out}`);
	process.stdout.write(".");
}
console.log(`\n${cases.length} cases recorded${failures ? `, ${failures} failed` : ""}`);
