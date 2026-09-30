// Record internal display state and interactive I/O output from real Logisim.
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { findFactory } from "@/components/libraries";
import { make } from "../tests/golden/harness";
import { IO_TRACES } from "../tests/golden/io-cases";

const root = path.resolve(import.meta.dirname, "..");
const java =
	process.env.JAVA ??
	(existsSync("/opt/homebrew/opt/openjdk/bin/java") ? "/opt/homebrew/opt/openjdk/bin/java" : "java");
const jar = process.argv[2] ?? process.env.LOGISIM_JAR ?? path.join(root, ".cache/logisim-generic-2.7.1.jar");
const lines: string[] = [];
for (const trace of IO_TRACES) {
	const factory = findFactory("#I/O", trace.factory);
	if (!factory) throw new Error(trace.factory);
	const instance = make(factory, 0, 0, trace.attrs);
	lines.push(
		[
			"case",
			trace.name,
			trace.javaClass,
			Object.entries(trace.attrs ?? {})
				.map(([k, v]) => `${k}=${v}`)
				.join(";"),
			instance.ends.length,
		].join("\t"),
	);
	for (const step of trace.steps)
		lines.push(
			[
				"step",
				step.tick ?? 0,
				step.ports.map((v, i) => `${instance.ends[i].width}:${v}`).join(","),
				step.extra ?? "",
			].join("\t"),
		);
}
const input = path.join(root, ".cache/io-traces.tsv");
writeFileSync(input, lines.join("\n"));
const output = execFileSync(
	java,
	["-Djava.awt.headless=true", "-cp", jar, path.join(root, "scripts/io-reference.java"), input],
	{ encoding: "utf8", timeout: 60000 },
);
const snapshots = output
	.trim()
	.split("\n")
	.map((s) => JSON.parse(s));
writeFileSync(
	path.join(root, "tests/golden/io-reference.json"),
	execFileSync(
		path.join(root, "node_modules/.bin/biome"),
		["format", "--stdin-file-path", "tests/golden/io-reference.json"],
		{ cwd: root, input: JSON.stringify(snapshots), encoding: "utf8" },
	),
);
console.log(`${IO_TRACES.length} I/O traces, ${snapshots.length} snapshots recorded from Logisim 2.7.1`);
