// The built-in libraries, in the same order and with the same tool names as
// Logisim 2.7.1 (so .circ files refer to them identically).

import type { ComponentFactory } from "@/engine/component";
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
} from "./arith/arith";
import { TEXT } from "./base/text";
import {
	AND_GATE,
	EVEN_PARITY_GATE,
	NAND_GATE,
	NOR_GATE,
	ODD_PARITY_GATE,
	OR_GATE,
	XNOR_GATE,
	XOR_GATE,
} from "./gates/gates";
import { BUFFER, CONTROLLED_BUFFER, CONTROLLED_INVERTER, NOT_GATE } from "./gates/simple-gates";
import { D_FLIP_FLOP, JK_FLIP_FLOP, SR_FLIP_FLOP, T_FLIP_FLOP } from "./memory/flipflops";
import { RAM, ROM } from "./memory/mem";
import { COUNTER, RANDOM, REGISTER, SHIFT_REGISTER } from "./memory/registers";
import { BIT_SELECTOR, DECODER, DEMULTIPLEXER, MULTIPLEXER, PRIORITY_ENCODER } from "./plexers/plexers";
import { CLOCK } from "./wiring/clock";
import { CONSTANT } from "./wiring/constant";
import { BIT_EXTENDER, GROUND, POWER, PULL_RESISTOR, TRANSISTOR, TRANSMISSION_GATE } from "./wiring/others";
import { PIN, PROBE } from "./wiring/pin";
import { SPLITTER } from "./wiring/splitter";
import { TUNNEL } from "./wiring/tunnel";

export interface Library {
	/** Descriptor used in .circ files, e.g. "#Gates". */
	readonly desc: string;
	/** i18n key of the library name. */
	readonly displayKey: string;
	readonly factories: readonly ComponentFactory[];
	/** Names of non-component tools (Base library). */
	readonly tools: readonly string[];
}

export const LIBRARIES: readonly Library[] = [
	{
		desc: "#Wiring",
		displayKey: "lib.wiring",
		factories: [
			SPLITTER,
			PIN,
			PROBE,
			TUNNEL,
			PULL_RESISTOR,
			CLOCK,
			CONSTANT,
			POWER,
			GROUND,
			TRANSISTOR,
			TRANSMISSION_GATE,
			BIT_EXTENDER,
		],
		tools: [],
	},
	{
		desc: "#Gates",
		displayKey: "lib.gates",
		factories: [
			NOT_GATE,
			BUFFER,
			AND_GATE,
			OR_GATE,
			NAND_GATE,
			NOR_GATE,
			XOR_GATE,
			XNOR_GATE,
			ODD_PARITY_GATE,
			EVEN_PARITY_GATE,
			CONTROLLED_BUFFER,
			CONTROLLED_INVERTER,
		],
		tools: [],
	},
	{
		desc: "#Plexers",
		displayKey: "lib.plexers",
		factories: [MULTIPLEXER, DEMULTIPLEXER, DECODER, PRIORITY_ENCODER, BIT_SELECTOR],
		tools: [],
	},
	{
		desc: "#Arithmetic",
		displayKey: "lib.arithmetic",
		factories: [ADDER, SUBTRACTOR, MULTIPLIER, DIVIDER, NEGATOR, COMPARATOR, SHIFTER, BIT_ADDER, BIT_FINDER],
		tools: [],
	},
	{
		desc: "#Memory",
		displayKey: "lib.memory",
		factories: [
			D_FLIP_FLOP,
			T_FLIP_FLOP,
			JK_FLIP_FLOP,
			SR_FLIP_FLOP,
			REGISTER,
			COUNTER,
			SHIFT_REGISTER,
			RANDOM,
			RAM,
			ROM,
		],
		tools: [],
	},
	{ desc: "#I/O", displayKey: "lib.io", factories: [], tools: [] },
	{
		desc: "#Base",
		displayKey: "lib.base",
		factories: [TEXT],
		tools: ["Poke Tool", "Edit Tool", "Select Tool", "Wiring Tool", "Text Tool", "Menu Tool"],
	},
];

export function findLibrary(desc: string): Library | undefined {
	return LIBRARIES.find((l) => l.desc === desc);
}

export function findFactory(desc: string, name: string): ComponentFactory | undefined {
	return findLibrary(desc)?.factories.find((f) => f.name === name);
}
