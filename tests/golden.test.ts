// Differential tests: tables recorded from real Logisim 2.7.1 (see
// scripts/golden.ts) must match LogiHUR's simulation exactly.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readCirc } from "@/format/circ-reader";
import { Simulator } from "@/sim/simulator";

const casesDir = path.join(import.meta.dirname, "golden/cases");
const expectedDir = path.join(import.meta.dirname, "golden/expected");
const cases = existsSync(casesDir) ? readdirSync(casesDir).filter((f) => f.endsWith(".circ")) : [];

describe.skipIf(cases.length === 0)("matches Logisim 2.7.1 (-tty table)", () => {
	for (const file of cases) {
		const name = file.replace(/\.circ$/, "");
		it(name, () => {
			const expectedRaw = readFileSync(path.join(expectedDir, `${name}.txt`), "utf8").split("\n");
			const code = Number.parseInt(expectedRaw[0].replace("exit ", ""), 10);
			let lines = expectedRaw.slice(1).filter((l, i, a) => !(l === "" && i === a.length - 1));
			// on oscillation Logisim appends a message after the table
			if (code === 1) lines = lines.slice(0, -1);

			const project = readCirc(readFileSync(path.join(casesDir, file), "utf8"));
			expect(project.messages).toEqual([]);
			const sim = new Simulator(project, project.mainCircuit as NonNullable<typeof project.mainCircuit>);
			const result = sim.runTtyTable(5000);
			expect(result.code).toBe(code);
			expect(result.lines).toEqual(lines);
			if (/^comp-ram-a2-d2-(combined|asynch)$/.test(name)) {
				// A driven write bus alone is insufficient coverage: observe stored data
				// while OE=1 has released the external buffer and RAM is driving the bus.
				const outputs = sim.pins().filter((p) => !p.input);
				const oe = outputs.findIndex((p) => p.label === "p_i3");
				const data = outputs.findIndex((p) => p.label === "p_o0");
				expect(oe).toBeGreaterThanOrEqual(0);
				expect(data).toBeGreaterThanOrEqual(0);
				expect(
					lines.some((line) => {
						const values = line.split("\t");
						return values[oe] === "1" && /^(01|10|11)$/.test(values[data]);
					}),
				).toBe(true);
			}
		});
	}
});
