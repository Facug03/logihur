// Differential cases for individual components (Plexers, Arithmetic,
// Memory): every input bit becomes its own 1-bit pin, joined into buses with
// splitters, so the harness can drive all input patterns.

import {
	ADDER,
	BIT_ADDER,
	BIT_FINDER,
	COMPARATOR,
	DIVIDER,
	MULTIPLIER,
	NEGATOR,
	SHIFTER,
	SUBTRACTOR,
} from "@/components/arith/arith";
import { CONTROLLED_BUFFER, NOT_GATE } from "@/components/gates/simple-gates";
import { D_FLIP_FLOP, JK_FLIP_FLOP, SR_FLIP_FLOP, T_FLIP_FLOP } from "@/components/memory/flipflops";
import { RAM, ROM } from "@/components/memory/mem";
import { MemContents } from "@/components/memory/mem-contents";
import { COUNTER, RANDOM, REGISTER, SHIFT_REGISTER } from "@/components/memory/registers";
import {
	BIT_SELECTOR,
	DECODER,
	DEMULTIPLEXER,
	MULTIPLEXER,
	PRIORITY_ENCODER,
} from "@/components/plexers/plexers";
import { PIN } from "@/components/wiring/pin";
import { SPLITTER } from "@/components/wiring/splitter";
import { TUNNEL } from "@/components/wiring/tunnel";
import { Circuit } from "@/engine/circuit";
import type { ComponentFactory } from "@/engine/component";
import { locX, locY } from "@/engine/geom";
import { Project } from "@/project/project";
import { make } from "./harness";

export interface ComponentCase {
	name: string;
	factory: ComponentFactory;
	attrs?: Record<string, unknown>;
	/** Input port indices left unconnected (floating). */
	floating?: number[];
	/** Port indices treated as outputs even if declared otherwise. */
	outputs?: number[];
}

/** Build a project whose main circuit wires every port of one component. */
export function componentCircuit(c: ComponentCase): Project {
	const project = new Project();
	const circ = new Circuit("main");
	project.addCircuit(circ);
	project.mainCircuit = circ;

	const comp = make(c.factory, 600, 400, c.attrs);
	circ.addComponent(comp);

	let inY = 40;
	let outY = 40;
	let splitY = 40;
	const tunnel = (x: number, y: number, label: string, width: number) =>
		circ.addComponent(make(TUNNEL, x, y, { facing: "west", label, width }));

	comp.ends.forEach((end, i) => {
		const label = `n${i}`;
		const isOutput = end.type === "output" || c.outputs?.includes(i);
		tunnel(locX(end.loc), locY(end.loc), label, end.width);
		if (isOutput) {
			circ.addComponent(
				make(PIN, 1400, outY, { facing: "west", output: true, width: end.width, label: `o${i}` }),
			);
			tunnel(1400, outY, label, end.width);
			outY += 30;
			return;
		}
		if (c.floating?.includes(i)) return;
		if (end.width === 1) {
			circ.addComponent(make(PIN, 100, inY, { facing: "east", label: `i${i}` }));
			tunnel(100, inY, label, 1);
			inY += 30;
			return;
		}
		// a splitter joins 1-bit pins into the port's bus
		const split = make(SPLITTER, 300, splitY, { facing: "east", fanout: end.width, incoming: end.width });
		circ.addComponent(split);
		tunnel(split.x, split.y, label, end.width);
		for (let b = 0; b < end.width; b++) {
			const at = split.ends[b + 1].loc;
			tunnel(locX(at), locY(at), `${label}_${b}`, 1);
			circ.addComponent(make(PIN, 100, inY, { facing: "east", label: `i${i}_${b}` }));
			tunnel(100, inY, `${label}_${b}`, 1);
			inY += 30;
		}
		splitY += 20 * end.width + 40;
	});
	// The combined bus must be released while reading, and driven while writing.
	// OE=0 enables the external buffer, OE=1 enables the RAM's output.
	if (c.factory === RAM && comp.attrs.getByName("bus") !== "separate") {
		const width = comp.ends[0].width;
		const split = make(SPLITTER, 300, splitY, { facing: "east", fanout: width, incoming: width });
		circ.addComponent(split);
		tunnel(split.x, split.y, "write_data", width);
		for (let bit = 0; bit < width; bit++) {
			const at = split.ends[bit + 1].loc;
			tunnel(locX(at), locY(at), `write_${bit}`, 1);
			circ.addComponent(make(PIN, 100, inY, { label: `write_${bit}` }));
			tunnel(100, inY, `write_${bit}`, 1);
			inY += 30;
		}
		const invert = make(NOT_GATE, 900, 600);
		circ.addComponent(invert);
		tunnel(locX(invert.ends[1].loc), locY(invert.ends[1].loc), "n3", 1);
		tunnel(invert.x, invert.y, "write_enable", 1);
		const buffer = make(CONTROLLED_BUFFER, 1000, 700, { width });
		circ.addComponent(buffer);
		tunnel(buffer.x, buffer.y, "n0", width);
		tunnel(locX(buffer.ends[1].loc), locY(buffer.ends[1].loc), "write_data", width);
		tunnel(locX(buffer.ends[2].loc), locY(buffer.ends[2].loc), "write_enable", 1);
	}
	return project;
}

function rom(addr: number, data: number, values: number[]): MemContents {
	const m = MemContents.create(addr, data);
	m.setValues(0, values);
	return m;
}

export const COMPONENT_CASES: ComponentCase[] = [
	// Plexers
	...["east", "west", "north", "south"].flatMap((facing) => [
		...["bl", "tr"].flatMap((selloc) => [
			{ name: `mux-${facing}-${selloc}`, factory: MULTIPLEXER, attrs: { facing, selloc, select: 2 } },
			{
				name: `demux-${facing}-${selloc}`,
				factory: DEMULTIPLEXER,
				attrs: { facing, selloc, select: 2, width: 2 },
			},
			{ name: `decoder-${facing}-${selloc}`, factory: DECODER, attrs: { facing, selloc, select: 2 } },
		]),
		{ name: `priencoder-${facing}`, factory: PRIORITY_ENCODER, attrs: { facing, select: 2 } },
		{ name: `bitselector-${facing}`, factory: BIT_SELECTOR, attrs: { facing, width: 5, group: 2 } },
	]),
	{ name: "mux-s1-w2", factory: MULTIPLEXER, attrs: { width: 2 } },
	{
		name: "mux-s2-tr-north-zero",
		factory: MULTIPLEXER,
		attrs: { select: 2, selloc: "tr", facing: "north", disabled: "0" },
	},
	{ name: "mux-s3-noenable", factory: MULTIPLEXER, attrs: { select: 3, enable: false } },
	{ name: "mux-s1-floatsel", factory: MULTIPLEXER, attrs: { width: 3 }, floating: [2] },
	{ name: "demux-s2-w2-tristate", factory: DEMULTIPLEXER, attrs: { select: 2, width: 2, tristate: true } },
	{ name: "demux-s1-west-zero", factory: DEMULTIPLEXER, attrs: { facing: "west", disabled: "0" } },
	{ name: "decoder-s3-tristate", factory: DECODER, attrs: { select: 3, tristate: true } },
	{
		name: "decoder-s2-south-noenable",
		factory: DECODER,
		attrs: { select: 2, facing: "south", enable: false },
	},
	{ name: "decoder-s1-tr", factory: DECODER, attrs: { selloc: "tr" } },
	{ name: "priencoder-s2", factory: PRIORITY_ENCODER, attrs: { select: 2 } },
	{ name: "priencoder-s3-zero", factory: PRIORITY_ENCODER, attrs: { select: 3, disabled: "0" } },
	{ name: "bitselector-w6-g2", factory: BIT_SELECTOR, attrs: { width: 6, group: 2 } },
	{ name: "bitselector-w5-g1", factory: BIT_SELECTOR, attrs: { width: 5, group: 1 } },
	{ name: "bitselector-w5-g3-float", factory: BIT_SELECTOR, attrs: { width: 5, group: 3 }, floating: [2] },
	// Arithmetic
	{ name: "adder-w4", factory: ADDER, attrs: { width: 4 } },
	{ name: "adder-w3-nocarry", factory: ADDER, attrs: { width: 3 }, floating: [3] },
	{ name: "adder-w3-floatb", factory: ADDER, attrs: { width: 3 }, floating: [1] },
	{ name: "subtractor-w3", factory: SUBTRACTOR, attrs: { width: 3 } },
	{ name: "multiplier-w3", factory: MULTIPLIER, attrs: { width: 3 } },
	{ name: "multiplier-w4-nocarry", factory: MULTIPLIER, attrs: { width: 4 }, floating: [3] },
	{ name: "divider-w3", factory: DIVIDER, attrs: { width: 3 } },
	{ name: "divider-w4-noupper", factory: DIVIDER, attrs: { width: 4 }, floating: [3] },
	{ name: "negator-w5", factory: NEGATOR, attrs: { width: 5 } },
	{ name: "negator-w4-float", factory: NEGATOR, attrs: { width: 4 }, floating: [0] },
	{ name: "comparator-w4-signed", factory: COMPARATOR, attrs: { width: 4 } },
	{ name: "comparator-w4-unsigned", factory: COMPARATOR, attrs: { width: 4, mode: "unsigned" } },
	...["ll", "lr", "ar", "rl", "rr"].map((shift) => ({
		name: `shifter-w4-${shift}`,
		factory: SHIFTER,
		attrs: { width: 4, shift },
	})),
	...["ar", "rr", "rl"].map((shift) => ({
		name: `shifter-w5-${shift}`,
		factory: SHIFTER,
		attrs: { width: 5, shift },
	})),
	{ name: "bitadder-w2-i3", factory: BIT_ADDER, attrs: { width: 2, inputs: 3 } },
	{ name: "bitadder-w1-i5", factory: BIT_ADDER, attrs: { width: 1, inputs: 5 } },
	...["low1", "high1", "low0", "high0"].map((type) => ({
		name: `bitfinder-w6-${type}`,
		factory: BIT_FINDER,
		attrs: { width: 6, type },
	})),
	// Memory
	...["rising", "falling", "high", "low"].map((trigger) => ({
		name: `dff-${trigger}`,
		factory: D_FLIP_FLOP,
		attrs: { trigger },
	})),
	{ name: "tff", factory: T_FLIP_FLOP },
	{ name: "jkff-falling", factory: JK_FLIP_FLOP, attrs: { trigger: "falling" } },
	{ name: "srff-high", factory: SR_FLIP_FLOP, attrs: { trigger: "high" } },
	{ name: "register-w2", factory: REGISTER, attrs: { width: 2 } },
	{ name: "register-w3-low-noen", factory: REGISTER, attrs: { width: 3, trigger: "low" }, floating: [4] },
	...["wrap", "stay", "continue", "load"].map((ongoal) => ({
		name: `counter-w3-max5-${ongoal}`,
		factory: COUNTER,
		attrs: { width: 3, max: 5, ongoal },
	})),
	{ name: "shiftreg-w1-l3", factory: SHIFT_REGISTER, attrs: { length: 3 } },
	{ name: "shiftreg-w2-l2-serial", factory: SHIFT_REGISTER, attrs: { width: 2, length: 2, parallel: false } },
	{ name: "random-seed42", factory: RANDOM, attrs: { seed: 42, width: 12 } },
	{
		name: "ram-a2-d2-separate",
		factory: RAM,
		attrs: { addrWidth: 2, dataWidth: 2, bus: "separate" },
		outputs: [0],
	},
	...["combined", "asynch"].map((bus) => ({
		name: `ram-a2-d2-${bus}`,
		factory: RAM,
		attrs: { addrWidth: 2, dataWidth: 2, bus },
		outputs: [0],
	})),
	{
		name: "rom-a3-d4",
		factory: ROM,
		attrs: { addrWidth: 3, dataWidth: 4, contents: rom(3, 4, [1, 2, 0xf, 0, 0, 7, 7, 7]) },
		outputs: [0],
	},
	{
		name: "rom-a4-d8-runs",
		factory: ROM,
		attrs: { addrWidth: 4, dataWidth: 8, contents: rom(4, 8, [9, 9, 9, 9, 9, 0xab, 0, 0, 0, 0, 0xff]) },
		outputs: [0],
	},
];
