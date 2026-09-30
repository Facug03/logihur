// Builders for differential tests against real Logisim 2.7.1.
//
// A harness wraps a circuit as a subcircuit, drives each 1-bit input with a
// clock whose period is 2^(k+1) ticks (so tick t applies input pattern t) and
// stops with a "halt" pin after all patterns. Both Logisim (`-tty table`) and
// our Simulator.runTtyTable then print the same table.

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
import { BUFFER, CONTROLLED_BUFFER, CONTROLLED_INVERTER, NOT_GATE } from "@/components/gates/simple-gates";
import { CLOCK } from "@/components/wiring/clock";
import { CONSTANT } from "@/components/wiring/constant";
import { PULL_RESISTOR } from "@/components/wiring/others";
import { isInputPin, PIN } from "@/components/wiring/pin";
import { TUNNEL } from "@/components/wiring/tunnel";
import type { AnyAttribute } from "@/engine/attributes";
import { Circuit } from "@/engine/circuit";
import { type ComponentFactory, Instance } from "@/engine/component";
import { loc, locX, locY } from "@/engine/geom";
import { Project } from "@/project/project";
import { getPinLabels } from "@/sim/pin-labels";

export function make(
	factory: ComponentFactory,
	x: number,
	y: number,
	values: Record<string, unknown> = {},
): Instance {
	const attrs = factory.createAttributeSet();
	for (const [name, value] of Object.entries(values)) {
		const attr = factory.getAttributes(attrs).find((a: AnyAttribute) => a.name === name);
		if (!attr) throw new Error(`${factory.name} has no attribute ${name}`);
		factory.setAttribute(attrs, attr, value);
	}
	return new Instance(factory, loc(x, y), attrs);
}

/** Wrap `target` in a new main circuit that exercises all input patterns. */
export function addHarness(project: Project, target: Circuit): void {
	const harness = new Circuit("tty_harness");
	project.addCircuit(harness);
	const sub = make(project.getSubcircuitFactory(target), 400, 400);
	harness.addComponent(sub);

	const pins = getPinLabels(target);
	const ports = project.getSubcircuitFactory(target).getPinInstances(sub);
	const inputs = pins.filter((p) => isInputPin(p.pin));
	let k = 0;
	for (const { pin, label } of pins) {
		const index = ports.indexOf(pin);
		const at = sub.ends[index].loc;
		const width = pin.attrs.getByName("width") as number;
		if (isInputPin(pin)) {
			if (width === 1) {
				const d = 2 ** k++;
				harness.addComponent(make(CLOCK, locX(at), locY(at), { highDuration: d, lowDuration: d }));
			} else {
				harness.addComponent(make(CONSTANT, locX(at), locY(at), { width, value: 0 }));
			}
		}
		// echo every port so each tick prints a distinguishable row
		harness.addComponent(
			make(PIN, locX(at), locY(at), { facing: "west", output: true, width, label: `p_${label}` }),
		);
	}
	const n = inputs.filter((p) => (p.pin.attrs.getByName("width") as number) === 1).length;
	harness.addComponent(make(CLOCK, 100, 900, { highDuration: 1, lowDuration: 2 ** n }));
	harness.addComponent(make(PIN, 100, 900, { facing: "west", output: true, label: "halt" }));
	project.mainCircuit = harness;
}

/** Small seeded PRNG (mulberry32) so generated cases are reproducible. */
export function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const MULTI_GATES = [
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
 * A random combinational (or, with `feedback`, possibly sequential) circuit.
 * Nets are connected through tunnels placed right on the ports, so no wire
 * routing is needed.
 */
export function randomCircuit(seed: number, opts: { feedback?: boolean } = {}): Project {
	const r = rng(seed);
	const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
	const project = new Project();
	const c = new Circuit("main");
	project.addCircuit(c);
	project.mainCircuit = c;

	const nets: string[] = [];
	const tunnel = (x: number, y: number, label: string) =>
		c.addComponent(make(TUNNEL, x, y, { facing: "west", label }));

	const nInputs = 2 + Math.floor(r() * 3);
	for (let i = 0; i < nInputs; i++) {
		const label = `in${i}`;
		c.addComponent(make(PIN, 60, 60 + 40 * i, { tristate: false, label }));
		tunnel(60, 60 + 40 * i, label);
		nets.push(label);
	}

	const nGates = 4 + Math.floor(r() * 10);
	for (let g = 0; g < nGates; g++) {
		const x = 300 + 180 * (g % 4);
		const y = 100 + 160 * Math.floor(g / 4);
		const kind = r();
		let inst: Instance;
		if (kind < 0.12) inst = make(NOT_GATE, x, y, { size: pick(["20", "30"]) });
		else if (kind < 0.18) inst = make(BUFFER, x, y);
		else if (kind < 0.24) inst = make(pick([CONTROLLED_BUFFER, CONTROLLED_INVERTER]), x, y);
		else {
			const f = pick(MULTI_GATES);
			const inputs = 2 + Math.floor(r() * 4);
			const values: Record<string, unknown> = {
				inputs,
				size: pick(["30", "50", "70"]),
			};
			if (f === XOR_GATE || f === XNOR_GATE) values.xor = pick(["1", "odd"]);
			if (r() < 0.2) values.out = pick(["0Z", "Z1"]);
			for (let i = 0; i < inputs; i++) if (r() < 0.25) values[`negate${i}`] = true;
			inst = make(f, x, y, values);
		}
		c.addComponent(inst);
		const out = `n${g}`;
		for (let i = 1; i < inst.ends.length; i++) {
			const src = opts.feedback && r() < 0.15 ? `n${Math.floor(r() * nGates)}` : pick(nets);
			const e = inst.ends[i].loc;
			tunnel(locX(e), locY(e), src);
		}
		tunnel(inst.x, inst.y, out);
		nets.push(out);
	}

	// occasionally a pull resistor on a net that may float
	if (r() < 0.3) {
		const t = make(TUNNEL, 1200, 60, { facing: "west", label: pick(nets.slice(nInputs)) });
		c.addComponent(t);
		c.addComponent(make(PULL_RESISTOR, 1200, 60, { pull: pick(["0", "1", "X"]) }));
	}

	const nOutputs = 1 + Math.floor(r() * 3);
	for (let o = 0; o < nOutputs; o++) {
		const y = 60 + 40 * o;
		const label = `out${o}`;
		c.addComponent(make(PIN, 1100, y, { facing: "west", output: true, label }));
		tunnel(1100, y, nets[nets.length - 1 - o]);
	}
	return project;
}
