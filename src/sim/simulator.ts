// A simulation of one circuit: root CircuitState plus convenience methods
// used by the UI, the tests and the command-line runner.

import { isInputPin, PIN } from "@/components/wiring/pin";
import type { Circuit } from "@/engine/circuit";
import type { Instance } from "@/engine/component";
import { CircuitState, InstanceStateImpl, type SimContext } from "@/engine/simulation";
import { Value } from "@/engine/value";
import type { Project } from "@/project/project";
import { getPinLabels } from "./pin-labels";

export class Simulator {
	readonly root: CircuitState;
	/** SimulatorListener.propagationCompleted (used by the log). */
	readonly propagationListeners = new Set<() => void>();

	constructor(
		readonly project: Project,
		readonly circuit: Circuit,
	) {
		const context: SimContext = { options: project.options };
		this.root = CircuitState.createRoot(context, circuit);
		this.propagate();
	}

	dispose(): void {
		this.root.dispose();
	}

	get propagator() {
		return this.root.getPropagator();
	}

	propagate(): void {
		this.propagator.propagate();
		for (const l of Array.from(this.propagationListeners)) l();
	}

	isOscillating(): boolean {
		return this.propagator.isOscillating();
	}

	reset(): void {
		this.propagator.reset();
		this.propagate();
	}

	/** One clock tick followed by propagation. Returns whether a clock changed. */
	tick(): boolean {
		const changed = this.propagator.tick();
		this.propagate();
		return changed;
	}

	pins(): { pin: Instance; label: string; input: boolean }[] {
		return getPinLabels(this.circuit).map((p) => ({ ...p, input: isInputPin(p.pin) }));
	}

	findPin(label: string): Instance {
		const p = this.pins().find((x) => x.label === label || x.pin.attrs.getByName("label") === label);
		if (!p) throw new Error(`no pin labelled '${label}'`);
		return p.pin;
	}

	/** Drive an input pin (like poking it) and propagate. */
	setInput(pinOrLabel: Instance | string, value: number | Value): void {
		const pin = typeof pinOrLabel === "string" ? this.findPin(pinOrLabel) : pinOrLabel;
		const width = pin.attrs.getByName("width") as number;
		const v = typeof value === "number" ? Value.createKnown(width, value) : value;
		const state = new InstanceStateImpl(this.root, pin);
		PIN.setValue(state, v);
		state.fireInvalidated();
		this.propagate();
	}

	/** Pin.getValue: the value shown by the pin. */
	getPinValue(pinOrLabel: Instance | string): Value {
		const pin = typeof pinOrLabel === "string" ? this.findPin(pinOrLabel) : pinOrLabel;
		return PIN.getValue(new InstanceStateImpl(this.root, pin));
	}

	/**
	 * TtyInterface.runSimulation with FORMAT_TABLE: prints the output pins
	 * whenever they change, ticking the clock until a pin named "halt" is 1.
	 */
	runTtyTable(maxTicks = 100_000): { lines: string[]; code: number } {
		const outputs = this.pins().filter((p) => !p.input);
		const halt = outputs.find((p) => p.label === "halt")?.pin ?? null;
		const lines: string[] = [];
		let prev: Value[] | null = null;
		for (let ticks = 0; ticks <= maxTicks; ticks++) {
			let halted = false;
			const cur: Value[] = [];
			for (const { pin } of outputs) {
				const val = this.getPinValue(pin);
				if (pin === halt) halted ||= val.equals(Value.TRUE);
				else cur.push(val);
			}
			if (prev === null || cur.some((v, i) => !v.equals((prev as Value[])[i]))) {
				lines.push(cur.map((v) => v.toString()).join("\t"));
			}
			if (halted) return { lines, code: 0 };
			if (this.isOscillating()) return { lines, code: 1 };
			prev = cur;
			this.propagator.tick();
			this.propagate();
		}
		return { lines, code: 2 };
	}
}
