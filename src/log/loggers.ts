// The Loggable feature of Logisim's components (InstanceLogger subclasses):
// which components can be logged, under what name, and their value.

import { BUTTON } from "@/components/io/controls";
import { LED } from "@/components/io/displays";
import { D_FLIP_FLOP, JK_FLIP_FLOP, SR_FLIP_FLOP, T_FLIP_FLOP } from "@/components/memory/flipflops";
import { MEM_ADDR, RAM } from "@/components/memory/mem";
import type { MemContents } from "@/components/memory/mem-contents";
import { COUNTER, RANDOM, REGISTER, SHIFT_LENGTH, SHIFT_REGISTER } from "@/components/memory/registers";
import { LABEL, WIDTH } from "@/components/std-attrs";
import { CLOCK } from "@/components/wiring/clock";
import { isInputPin, PIN, PROBE } from "@/components/wiring/pin";
import type { ComponentFactory, InstanceState } from "@/engine/component";
import { formatLoc } from "@/engine/geom";
import { Value } from "@/engine/value";

export interface InstanceLogger {
	/** Several values per component (RAM words, shift register stages), or null for one. */
	getLogOptions?(state: InstanceState): number[] | null;
	getLogName(state: InstanceState, option: number | null): string | null;
	getLogValue(state: InstanceState, option: number | null): Value;
}

const label = (state: InstanceState): string | null => {
	const ret = state.getAttr(LABEL);
	return ret ? ret : null;
};
const data = <T>(state: InstanceState) => state.getData<T>();
const at = (state: InstanceState) => formatLoc(state.instance.loc);

/** Logger of components keeping a single number of WIDTH bits (RegisterLogger, Random). */
const numberLogger: InstanceLogger = {
	getLogName: label,
	getLogValue: (state) => Value.createKnown(state.getAttr(WIDTH), data<{ value: number }>(state)?.value ?? 0),
};

const flipFlopLogger: InstanceLogger = {
	getLogName: label,
	getLogValue: (state) => data<{ curValue: Value }>(state)?.curValue ?? Value.FALSE,
};

export const LOGGERS = new Map<ComponentFactory, InstanceLogger>([
	[
		PIN,
		{
			getLogName: (state) =>
				label(state) ?? `${isInputPin(state.instance) ? "Entrada" : "Salida"}${at(state)}`,
			getLogValue: (state) => PIN.getValue(state),
		},
	],
	[
		PROBE,
		{ getLogName: label, getLogValue: (state) => data<{ curValue: Value }>(state)?.curValue ?? Value.NIL },
	],
	[
		CLOCK,
		{
			getLogName: (state) => state.getAttr(LABEL),
			getLogValue: (state) => data<{ sending: Value }>(state)?.sending ?? Value.FALSE,
		},
	],
	[
		BUTTON,
		{
			getLogName: (state) => state.getAttr(LABEL),
			getLogValue: (state) => data<Value>(state) ?? Value.FALSE,
		},
	],
	[
		LED,
		{
			getLogName: (state) => state.getAttr(LABEL),
			getLogValue: (state) => (data<Value>(state) === Value.TRUE ? Value.TRUE : Value.FALSE),
		},
	],
	[D_FLIP_FLOP, flipFlopLogger],
	[T_FLIP_FLOP, flipFlopLogger],
	[JK_FLIP_FLOP, flipFlopLogger],
	[SR_FLIP_FLOP, flipFlopLogger],
	[REGISTER, numberLogger],
	[COUNTER, numberLogger],
	[RANDOM, numberLogger],
	[
		SHIFT_REGISTER,
		{
			getLogOptions: (state) => Array.from({ length: state.getAttr(SHIFT_LENGTH) }, (_, i) => i),
			getLogName: (state, option) => {
				const name = label(state) ?? `Registro de desplazamiento${at(state)}`;
				return option === null ? name : `${name}[${option}]`;
			},
			getLogValue: (state, option) => {
				const d = data<{ get(i: number): Value }>(state);
				return d ? d.get(option ?? 0) : Value.createKnown(state.getAttr(WIDTH), 0);
			},
		},
	],
	[
		RAM,
		{
			// RAM words; Ram.logOptions caps them at 2^8
			getLogOptions: (state) => {
				const bits = Math.min(state.getAttr(MEM_ADDR), 8);
				return Array.from({ length: 1 << bits }, (_, i) => i);
			},
			getLogName: (state, option) => (option === null ? null : `RAM${at(state)}[${option}]`),
			getLogValue: (state, option) => {
				const s = data<{ contents: MemContents }>(state);
				if (option === null || !s) return Value.NIL;
				return Value.createKnown(s.contents.dataWidth, s.contents.get(option));
			},
		},
	],
]);

/** Value.toDisplayString(radix), with Logisim's texts for errors in decimal. */
export function formatLogValue(v: Value, radix: number): string {
	if (radix === 10 && v.width > 0) {
		if (v.isErrorValue()) return "Error";
		if (!v.isFullyDefined()) return "???";
	}
	return v.toDisplayString(radix);
}
