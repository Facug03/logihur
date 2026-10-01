// Ports of AndGate, OrGate, NandGate, NorGate, XorGate, XnorGate,
// OddParityGate, EvenParityGate and GateFunctions.

import type { AttributeSet } from "@/engine/attributes";
import type { InstancePainter, InstanceState } from "@/engine/component";
import { Value } from "@/engine/value";
import { AbstractGate, GATE_INPUTS, GATE_XOR, type GateConfig } from "./abstract-gate";
import { paintDin } from "./painter-din";
import { paintAnd, paintOr, paintXor } from "./painter-shaped";

export function computeOr(inputs: Value[], n: number): Value {
	let ret = inputs[0];
	for (let i = 1; i < n; i++) ret = ret.or(inputs[i]);
	return ret;
}

export function computeAnd(inputs: Value[], n: number): Value {
	let ret = inputs[0];
	for (let i = 1; i < n; i++) ret = ret.and(inputs[i]);
	return ret;
}

export function computeOddParity(inputs: Value[], n: number): Value {
	let ret = inputs[0];
	for (let i = 1; i < n; i++) ret = ret.xor(inputs[i]);
	return ret;
}

export function computeExactlyOne(inputs: Value[], n: number): Value {
	const width = inputs[0].width;
	const ret: Value[] = new Array(width);
	for (let i = 0; i < width; i++) {
		let count = 0;
		for (let j = 0; j < n; j++) {
			const v = inputs[j].get(i);
			if (v === Value.TRUE) count++;
			else if (v !== Value.FALSE) {
				count = -1;
				break;
			}
		}
		if (count < 0) ret[i] = Value.ERROR;
		else if (count === 1) ret[i] = Value.TRUE;
		else ret[i] = Value.FALSE;
	}
	return Value.fromBits(ret);
}

class AndGate extends AbstractGate {
	readonly name = "AND Gate";
	readonly displayKey = "gates.and";
	override readonly iconName = "andGate.gif";
	constructor() {
		super();
		this.rectLabel = "&";
	}
	protected paintShape(p: InstancePainter, w: number, h: number): void {
		paintAnd(p, w, h);
	}
	protected override paintDinShape(p: InstancePainter, w: number, h: number): void {
		paintDin(p, w, h, false, "and");
	}
	protected computeOutput(inputs: Value[], n: number): Value {
		return computeAnd(inputs, n);
	}
	getIdentity(): Value {
		return Value.TRUE;
	}
}

class OrGate extends AbstractGate {
	readonly name = "OR Gate";
	readonly displayKey = "gates.or";
	override readonly iconName = "orGate.gif";
	constructor() {
		super();
		this.rectLabel = "≥1";
		this.paintInputLinesFlag = true;
	}
	protected paintShape(p: InstancePainter, w: number, h: number): void {
		paintOr(p, w, h);
	}
	protected override paintDinShape(p: InstancePainter, w: number, h: number, cfg: GateConfig): void {
		paintDin(p, w, h, false, "or", { factory: this, cfg });
	}
	protected computeOutput(inputs: Value[], n: number): Value {
		return computeOr(inputs, n);
	}
	getIdentity(): Value {
		return Value.FALSE;
	}
}

class NandGate extends AbstractGate {
	readonly name = "NAND Gate";
	readonly displayKey = "gates.nand";
	override readonly iconName = "nandGate.gif";
	constructor() {
		super();
		this.negateOutput = true;
		this.rectLabel = "&";
	}
	protected paintShape(p: InstancePainter, w: number, h: number): void {
		paintAnd(p, w, h);
	}
	protected override paintDinShape(p: InstancePainter, w: number, h: number): void {
		paintDin(p, w, h, true, "and");
	}
	protected computeOutput(inputs: Value[], n: number): Value {
		return computeAnd(inputs, n).not();
	}
	getIdentity(): Value {
		return Value.TRUE;
	}
}

class NorGate extends AbstractGate {
	readonly name = "NOR Gate";
	readonly displayKey = "gates.nor";
	override readonly iconName = "norGate.gif";
	constructor() {
		super();
		this.negateOutput = true;
		this.rectLabel = "≥1";
		this.paintInputLinesFlag = true;
	}
	protected paintShape(p: InstancePainter, w: number, h: number): void {
		paintOr(p, w, h);
	}
	protected override paintDinShape(p: InstancePainter, w: number, h: number, cfg: GateConfig): void {
		paintDin(p, w, h, true, "or", { factory: this, cfg });
	}
	protected computeOutput(inputs: Value[], n: number): Value {
		return computeOr(inputs, n).not();
	}
	getIdentity(): Value {
		return Value.FALSE;
	}
}

function xorRectLabel(attrs: AttributeSet | null): string {
	if (attrs === null) return "";
	if (attrs.get(GATE_XOR) === "odd" && attrs.get(GATE_INPUTS) !== 2) return "2k+1";
	return "=1";
}

class XorGate extends AbstractGate {
	readonly name = "XOR Gate";
	readonly displayKey = "gates.xor";
	override readonly iconName = "xorGate.gif";
	constructor() {
		super(true);
		this.bonusWidth = 10;
		this.paintInputLinesFlag = true;
	}
	override getRectangularLabel(attrs: AttributeSet | null): string {
		return xorRectLabel(attrs);
	}
	protected paintShape(p: InstancePainter, w: number, h: number): void {
		paintXor(p, w, h);
	}
	protected override paintDinShape(p: InstancePainter, w: number, h: number): void {
		paintDin(p, w, h, false, "xor");
	}
	protected computeOutput(inputs: Value[], n: number, state: InstanceState): Value {
		if (state.getAttr(GATE_XOR) === "odd") return computeOddParity(inputs, n);
		return computeExactlyOne(inputs, n);
	}
	getIdentity(): Value {
		return Value.FALSE;
	}
}

class XnorGate extends AbstractGate {
	readonly name = "XNOR Gate";
	readonly displayKey = "gates.xnor";
	override readonly iconName = "xnorGate.gif";
	constructor() {
		super(true);
		this.negateOutput = true;
		this.bonusWidth = 10;
		this.paintInputLinesFlag = true;
	}
	override getRectangularLabel(attrs: AttributeSet | null): string {
		return xorRectLabel(attrs);
	}
	protected paintShape(p: InstancePainter, w: number, h: number): void {
		paintXor(p, w, h);
	}
	protected override paintDinShape(p: InstancePainter, w: number, h: number): void {
		paintDin(p, w, h, false, "xnor");
	}
	protected computeOutput(inputs: Value[], n: number, state: InstanceState): Value {
		if (state.getAttr(GATE_XOR) === "odd") return computeOddParity(inputs, n).not();
		return computeExactlyOne(inputs, n).not();
	}
	getIdentity(): Value {
		return Value.FALSE;
	}
}

class OddParityGate extends AbstractGate {
	readonly name = "Odd Parity";
	readonly displayKey = "gates.oddParity";
	override readonly iconName = "parityOddGate.gif";
	constructor() {
		super();
		this.rectLabel = "2k+1";
	}
	protected paintShape(p: InstancePainter, w: number, h: number): void {
		this.paintRectangular(p, w, h);
	}
	protected computeOutput(inputs: Value[], n: number): Value {
		return computeOddParity(inputs, n);
	}
	getIdentity(): Value {
		return Value.FALSE;
	}
}

class EvenParityGate extends AbstractGate {
	readonly name = "Even Parity";
	readonly displayKey = "gates.evenParity";
	override readonly iconName = "parityEvenGate.gif";
	constructor() {
		super();
		this.rectLabel = "2k";
	}
	protected paintShape(p: InstancePainter, w: number, h: number): void {
		this.paintRectangular(p, w, h);
	}
	protected computeOutput(inputs: Value[], n: number): Value {
		return computeOddParity(inputs, n).not();
	}
	getIdentity(): Value {
		return Value.FALSE;
	}
}

export const AND_GATE = new AndGate();
export const OR_GATE = new OrGate();
export const NAND_GATE = new NandGate();
export const NOR_GATE = new NorGate();
export const XOR_GATE = new XorGate();
export const XNOR_GATE = new XnorGate();
export const ODD_PARITY_GATE = new OddParityGate();
export const EVEN_PARITY_GATE = new EvenParityGate();

AbstractGate.orGate = OR_GATE;
