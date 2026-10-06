// Port of com.cburch.logisim.std.memory.{Register, Counter, ShiftRegister,
// Random} and their pokers.

import {
	type AnyAttribute,
	AttributeSet,
	boolAttr,
	DEFAULT_LABEL_FONT,
	hexAttr,
	intAttr,
	intRangeAttr,
	optionAttr,
} from "@/engine/attributes";
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
import { Bounds } from "@/engine/geom";
import { drawCenteredText, drawText, H_CENTER, V_CENTER, V_TOP } from "@/engine/graphics";
import {
	bitWidthConfigurator,
	integerConfigurator,
	JoinedConfigurator,
	type KeyConfigurator,
} from "@/engine/key-config";
import { Value } from "@/engine/value";
import { EDGE_TRIGGER, LABEL, LABEL_FONT, TRIGGER, WIDTH } from "../std-attrs";
import { ClockState, labelAbove } from "./flipflops";

function widthMask(width: number): number {
	return width === 32 ? -1 : (1 << width) - 1;
}

/** StringUtil.toHexString(bits, value) */
export function toHexString(bits: number, value: number): string {
	const v = bits < 32 ? value & ((1 << bits) - 1) : value;
	let ret = (v >>> 0).toString(16);
	const len = Math.trunc((bits + 3) / 4);
	while (ret.length < len) ret = `0${ret}`;
	if (ret.length > len) ret = ret.slice(ret.length - len);
	return ret;
}

class RegisterData extends ClockState {
	value = 0;
}

/** Register/Counter/Random value display: up to 4 hex digits per line. */
function drawRegisterText(painter: InstancePainter, a: string, b: string | null): void {
	const g = painter.g;
	const bds = painter.getBounds();
	if (b === null) {
		drawText(g, a, bds.x + 15, bds.y + 4, H_CENTER, V_TOP);
	} else {
		drawText(g, a, bds.x + 15, bds.y + 3, H_CENTER, V_TOP);
		drawText(g, b, bds.x + 15, bds.y + 15, H_CENTER, V_TOP);
	}
}

function splitHex(width: number, val: number): [string, string | null] {
	const str = toHexString(width, val);
	if (str.length <= 4) return [str, null];
	const split = str.length - 4;
	return [str.slice(0, split), str.slice(split)];
}

/** RegisterPoker: type hex digits to set the stored value. */
function registerPoker(): Poker {
	let curValue = 0;
	return {
		init: (state) => {
			let data = state.getData<RegisterData>();
			if (data === undefined) {
				data = new RegisterData();
				state.setData(data);
			}
			curValue = data.value;
			return true;
		},
		paint: (painter) => {
			const bds = painter.getBounds();
			const len = Math.trunc((painter.getAttr(WIDTH) + 3) / 4);
			const g = painter.g;
			g.setColor("#ff0000");
			g.setLineWidth(1);
			if (len > 4) {
				g.drawRect(bds.x, bds.y + 3, bds.width, 25);
			} else {
				const wid = 7 * len + 2;
				g.drawRect(bds.x + Math.trunc((bds.width - wid) / 2), bds.y + 4, wid, 15);
			}
			g.setColor("#000000");
		},
		keyTyped: (state, key) => {
			const val = Number.parseInt(key, 16);
			if (key.length !== 1 || Number.isNaN(val)) return;
			curValue = (curValue * 16 + val) & widthMask(state.getAttr(WIDTH));
			const data = state.getData<RegisterData>();
			if (data) data.value = curValue;
			state.fireInvalidated();
		},
	};
}

class Register extends ComponentFactory {
	override createKeyConfigurator(): KeyConfigurator {
		return bitWidthConfigurator(WIDTH);
	}

	readonly name = "Register";
	readonly library = "#Memory";
	readonly displayKey = "memory.register";
	override readonly iconName = "register.gif";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(WIDTH, 8);
		a.set(TRIGGER, "rising");
		a.set(LABEL, "");
		a.set(LABEL_FONT, DEFAULT_LABEL_FONT);
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [WIDTH, TRIGGER, LABEL, LABEL_FONT];
	}

	getOffsetBounds(): Bounds {
		return Bounds.create(-30, -20, 30, 40);
	}

	override getPorts(): PortDef[] {
		return [
			port(0, 0, "output", WIDTH),
			port(-30, 0, "input", WIDTH),
			port(-20, 20, "input", 1),
			port(-10, 20, "input", 1),
			port(-30, 10, "input", 1),
		];
	}

	override getTextField(instance: Instance): TextFieldSpec {
		return labelAbove(instance);
	}

	propagate(state: InstanceState): void {
		let data = state.getData<RegisterData>();
		if (data === undefined) {
			data = new RegisterData();
			state.setData(data);
		}
		const triggered = data.updateClock(state.getPort(2), state.getAttr(TRIGGER));
		if (state.getPort(3) === Value.TRUE) {
			data.value = 0;
		} else if (triggered && state.getPort(4) !== Value.FALSE) {
			const input = state.getPort(1);
			if (input.isFullyDefined()) data.value = input.toIntValue();
		}
		state.setPort(0, Value.createKnown(state.getAttr(WIDTH), data.value), 8);
	}

	paintInstance(painter: InstancePainter): void {
		const g = painter.g;
		const width = painter.getAttr(WIDTH);
		let a: string;
		let b: string | null;
		if (painter.showState) {
			[a, b] = splitHex(width, painter.getData<RegisterData>()?.value ?? 0);
		} else {
			a = "reg";
			b = `(${width}b)`;
		}
		painter.drawBounds();
		painter.drawLabel();
		if (b === null) {
			painter.drawPort(1, "D", "east");
			painter.drawPort(0, "Q", "west");
		} else {
			painter.drawPort(1);
			painter.drawPort(0);
		}
		g.setColor("#808080");
		painter.drawPort(3, "0", "south");
		painter.drawPort(4, "en", "east");
		g.setColor("#000000");
		painter.drawClock(2, "north");
		drawRegisterText(painter, a, b);
	}

	override createPoker(): Poker {
		return registerPoker();
	}
}

export const COUNTER_MAX = hexAttr("max", "memory.counterMax");
export const COUNTER_ON_GOAL = optionAttr("ongoal", "memory.counterGoal", [
	{ value: "wrap", label: "memory.counterGoalWrap" },
	{ value: "stay", label: "memory.counterGoalStay" },
	{ value: "continue", label: "memory.counterGoalContinue" },
	{ value: "load", label: "memory.counterGoalLoad" },
]);

class Counter extends ComponentFactory {
	override createKeyConfigurator(): KeyConfigurator {
		return bitWidthConfigurator(WIDTH);
	}

	readonly name = "Counter";
	readonly library = "#Memory";
	readonly displayKey = "memory.counter";
	override readonly iconName = "counter.gif";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(WIDTH, 8);
		a.set(COUNTER_MAX, 0xff);
		a.set(COUNTER_ON_GOAL, "wrap");
		a.set(EDGE_TRIGGER, "rising");
		a.set(LABEL, "");
		a.set(LABEL_FONT, DEFAULT_LABEL_FONT);
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [WIDTH, COUNTER_MAX, COUNTER_ON_GOAL, EDGE_TRIGGER, LABEL, LABEL_FONT];
	}

	/** CounterAttributes.setValue: the maximum follows the width. */
	override setAttribute(attrs: AttributeSet, attr: AnyAttribute, value: unknown): void {
		const old = attrs.getByName(attr.name);
		if (old === value) return;
		if (attr === WIDTH) {
			const oldW = attrs.get(WIDTH);
			const newW = value as number;
			const oldMax = attrs.get(COUNTER_MAX);
			attrs.set(WIDTH, newW);
			if (newW > oldW) attrs.set(COUNTER_MAX, widthMask(newW));
			else attrs.set(COUNTER_MAX, oldMax & widthMask(newW));
		} else if (attr === COUNTER_MAX) {
			attrs.set(COUNTER_MAX, (value as number) & widthMask(attrs.get(WIDTH)));
		} else {
			attrs.set(attr, value);
		}
	}

	getOffsetBounds(): Bounds {
		return Bounds.create(-30, -20, 30, 40);
	}

	override getPorts(): PortDef[] {
		return [
			port(0, 0, "output", WIDTH),
			port(-30, 0, "input", WIDTH),
			port(-20, 20, "input", 1),
			port(-10, 20, "input", 1),
			port(-30, -10, "input", 1),
			port(-30, 10, "input", 1),
			port(0, 10, "output", 1),
		];
	}

	override getTextField(instance: Instance): TextFieldSpec {
		return labelAbove(instance);
	}

	propagate(state: InstanceState): void {
		let data = state.getData<RegisterData>();
		if (data === undefined) {
			data = new RegisterData();
			state.setData(data);
		}
		const dataWidth = state.getAttr(WIDTH);
		const max = state.getAttr(COUNTER_MAX);
		const triggered = data.updateClock(state.getPort(2), state.getAttr(EDGE_TRIGGER));
		let newValue: Value;
		let carry: boolean;
		if (state.getPort(3) === Value.TRUE) {
			newValue = Value.createKnown(dataWidth, 0);
			carry = false;
		} else {
			const ld = state.getPort(4) === Value.TRUE;
			const ct = state.getPort(5) !== Value.FALSE;
			const oldVal = data.value;
			let newVal: number;
			const load = () => {
				const input = state.getPort(1);
				let v = input.isFullyDefined() ? input.toIntValue() : 0;
				if (v > max) v &= max;
				return v;
			};
			if (!triggered) {
				newVal = oldVal;
			} else if (ct) {
				const goal = ld ? 0 : max;
				if (oldVal === goal) {
					const onGoal = state.getAttr(COUNTER_ON_GOAL);
					if (onGoal === "stay") newVal = oldVal;
					else if (onGoal === "load") newVal = load();
					else if (onGoal === "continue") newVal = ld ? oldVal - 1 : oldVal + 1;
					else newVal = ld ? max : 0;
				} else {
					newVal = ld ? oldVal - 1 : oldVal + 1;
				}
			} else if (ld) {
				newVal = load();
			} else {
				newVal = oldVal;
			}
			newValue = Value.createKnown(dataWidth, newVal);
			carry = newValue.toIntValue() === (ld && ct ? 0 : max);
		}
		data.value = newValue.toIntValue();
		state.setPort(0, newValue, 8);
		state.setPort(6, carry ? Value.TRUE : Value.FALSE, 8);
	}

	paintInstance(painter: InstancePainter): void {
		const g = painter.g;
		const width = painter.getAttr(WIDTH);
		let a: string;
		let b: string | null;
		if (painter.showState) {
			[a, b] = splitHex(width, painter.getData<RegisterData>()?.value ?? 0);
		} else {
			a = "ctr";
			b = `(${width}b)`;
		}
		painter.drawBounds();
		painter.drawLabel();
		if (b === null) {
			painter.drawPort(1, "D", "east");
			painter.drawPort(0, "Q", "west");
		} else {
			painter.drawPort(1);
			painter.drawPort(0);
		}
		g.setColor("#808080");
		painter.drawPort(4);
		painter.drawPort(6);
		painter.drawPort(3, "0", "south");
		painter.drawPort(5, "ct", "east");
		g.setColor("#000000");
		painter.drawClock(2, "north");
		drawRegisterText(painter, a, b);
	}

	override createPoker(): Poker {
		return registerPoker();
	}
}

// --- Shift Register --------------------------------------------------------

export const SHIFT_LENGTH = intRangeAttr("length", "memory.shiftRegLength", 1, 32);
export const SHIFT_PARALLEL = boolAttr("parallel", "memory.shiftRegParallel");

const SR_IN = 0;
const SR_SH = 1;
const SR_CK = 2;
const SR_CLR = 3;
const SR_OUT = 4;
const SR_LD = 5;

class ShiftRegisterData extends ClockState {
	private vs: Value[];
	private vsPos = 0;

	constructor(
		private width: number,
		len: number,
	) {
		super();
		this.vs = new Array(len).fill(Value.createKnown(width, 0));
	}

	get length(): number {
		return this.vs.length;
	}

	setDimensions(newWidth: number, newLength: number): void {
		let v = this.vs;
		if (v.length !== newLength) {
			const newV: Value[] = new Array(newLength);
			let j = this.vsPos;
			const copy = Math.min(newLength, v.length);
			for (let i = 0; i < copy; i++) {
				newV[i] = v[j];
				j++;
				if (j === v.length) j = 0;
			}
			newV.fill(Value.createKnown(newWidth, 0), copy, newLength);
			v = newV;
			this.vsPos = 0;
			this.vs = newV;
		}
		if (this.width !== newWidth) {
			for (let i = 0; i < v.length; i++) {
				if (v[i].width !== newWidth) v[i] = v[i].extendWidth(newWidth, Value.FALSE);
			}
			this.width = newWidth;
		}
	}

	clear(): void {
		this.vs.fill(Value.createKnown(this.width, 0));
		this.vsPos = 0;
	}

	push(v: Value): void {
		const pos = this.vsPos;
		this.vs[pos] = v;
		this.vsPos = pos >= this.vs.length - 1 ? 0 : pos + 1;
	}

	get(index: number): Value {
		let i = this.vsPos + index;
		if (i >= this.vs.length) i -= this.vs.length;
		return this.vs[i];
	}

	set(index: number, val: Value): void {
		let i = this.vsPos + index;
		if (i >= this.vs.length) i -= this.vs.length;
		this.vs[i] = val;
	}
}

function shiftRegisterData(state: {
	getAttr: InstanceState["getAttr"];
	getData<T>(): T | undefined;
	setData?(d: unknown): void;
}): ShiftRegisterData {
	const width = state.getAttr(WIDTH);
	const length = state.getAttr(SHIFT_LENGTH);
	let data = state.getData<ShiftRegisterData>();
	if (data === undefined) {
		data = new ShiftRegisterData(width, length);
		state.setData?.(data);
	} else {
		data.setDimensions(width, length);
	}
	return data;
}

/** Row where stage values are drawn (and poked). */
function stageRowY(bds: Bounds, label: string): number {
	return bds.y + (label ? Math.trunc((3 * bds.height) / 4) : Math.trunc(bds.height / 2));
}

class ShiftRegister extends ComponentFactory {
	override createKeyConfigurator(): KeyConfigurator {
		return new JoinedConfigurator(integerConfigurator(SHIFT_LENGTH, 1, 32, 0), bitWidthConfigurator(WIDTH));
	}

	readonly name = "Shift Register";
	readonly library = "#Memory";
	readonly displayKey = "memory.shiftRegister";
	override readonly iconName = "shiftreg.gif";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(WIDTH, 1);
		a.set(SHIFT_LENGTH, 8);
		a.set(SHIFT_PARALLEL, true);
		a.set(EDGE_TRIGGER, "rising");
		a.set(LABEL, "");
		a.set(LABEL_FONT, DEFAULT_LABEL_FONT);
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [WIDTH, SHIFT_LENGTH, SHIFT_PARALLEL, EDGE_TRIGGER, LABEL, LABEL_FONT];
	}

	getOffsetBounds(attrs: AttributeSet): Bounds {
		if (attrs.get(SHIFT_PARALLEL)) return Bounds.create(0, -20, 20 + 10 * attrs.get(SHIFT_LENGTH), 40);
		return Bounds.create(0, -20, 30, 40);
	}

	override getPorts(instance: Instance): PortDef[] {
		const width = instance.attrs.get(WIDTH);
		const bds = this.getOffsetBounds(instance.attrs);
		const ps: PortDef[] = [];
		ps[SR_OUT] = port(bds.width, 0, "output", width);
		ps[SR_SH] = port(0, -10, "input", 1);
		ps[SR_IN] = port(0, 0, "input", width);
		ps[SR_CK] = port(0, 10, "input", 1);
		ps[SR_CLR] = port(10, 20, "input", 1);
		if (instance.attrs.get(SHIFT_PARALLEL)) {
			const len = instance.attrs.get(SHIFT_LENGTH);
			ps[SR_LD] = port(10, -20, "input", 1);
			for (let i = 0; i < len; i++) {
				ps[6 + 2 * i] = port(20 + 10 * i, -20, "input", width);
				ps[6 + 2 * i + 1] = port(20 + 10 * i, 20, "output", width);
			}
		}
		return ps;
	}

	override getTextField(instance: Instance): TextFieldSpec {
		const bds = instance.bounds;
		return {
			labelAttr: LABEL,
			fontAttr: LABEL_FONT,
			x: bds.x + Math.trunc(bds.width / 2),
			y: bds.y + Math.trunc(bds.height / 4),
			halign: H_CENTER,
			valign: V_CENTER,
		};
	}

	propagate(state: InstanceState): void {
		const parallel = state.getAttr(SHIFT_PARALLEL);
		const data = shiftRegisterData(state);
		const len = data.length;
		const triggered = data.updateClock(state.getPort(SR_CK), state.getAttr(EDGE_TRIGGER));
		if (state.getPort(SR_CLR) === Value.TRUE) {
			data.clear();
		} else if (triggered) {
			if (parallel && state.getPort(SR_LD) === Value.TRUE) {
				data.clear();
				for (let i = len - 1; i >= 0; i--) data.push(state.getPort(6 + 2 * i));
			} else if (state.getPort(SR_SH) !== Value.FALSE) {
				data.push(state.getPort(SR_IN));
			}
		}
		state.setPort(SR_OUT, data.get(0), 4);
		if (parallel) {
			for (let i = 0; i < len; i++) state.setPort(6 + 2 * i + 1, data.get(len - 1 - i), 4);
		}
	}

	paintInstance(painter: InstancePainter): void {
		painter.drawBounds();
		painter.drawLabel();
		const g = painter.g;
		if (painter.getAttr(SHIFT_PARALLEL)) {
			const wid = painter.getAttr(WIDTH);
			const len = painter.getAttr(SHIFT_LENGTH);
			const bds = painter.getBounds();
			const label = painter.getAttr(LABEL);
			if (painter.showState) {
				if (wid <= 4) {
					const data = shiftRegisterData(painter);
					let x = bds.x + 20;
					const y = stageRowY(bds, label);
					for (let i = 0; i < len; i++) {
						drawCenteredText(g, data.get(len - 1 - i).toHexString(), x, y);
						x += 10;
					}
				}
			} else {
				const x = bds.x + Math.trunc(bds.width / 2);
				if (!label) drawCenteredText(g, "shift reg", x, bds.y + Math.trunc(bds.height / 4));
				drawCenteredText(g, `${len}x${wid}`, x, bds.y + Math.trunc((3 * bds.height) / 4));
			}
		}
		const n = (painter.instance as Instance).ports.length;
		for (let i = 0; i < n; i++) if (i !== SR_CK) painter.drawPort(i);
		painter.drawClock(SR_CK, "east");
	}

	override createPoker(): Poker {
		let stage = -1;
		const computeStage = (state: InstanceState, px: number, py: number): number => {
			const bds = state.instance.bounds;
			const y = py - stageRowY(bds, state.getAttr(LABEL));
			if (y <= -6 || y >= 8) return -1;
			const x = px - (bds.x + 15);
			if (!state.getAttr(SHIFT_PARALLEL) || state.getAttr(WIDTH) > 4) return -1;
			if (x < 0 || x >= state.getAttr(SHIFT_LENGTH) * 10) return -1;
			return Math.trunc(x / 10);
		};
		return {
			init: (state, x, y) => {
				stage = computeStage(state, x, y);
				return stage >= 0;
			},
			mousePressed: (state, x, y) => {
				stage = computeStage(state, x, y);
			},
			mouseReleased: (state, x, y) => {
				if (stage < 0 || state.getAttr(WIDTH) !== 1) return;
				if (computeStage(state, x, y) !== stage) return;
				const data = shiftRegisterData(state);
				const i = data.length - 1 - stage;
				data.set(i, data.get(i) === Value.FALSE ? Value.TRUE : Value.FALSE);
				state.fireInvalidated();
			},
			paint: (painter) => {
				if (stage < 0) return;
				const bds = painter.getBounds();
				const x = bds.x + 15 + stage * 10;
				const y = stageRowY(bds, painter.getAttr(LABEL));
				painter.g.setColor("#ff0000");
				painter.g.setLineWidth(1);
				painter.g.drawRect(x, y - 6, 10, 13);
			},
			keyTyped: (state, key) => {
				if (stage < 0) return;
				if (key === " ") {
					if (stage < state.getAttr(SHIFT_LENGTH) - 1) stage++;
					state.fireInvalidated();
				} else if (key === "\b") {
					if (stage > 0) stage--;
					state.fireInvalidated();
				} else if (key.length === 1 && /[0-9a-fA-F]/.test(key)) {
					const val = Number.parseInt(key, 16);
					const width = state.getAttr(WIDTH);
					if ((val & ~widthMask(width)) !== 0) return;
					const valObj = Value.createKnown(width, val);
					const data = shiftRegisterData(state);
					const i = data.length - 1 - stage;
					if (!data.get(i).equals(valObj)) {
						data.set(i, valObj);
						state.fireInvalidated();
					}
				}
			},
		};
	}
}

// --- Random ---------------------------------------------------------------

export const RANDOM_SEED = intAttr("seed", "memory.randomSeed");

const MULTIPLIER = 0x5deece66dn;
const ADDEND = 0xbn;
const MASK48 = (1n << 48n) - 1n;

class RandomData extends ClockState {
	private initSeed = 0n;
	private curSeed = 0n;
	value = 0;

	constructor(seed: number) {
		super();
		this.reset(seed);
	}

	reset(seed: number): void {
		let start = BigInt(seed);
		if (start === 0n) {
			start = (BigInt(Date.now()) ^ MULTIPLIER) & MASK48;
			if (start === this.initSeed) start = (start + MULTIPLIER) & MASK48;
		}
		this.initSeed = start;
		this.curSeed = start;
		this.value = Number(BigInt.asIntN(32, start));
	}

	step(): void {
		const v = (this.curSeed * MULTIPLIER + ADDEND) & MASK48;
		this.curSeed = v;
		this.value = Number(BigInt.asIntN(32, v >> 12n));
	}
}

class RandomFactory extends ComponentFactory {
	override createKeyConfigurator(): KeyConfigurator {
		return bitWidthConfigurator(WIDTH);
	}

	readonly name = "Random";
	readonly library = "#Memory";
	readonly displayKey = "memory.random";
	override readonly iconName = "random.gif";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(WIDTH, 8);
		a.set(RANDOM_SEED, 0);
		a.set(EDGE_TRIGGER, "rising");
		a.set(LABEL, "");
		a.set(LABEL_FONT, DEFAULT_LABEL_FONT);
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [WIDTH, RANDOM_SEED, EDGE_TRIGGER, LABEL, LABEL_FONT];
	}

	getOffsetBounds(): Bounds {
		return Bounds.create(-30, -20, 30, 40);
	}

	override getPorts(): PortDef[] {
		return [
			port(0, 0, "output", WIDTH),
			port(-30, -10, "input", 1),
			port(-30, 10, "input", 1),
			port(-20, 20, "input", 1),
		];
	}

	override getTextField(instance: Instance): TextFieldSpec {
		return labelAbove(instance);
	}

	propagate(state: InstanceState): void {
		let data = state.getData<RandomData>();
		if (data === undefined) {
			data = new RandomData(state.getAttr(RANDOM_SEED));
			state.setData(data);
		}
		const triggered = data.updateClock(state.getPort(1), state.getAttr(EDGE_TRIGGER));
		if (state.getPort(3) === Value.TRUE) data.reset(state.getAttr(RANDOM_SEED));
		else if (triggered && state.getPort(2) !== Value.FALSE) data.step();
		state.setPort(0, Value.createKnown(state.getAttr(WIDTH), data.value), 4);
	}

	paintInstance(painter: InstancePainter): void {
		painter.drawBounds();
		painter.drawLabel();
		painter.drawPort(0, "Q", "west");
		painter.drawPort(3);
		painter.drawPort(2);
		painter.drawClock(1, "east");
		if (painter.showState) {
			const [a, b] = splitHex(painter.getAttr(WIDTH), painter.getData<RandomData>()?.value ?? 0);
			drawRegisterText(painter, a, b);
		}
	}
}

export const REGISTER = new Register();
export const COUNTER = new Counter();
export const SHIFT_REGISTER = new ShiftRegister();
export const RANDOM = new RandomFactory();
