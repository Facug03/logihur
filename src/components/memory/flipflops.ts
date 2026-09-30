// Port of com.cburch.logisim.std.memory.{AbstractFlipFlop, ClockState,
// DFlipFlop, TFlipFlop, JKFlipFlop, SRFlipFlop}.

import { type AnyAttribute, type Attribute, AttributeSet, DEFAULT_LABEL_FONT } from "@/engine/attributes";
import {
	ComponentFactory,
	type Instance,
	type InstancePainter,
	type InstanceState,
	type Poker,
	type PortDef,
	port,
	type TextFieldSpec,
} from "@/engine/component";
import { Bounds, locX, locY } from "@/engine/geom";
import { drawCenteredText, H_CENTER, V_BASELINE } from "@/engine/graphics";
import { Value } from "@/engine/value";
import { EDGE_TRIGGER, LABEL, LABEL_FONT, TRIGGER } from "../std-attrs";

/** Memory.DELAY */
export const MEMORY_DELAY = 5;

/** ClockState: remembers the last clock value to detect triggers. */
export class ClockState {
	lastClock: Value = Value.FALSE;

	updateClock(newClock: Value, trigger: string | undefined): boolean {
		const oldClock = this.lastClock;
		this.lastClock = newClock;
		if (trigger === "falling") return oldClock === Value.TRUE && newClock === Value.FALSE;
		if (trigger === "high") return newClock === Value.TRUE;
		if (trigger === "low") return newClock === Value.FALSE;
		return oldClock === Value.FALSE && newClock === Value.TRUE;
	}
}

/** Text field above the component, as in configureNewInstance. */
export function labelAbove(instance: Instance): TextFieldSpec {
	const bds = instance.bounds;
	return {
		labelAttr: LABEL,
		fontAttr: LABEL_FONT,
		x: bds.x + Math.trunc(bds.width / 2),
		y: bds.y - 3,
		halign: H_CENTER,
		valign: V_BASELINE,
	};
}

class FlipFlopData extends ClockState {
	curValue: Value = Value.FALSE;
}

abstract class AbstractFlipFlop extends ComponentFactory {
	readonly library = "#Memory";
	private readonly triggerAttr: Attribute<string>;

	constructor(
		private readonly numInputs: number,
		allowLevelTriggers: boolean,
	) {
		super();
		this.triggerAttr = allowLevelTriggers ? TRIGGER : EDGE_TRIGGER;
	}

	protected abstract inputName(index: number): string;
	protected abstract computeValue(inputs: Value[], curValue: Value): Value;

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(this.triggerAttr, "rising");
		a.set(LABEL, "");
		a.set(LABEL_FONT, DEFAULT_LABEL_FONT);
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [this.triggerAttr, LABEL, LABEL_FONT];
	}

	getOffsetBounds(): Bounds {
		return Bounds.create(-40, -10, 40, 40);
	}

	override getPorts(): PortDef[] {
		const ps: PortDef[] = [];
		if (this.numInputs === 1) {
			ps.push(port(-40, 20, "input", 1));
			ps.push(port(-40, 0, "input", 1));
		} else {
			ps.push(port(-40, 0, "input", 1));
			ps.push(port(-40, 20, "input", 1));
			ps.push(port(-40, 10, "input", 1));
		}
		ps.push(port(0, 0, "output", 1));
		ps.push(port(0, 20, "output", 1));
		ps.push(port(-10, 30, "input", 1));
		ps.push(port(-30, 30, "input", 1));
		ps.push(port(-20, 30, "input", 1));
		return ps;
	}

	override getTextField(instance: Instance): TextFieldSpec {
		return labelAbove(instance);
	}

	propagate(state: InstanceState): void {
		let data = state.getData<FlipFlopData>();
		if (data === undefined) {
			data = new FlipFlopData();
			state.setData(data);
		}
		const n = this.numInputs;
		const triggered = data.updateClock(state.getPort(n), state.getAttr(this.triggerAttr));
		if (state.getPort(n + 3) === Value.TRUE) {
			data.curValue = Value.FALSE;
		} else if (state.getPort(n + 4) === Value.TRUE) {
			data.curValue = Value.TRUE;
		} else if (triggered && state.getPort(n + 5) !== Value.FALSE) {
			const inputs: Value[] = [];
			for (let i = 0; i < n; i++) inputs.push(state.getPort(i));
			const newVal = this.computeValue(inputs, data.curValue);
			if (newVal === Value.TRUE || newVal === Value.FALSE) data.curValue = newVal;
		}
		state.setPort(n + 1, data.curValue, MEMORY_DELAY);
		state.setPort(n + 2, data.curValue.not(), MEMORY_DELAY);
	}

	paintInstance(painter: InstancePainter): void {
		const g = painter.g;
		painter.drawBounds();
		painter.drawLabel();
		if (painter.showState) {
			const l = painter.getLocation();
			const myState = painter.getData<FlipFlopData>();
			if (myState) {
				const x = locX(l);
				const y = locY(l);
				g.setColor(myState.curValue.getColor());
				g.fillOval(x - 26, y + 4, 13, 13);
				g.setColor("#ffffff");
				drawCenteredText(g, myState.curValue.toDisplayString(), x - 19, y + 9);
				g.setColor("#000000");
			}
		}
		const n = this.numInputs;
		g.setColor("#808080");
		painter.drawPort(n + 3, "0", "south");
		painter.drawPort(n + 4, "1", "south");
		painter.drawPort(n + 5, "en", "south");
		g.setColor("#000000");
		for (let i = 0; i < n; i++) painter.drawPort(i, this.inputName(i), "east");
		painter.drawClock(n, "east");
		painter.drawPort(n + 1, "Q", "west");
		painter.drawPort(n + 2);
	}

	override createPoker(): Poker {
		let isPressed = true;
		const isInside = (state: InstanceState, x: number, y: number) => {
			const dx = x - (state.instance.x - 20);
			const dy = y - (state.instance.y + 10);
			return dx * dx + dy * dy < 8 * 8;
		};
		return {
			mousePressed: (state, x, y) => {
				isPressed = isInside(state, x, y);
			},
			mouseReleased: (state, x, y) => {
				if (isPressed && isInside(state, x, y)) {
					const myState = state.getData<FlipFlopData>();
					if (myState) {
						myState.curValue = myState.curValue.not();
						state.fireInvalidated();
					}
				}
				isPressed = false;
			},
		};
	}
}

class DFlipFlop extends AbstractFlipFlop {
	readonly name = "D Flip-Flop";
	readonly displayKey = "memory.dFlipFlop";
	override readonly iconName = "dFlipFlop.gif";

	constructor() {
		super(1, true);
	}

	protected inputName(): string {
		return "D";
	}

	protected computeValue(inputs: Value[]): Value {
		return inputs[0];
	}
}

class TFlipFlop extends AbstractFlipFlop {
	readonly name = "T Flip-Flop";
	readonly displayKey = "memory.tFlipFlop";
	override readonly iconName = "tFlipFlop.gif";

	constructor() {
		super(1, false);
	}

	protected inputName(): string {
		return "T";
	}

	protected computeValue(inputs: Value[], cur: Value): Value {
		const curValue = cur === Value.UNKNOWN ? Value.FALSE : cur;
		return inputs[0] === Value.TRUE ? curValue.not() : curValue;
	}
}

class JKFlipFlop extends AbstractFlipFlop {
	readonly name = "J-K Flip-Flop";
	readonly displayKey = "memory.jkFlipFlop";
	override readonly iconName = "jkFlipFlop.gif";

	constructor() {
		super(2, false);
	}

	protected inputName(index: number): string {
		return index === 0 ? "J" : "K";
	}

	protected computeValue(inputs: Value[], curValue: Value): Value {
		const [j, k] = inputs;
		if (j === Value.FALSE) {
			if (k === Value.FALSE) return curValue;
			if (k === Value.TRUE) return Value.FALSE;
		} else if (j === Value.TRUE) {
			if (k === Value.FALSE) return Value.TRUE;
			if (k === Value.TRUE) return curValue.not();
		}
		return Value.UNKNOWN;
	}
}

class SRFlipFlop extends AbstractFlipFlop {
	readonly name = "S-R Flip-Flop";
	readonly displayKey = "memory.srFlipFlop";
	override readonly iconName = "srFlipFlop.gif";

	constructor() {
		super(2, true);
	}

	protected inputName(index: number): string {
		return index === 0 ? "S" : "R";
	}

	protected computeValue(inputs: Value[], curValue: Value): Value {
		const [s, r] = inputs;
		if (s === Value.FALSE) {
			if (r === Value.FALSE) return curValue;
			if (r === Value.TRUE) return Value.FALSE;
		} else if (s === Value.TRUE) {
			if (r === Value.FALSE) return Value.TRUE;
			if (r === Value.TRUE) return Value.ERROR;
		}
		return Value.UNKNOWN;
	}
}

export const D_FLIP_FLOP = new DFlipFlop();
export const T_FLIP_FLOP = new TFlipFlop();
export const JK_FLIP_FLOP = new JKFlipFlop();
export const SR_FLIP_FLOP = new SRFlipFlop();
