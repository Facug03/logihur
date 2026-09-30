// Internal I/O state captured from the actual Java factories, including sinks
// that do not expose their displayed state as output pins in -tty table.
import { describe, expect, it } from "vitest";
import type { JoystickData } from "@/components/io/controls";
import type { KeyboardData } from "@/components/io/keyboard";
import type { MatrixData } from "@/components/io/matrix";
import type { TtyData } from "@/components/io/tty";
import { findFactory } from "@/components/libraries";
import type { Attribute } from "@/engine/attributes";
import type { Instance, InstanceState } from "@/engine/component";
import { Value } from "@/engine/value";
import { make } from "./golden/harness";
import { IO_TRACES } from "./golden/io-cases";
import reference from "./golden/io-reference.json";

class TraceState implements InstanceState {
	data: unknown;
	ports: Value[] = [];
	output: (string | null)[];
	tick = 0;
	readonly options = { gateUndefined: "ignore" as const, simLimit: 1000, simRandom: 0 };
	constructor(readonly instance: Instance) {
		this.output = new Array(instance.ends.length).fill(null);
	}
	get attrs() {
		return this.instance.attrs;
	}
	getAttr<T>(a: Attribute<T>): T {
		return this.attrs.get(a);
	}
	getPort(i: number): Value {
		return this.ports[i];
	}
	isPortConnected(): boolean {
		return true;
	}
	setPort(i: number, v: Value): void {
		this.output[i] = v.toString();
	}
	getData<T>(): T | undefined {
		return this.data as T | undefined;
	}
	setData(d: unknown): void {
		this.data = d;
	}
	fireInvalidated(): void {}
	isCircuitRoot(): boolean {
		return true;
	}
	getTickCount(): number {
		return this.tick;
	}
	snapshot() {
		let data: unknown = null;
		switch (this.instance.factory.name) {
			case "LED":
			case "Button":
				data = this.data instanceof Value ? this.data.toString() : null;
				break;
			case "7-Segment Display":
			case "Hex Digit Display":
				data = this.data;
				break;
			case "Keyboard":
				data = (this.data as KeyboardData).buffer.map((c) => c.charCodeAt(0));
				break;
			case "TTY":
				data = (this.data as TtyData).lines;
				break;
			case "DotMatrix": {
				const d = this.data as MatrixData;
				data = Array.from({ length: d.rows * d.columns }, (_, i) =>
					d.get(Math.floor(i / d.columns), i % d.columns, this.tick).toString(),
				);
				break;
			}
		}
		return { out: [...this.output], data };
	}
}

let offset = 0;
describe("I/O matches original Logisim Java factories", () => {
	for (const trace of IO_TRACES) {
		const expected = reference.slice(offset, offset + trace.steps.length);
		offset += trace.steps.length;
		it(trace.name, () => {
			const factory = findFactory("#I/O", trace.factory);
			if (!factory) throw new Error(trace.factory);
			const state = new TraceState(make(factory, 0, 0, trace.attrs));
			const actual = [];
			for (const step of trace.steps) {
				state.tick = step.tick ?? 0;
				state.ports = step.ports.map((v, i) => {
					const width = state.instance.ends[i].width;
					return v === "x"
						? Value.createUnknown(width)
						: v === "e"
							? Value.createError(width)
							: Value.createKnown(width, Number(v));
				});
				if (step.extra?.startsWith("type="))
					for (const code of step.extra.slice(5).split(","))
						factory.createPoker(state.instance)?.keyTyped?.(state, String.fromCharCode(Number(code)));
				else if (step.extra?.startsWith("button="))
					state.data = step.extra.endsWith("1") ? Value.TRUE : Value.FALSE;
				else if (step.extra?.startsWith("joystick=")) {
					const [x, y] = step.extra.slice(9).split(",").map(Number);
					state.data = { x, y } satisfies JoystickData;
				}
				factory.propagate(state);
				actual.push(state.snapshot());
			}
			expect(actual).toEqual(expected);
		});
	}
});
