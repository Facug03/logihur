// Combinational analysis cases shared by scripts/golden-analyze.ts (which
// records Logisim 2.7.1's answers) and tests/analyze-reference.test.ts.

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
	AND_GATE,
	EVEN_PARITY_GATE,
	NAND_GATE,
	NOR_GATE,
	ODD_PARITY_GATE,
	OR_GATE,
	XNOR_GATE,
	XOR_GATE,
} from "@/components/gates/gates";
import { BUFFER, NOT_GATE } from "@/components/gates/simple-gates";
import { CONSTANT } from "@/components/wiring/constant";
import { PIN } from "@/components/wiring/pin";
import { Transaction } from "@/editor/history";
import { repairWires } from "@/editor/wires";
import { Circuit } from "@/engine/circuit";
import type { Instance } from "@/engine/component";
import { loc, locX, locY } from "@/engine/geom";
import { Wire } from "@/engine/wire";
import { writeCirc } from "@/format/circ-writer";
import { Project } from "@/project/project";
import { make, rng } from "./harness";

export type AnalyzeCase =
	| { kind: "min"; inputs: string[]; column: string }
	| { kind: "parse"; inputs: string[]; text: string }
	| { kind: "circ"; file: string; circuit: string }
	| {
			kind: "build";
			inputs: string[];
			outputs: string[];
			exprs: string[];
			twoInputs: boolean;
			nands: boolean;
	  };

const root = path.resolve(__dirname, "../..");
const VARS = ["a", "b", "c", "d", "e", "f", "g", "h"];

function minCases(): AnalyzeCase[] {
	const cases: AnalyzeCase[] = [];
	const random = rng(4242);
	for (let n = 0; n <= 6; n++) {
		const inputs = VARS.slice(0, n);
		const rows = 1 << n;
		cases.push({ kind: "min", inputs, column: "x".repeat(rows) });
		cases.push({ kind: "min", inputs, column: "0".repeat(rows) });
		cases.push({ kind: "min", inputs, column: "1".repeat(rows) });
		const count = n <= 1 ? 4 : n <= 4 ? 40 : 15;
		for (let k = 0; k < count; k++) {
			// vary the share of don't-cares so both covers get exercised
			const dontCare = [0, 0.1, 0.3][k % 3];
			let column = "";
			for (let r = 0; r < rows; r++) {
				const p = random();
				column += p < dontCare ? "x" : random() < 0.5 ? "0" : "1";
			}
			cases.push({ kind: "min", inputs, column });
		}
	}
	return cases;
}

const PARSE_TEXTS = [
	"a b + c",
	"a & b | c",
	"a && b || ~c",
	"a ^ b ^ c",
	"!a + b'",
	"(a + b)' c",
	"a (b + c)",
	"~(a ^ b) + a b c",
	"a b' c'' + 1",
	"0",
	"a AND b OR NOT c",
	"a xor b",
	"not not a",
	"a + (b c",
	"a + b)",
	"a +",
	"+ a",
	"a ++ b",
	"a # b",
	"z + a",
	"'a",
	"a b ~",
	"~",
	"()",
	"a (",
	"a 2 b",
	"   ",
	"a~b",
	"a(b)(c)'",
];

function parseCases(): AnalyzeCase[] {
	return PARSE_TEXTS.map((text) => ({ kind: "parse", inputs: ["a", "b", "c"], text }));
}

const ANALYZABLE_GATES = [
	AND_GATE,
	OR_GATE,
	NAND_GATE,
	NOR_GATE,
	XOR_GATE,
	XNOR_GATE,
	ODD_PARITY_GATE,
	EVEN_PARITY_GATE,
];

/**
 * A random circuit made only of components with expressions, connected with
 * real wires (tunnels would make Logisim fall back to the truth table).
 * Every net is a vertical rail on the left; each gate sits in its own row,
 * its inputs run left to their rails and its output returns through a
 * private channel below the gates. `mode` adds feedback loops, nets with two
 * drivers, or unconnected gate inputs.
 */
export function analyzableCircuit(seed: number, mode: "plain" | "feedback" | "conflict" | "open"): Project {
	const r = rng(seed);
	const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
	const project = new Project();
	const c = new Circuit("main");
	project.addCircuit(c);
	project.mainCircuit = c;

	const nInputs = 1 + Math.floor(r() * 4);
	const nGates = 2 + Math.floor(r() * 8);
	const nOutputs = 1 + Math.floor(r() * 3);
	const nNets = nInputs + nGates + 1; // the last net is a constant
	const railX = (net: number) => 100 + 10 * net;
	const gateX = railX(nNets) + 200;
	const wires: [number, number, number, number][] = [];

	// pins and the constant
	let y = 40;
	for (let i = 0; i < nInputs; i++, y += 20) {
		c.addComponent(make(PIN, 40, y, { tristate: false, label: `in${i}` }));
		wires.push([40, y, railX(i), y]);
	}
	const constNet = nNets - 1;
	c.addComponent(make(CONSTANT, 60, y, { value: r() < 0.5 ? 0 : 1 }));
	wires.push([60, y, railX(constNet), y]);
	y += 20;
	const outputsY = y;
	y += 20 * nOutputs + 40;

	// gates, one per row
	const gates: Instance[] = [];
	for (let g = 0; g < nGates; g++) {
		const kind = r();
		let inst: Instance;
		if (kind < 0.15) inst = make(NOT_GATE, gateX, 0, { size: pick(["20", "30"]) });
		else if (kind < 0.2) inst = make(BUFFER, gateX, 0);
		else {
			const f = pick(ANALYZABLE_GATES);
			const inputs = 2 + Math.floor(r() * (f === XOR_GATE || f === XNOR_GATE ? 2 : 4));
			const values: Record<string, unknown> = { inputs, size: pick(["30", "50", "70"]) };
			for (let i = 0; i < inputs; i++) if (r() < 0.2) values[`negate${i}`] = true;
			inst = make(f, gateX, 0, values);
		}
		const b = inst.factory.getOffsetBounds(inst.attrs, inst);
		const gy = Math.ceil((y - b.y) / 10) * 10;
		inst.moveTo(loc(gateX, gy));
		gates.push(inst);
		c.addComponent(inst);
		y = gy + b.y + b.height + 30;
	}
	const bottom = Math.ceil(y / 10) * 10;

	gates.forEach((inst, g) => {
		const net = nInputs + g;
		for (let i = 1; i < inst.ends.length; i++) {
			if (mode === "open" && r() < 0.25) continue;
			const src =
				mode === "feedback" && r() < 0.2
					? nInputs + Math.floor(r() * nGates)
					: pick([...Array.from({ length: net }, (_, k) => k), constNet]);
			const e = inst.ends[i].loc;
			wires.push([locX(e), locY(e), railX(src), locY(e)]);
		}
		// output: right to a private jog, down to a private channel, left to the rail
		const jogX = gateX + 10 + 10 * g;
		const channelY = bottom + 10 * g;
		const target = mode === "conflict" && g > 0 && r() < 0.3 ? nInputs + Math.floor(r() * g) : net;
		wires.push(
			[gateX, inst.y, jogX, inst.y],
			[jogX, inst.y, jogX, channelY],
			[jogX, channelY, railX(target), channelY],
		);
	});

	for (let o = 0; o < nOutputs; o++) {
		const oy = outputsY + 20 * o;
		c.addComponent(make(PIN, 30, oy, { facing: "east", output: true, label: `out${o}` }));
		const net = nInputs + nGates - 1 - Math.floor(r() * Math.min(nGates, 3));
		wires.push([30, oy, railX(net), oy]);
	}
	for (let net = 0; net < nNets; net++) wires.push([railX(net), 20, railX(net), bottom + 10 * nGates]);

	const tx = new Transaction("build");
	for (const [x0, y0, x1, y1] of wires) tx.addWire(c, Wire.create(loc(x0, y0), loc(x1, y1)));
	repairWires(tx, c);
	return project;
}

export const ANALYZABLE_SEEDS = {
	plain: 40,
	feedback: 12,
	conflict: 12,
	open: 12,
} as const;

/** Writes the generated circuits to tests/golden/analyze/. */
export function writeAnalyzableCircuits(): void {
	const dir = path.join(root, "tests/golden/analyze");
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	for (const [mode, count] of Object.entries(ANALYZABLE_SEEDS)) {
		for (let seed = 1; seed <= count; seed++) {
			const project = analyzableCircuit(seed, mode as keyof typeof ANALYZABLE_SEEDS);
			writeFileSync(path.join(dir, `${mode}-${String(seed).padStart(3, "0")}.circ`), writeCirc(project));
		}
	}
}

function circCases(): AnalyzeCase[] {
	const cases: AnalyzeCase[] = [];
	const files = [
		...readdirSync(path.join(root, "tests/fixtures")).map((f) => `tests/fixtures/${f}`),
		...readdirSync(path.join(root, "tests/golden/cases")).map((f) => `tests/golden/cases/${f}`),
		...readdirSync(path.join(root, "tests/golden/analyze")).map((f) => `tests/golden/analyze/${f}`),
	].filter((f) => f.endsWith(".circ"));
	for (const file of files.sort()) {
		const text = readFileSync(path.join(root, file), "utf8");
		for (const m of text.matchAll(/<circuit name="([^"]*)">/g)) {
			if (m[1] !== "tty_harness") cases.push({ kind: "circ", file, circuit: m[1] });
		}
	}
	return cases;
}

const BUILD_EXPRS: [string[], string[], string[]][] = [
	[["a", "b"], ["x"], ["a b"]],
	[
		["a", "b"],
		["x", "y"],
		["a ^ b", "a b"],
	],
	[
		["a", "b", "c"],
		["s", "co"],
		["a ^ b ^ c", "a b + a c + b c"],
	],
	[["a", "b", "c"], ["x"], ["~a b + a ~b c + ~c"]],
	[["a", "b", "c", "d"], ["x"], ["a b c d + ~a ~b ~c ~d + a ~c"]],
	[["a", "b", "c"], ["x"], ["~(a + b) c"]],
	[
		["a", "b", "c"],
		["x", "y", "z"],
		["1", "0", "a"],
	],
	[["a"], ["x"], ["~a"]],
	[["a", "b", "c", "d", "e"], ["x"], ["a b c d e + ~a ~b + c ~d e"]],
	[
		["a", "b"],
		["x", "y"],
		["", "a + b"],
	],
	[["a", "b", "c", "d"], ["x"], ["(a + b)(c + d)(~a + ~d)"]],
	[["a", "b", "c"], ["x"], ["~(a ^ b) ~c"]],
	[["a", "b", "c", "d", "e", "f"], ["x"], ["a + b + c + d + e + f"]],
];

function buildCases(): AnalyzeCase[] {
	const cases: AnalyzeCase[] = [];
	for (const [inputs, outputs, exprs] of BUILD_EXPRS) {
		const hasXor = exprs.some((e) => e.includes("^"));
		for (const twoInputs of [false, true]) {
			for (const nands of hasXor ? [false] : [false, true]) {
				cases.push({ kind: "build", inputs, outputs, exprs, twoInputs, nands });
			}
		}
	}
	return cases;
}

export function analyzeCases(): AnalyzeCase[] {
	return [...minCases(), ...parseCases(), ...circCases(), ...buildCases()];
}

export function caseLine(c: AnalyzeCase): string {
	switch (c.kind) {
		case "min":
			return ["min", c.inputs.join(","), c.column].join("\t");
		case "parse":
			return ["parse", c.inputs.join(","), c.text].join("\t");
		case "circ":
			return ["circ", path.join(root, c.file), c.circuit].join("\t");
		case "build":
			return [
				"build",
				c.inputs.join(","),
				c.outputs.join(","),
				c.exprs.join(";"),
				c.twoInputs ? "1" : "0",
				c.nands ? "1" : "0",
			].join("\t");
	}
}
