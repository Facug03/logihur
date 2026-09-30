// Port of com.cburch.logisim.std.gates.{CircuitDetermination, CircuitBuilder}:
// turns the analyzer's expressions into gates, pins and wires, laid out
// exactly like Logisim's "Build Circuit".

import { AbstractGate, MAX_INPUTS } from "@/components/gates/abstract-gate";
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
import { NOT_GATE } from "@/components/gates/simple-gates";
import { CONSTANT } from "@/components/wiring/constant";
import { PIN } from "@/components/wiring/pin";
import type { AttributeSet } from "@/engine/attributes";
import { type ComponentFactory, Instance } from "@/engine/component";
import { type Loc, loc, locX, locY } from "@/engine/geom";
import { Wire } from "@/engine/wire";
import type { Expression } from "./expression";
import type { AnalyzerModel } from "./model";

// --- CircuitDetermination ---------------------------------------------------

type Determination = Gate | { kind: "input"; name: string } | { kind: "value"; value: number };

class Gate {
	readonly kind = "gate";
	inputs: Determination[] = [];

	constructor(public factory: ComponentFactory) {}

	/** Ensures that all gates have only two inputs. */
	convertToTwoInputs(): void {
		if (this.inputs.length <= 2) {
			for (const a of this.inputs) if (a instanceof Gate) a.convertToTwoInputs();
			return;
		}
		const subFactory =
			this.factory === NOR_GATE ? OR_GATE : this.factory === NAND_GATE ? AND_GATE : this.factory;
		const split = Math.trunc((this.inputs.length + 1) / 2);
		const a = this.convertToTwoInputsSub(0, split, subFactory);
		const b = this.convertToTwoInputsSub(split, this.inputs.length, subFactory);
		this.inputs = [a, b];
	}

	private convertToTwoInputsSub(start: number, stop: number, subFactory: ComponentFactory): Determination {
		if (stop - start === 1) {
			const a = this.inputs[start];
			if (a instanceof Gate) a.convertToTwoInputs();
			return a;
		}
		const split = Math.trunc((start + stop + 1) / 2);
		const ret = new Gate(subFactory);
		ret.inputs.push(this.convertToTwoInputsSub(start, split, subFactory));
		ret.inputs.push(this.convertToTwoInputsSub(split, stop, subFactory));
		return ret;
	}

	/** Converts all gates to NANDs; fails with XOR/XNOR gates. */
	convertToNands(): void {
		// first recurse to clean up any children
		for (const sub of this.inputs) if (sub instanceof Gate) sub.convertToNands();
		if (this.factory === NOT_GATE) {
			this.inputs.push(this.inputs[0]);
		} else if (this.factory === AND_GATE) {
			this.notOutput();
		} else if (this.factory === OR_GATE) {
			this.notAllInputs();
		} else if (this.factory === NOR_GATE) {
			this.notAllInputs(); // the order of these two lines is significant
			this.notOutput();
		} else if (this.factory !== NAND_GATE) {
			throw new Error(`Cannot handle ${this.factory.name}`);
		}
		this.factory = NAND_GATE;
	}

	private notOutput(): void {
		const sub = new Gate(NAND_GATE);
		sub.inputs = this.inputs;
		this.inputs = [sub, sub];
	}

	private notAllInputs(): void {
		this.inputs = this.inputs.map((old) => {
			if (old instanceof Gate && old.isNandNot()) return old.inputs[0];
			const now = new Gate(NAND_GATE);
			now.inputs.push(old, old);
			return now;
		});
	}

	/** A NAND whose two inputs are the same thing: a NOT. */
	isNandNot(): boolean {
		return this.factory === NAND_GATE && this.inputs.length === 2 && this.inputs[0] === this.inputs[1];
	}

	/** Splits gates with too many inputs; XOR/XNOR with more than two become parity gates. */
	repair(): void {
		const num = this.inputs.length;
		if (num > MAX_INPUTS) {
			const newNum = Math.trunc((num + MAX_INPUTS - 1) / MAX_INPUTS);
			const oldInputs = this.inputs;
			this.inputs = [];
			let subFactory = this.factory;
			if (subFactory === NAND_GATE) subFactory = AND_GATE;
			if (subFactory === NOR_GATE) subFactory = OR_GATE;
			const per = Math.trunc(num / newNum);
			const numExtra = num - per * newNum;
			let k = 0;
			for (let i = 0; i < newNum; i++) {
				const sub = new Gate(subFactory);
				const subCount = per + (i < numExtra ? 1 : 0);
				for (let j = 0; j < subCount; j++) sub.inputs.push(oldInputs[k++]);
				this.inputs.push(sub);
			}
		}
		if (this.inputs.length > 2) {
			if (this.factory === XOR_GATE) this.factory = ODD_PARITY_GATE;
			else if (this.factory === XNOR_GATE) this.factory = EVEN_PARITY_GATE;
		}
		for (const sub of this.inputs) if (sub instanceof Gate) sub.repair();
	}
}

function binaryGate(a: Determination, b: Determination, factory: ComponentFactory): Gate {
	if (a instanceof Gate && a.factory === factory) {
		if (b instanceof Gate && b.factory === factory) a.inputs.push(...b.inputs);
		else a.inputs.push(b);
		return a;
	}
	if (b instanceof Gate && b.factory === factory) {
		b.inputs.push(a);
		return b;
	}
	const ret = new Gate(factory);
	ret.inputs.push(a, b);
	return ret;
}

const NEGATED = new Map<ComponentFactory, ComponentFactory>([
	[AND_GATE, NAND_GATE],
	[OR_GATE, NOR_GATE],
	[XOR_GATE, XNOR_GATE],
]);

function determine(e: Expression): Determination {
	switch (e.kind) {
		case "and":
			return binaryGate(determine(e.a), determine(e.b), AND_GATE);
		case "or":
			return binaryGate(determine(e.a), determine(e.b), OR_GATE);
		case "xor":
			return binaryGate(determine(e.a), determine(e.b), XOR_GATE);
		case "not": {
			const a = determine(e.a);
			const negated = a instanceof Gate ? NEGATED.get(a.factory) : undefined;
			if (a instanceof Gate && negated) {
				a.factory = negated;
				return a;
			}
			const ret = new Gate(NOT_GATE);
			ret.inputs.push(a);
			return ret;
		}
		case "var":
			return { kind: "input", name: e.name };
		case "const":
			return { kind: "value", value: e.value };
	}
}

// --- layout -------------------------------------------------------------------

interface Layout {
	/** Top edge relative to the parent's top edge. */
	y: number;
	width: number;
	height: number;
	factory: ComponentFactory | null;
	attrs: AttributeSet | null;
	/** Where the output is, relative to the top edge. */
	outputY: number;
	/** Where the right edge of the sublayouts is, relative to the left edge. */
	subX: number;
	subLayouts: Layout[];
	/** For references directly to inputs. */
	inputName: string | null;
}

const roundDown = (value: number) => Math.trunc(value / 10) * 10;
const roundUp = (value: number) => Math.trunc((value + 9) / 10) * 10;

function layout(
	width: number,
	height: number,
	outputY: number,
	factory: ComponentFactory | null,
	attrs: AttributeSet | null,
	subLayouts: Layout[],
	subX: number,
): Layout {
	return { y: 0, width, height: roundUp(height), outputY, factory, attrs, subLayouts, subX, inputName: null };
}

function makeAttrs(factory: ComponentFactory, values: Record<string, unknown>): AttributeSet {
	const attrs = factory.createAttributeSet();
	for (const [name, value] of Object.entries(values)) {
		const attr = factory.getAttributes(attrs).find((a) => a.name === name);
		if (!attr) throw new Error(`${factory.name} has no attribute ${name}`);
		factory.setAttribute(attrs, attr, value);
	}
	return attrs;
}

function layoutGates(det: Determination): Layout {
	if (!(det instanceof Gate)) {
		if (det.kind === "input") return { ...layout(0, 0, 0, null, null, [], 0), inputName: det.name };
		const attrs = makeAttrs(CONSTANT, { value: det.value });
		const bds = CONSTANT.getOffsetBounds(attrs);
		return layout(bds.width, bds.height, -bds.y, CONSTANT, attrs, [], 0);
	}

	const factory = det.factory;
	const inputs = det.inputs;

	// handle a NOT implemented with a NAND as a special case
	if (det.isNandNot() && (inputs[0] instanceof Gate || inputs[0].kind !== "input")) {
		const sub = layoutGates(inputs[0]);
		sub.y = 0;
		const attrs = makeAttrs(factory, { size: "30", inputs: 2 });

		const bds = factory.getOffsetBounds(attrs);
		const betweenWidth = sub.width === 0 ? 0 : 40;
		const width = sub.width + betweenWidth + bds.width;

		let outputY = sub.y + sub.outputY;
		let height = sub.height;
		const minOutputY = roundUp(-bds.y);
		if (minOutputY > outputY) {
			// shift everything down, or the component peeks over the top
			const dy = minOutputY - outputY;
			sub.y += dy;
			height += dy;
			outputY += dy;
		}
		const minHeight = outputY + bds.y + bds.height;
		if (minHeight > height) height = minHeight;
		return layout(width, height, outputY, factory, attrs, [sub], sub.width);
	}

	const sub: Layout[] = [];
	let subWidth = 0; // maximum width of sublayouts
	let subHeight = 0; // total height of sublayouts
	for (let i = 0; i < inputs.length; i++) {
		sub[i] = layoutGates(inputs[i]);
		if (
			inputs.length % 2 === 0 &&
			i === Math.trunc((inputs.length + 1) / 2) &&
			sub[i - 1].height + sub[i].height === 0
		) {
			// with an even number of inputs there is a 20-tall gap between
			// the middle two; keep the middle inputs at least 20 apart
			subHeight += 10;
		}
		sub[i].y = subHeight;
		subWidth = Math.max(subWidth, sub[i].width);
		subHeight += sub[i].height + 10;
	}
	subHeight -= 10;

	const attrs =
		factory === NOT_GATE
			? makeAttrs(NOT_GATE, { size: "20" })
			: makeAttrs(factory, { size: "30", inputs: sub.length });

	const bds = factory.getOffsetBounds(attrs);
	let betweenWidth = 40 + 10 * (Math.trunc(sub.length / 2) - 1);
	if (sub.length === 1) betweenWidth = 20;
	if (subWidth === 0) betweenWidth = 0;
	const width = subWidth + betweenWidth + bds.width;

	let outputY: number;
	if (sub.length % 2 === 1) {
		// odd number: match the middle input
		const i = (sub.length - 1) / 2;
		outputY = sub[i].y + sub[i].outputY;
	} else {
		// even number: halfway between the middle two inputs
		const i1 = sub.length / 2;
		const o0 = sub[i1 - 1].y + sub[i1 - 1].outputY;
		const o1 = sub[i1].y + sub[i1].outputY;
		outputY = roundDown(Math.trunc((o0 + o1) / 2));
	}
	let height = subHeight;
	const minOutputY = roundUp(-bds.y);
	if (minOutputY > outputY) {
		const dy = minOutputY - outputY;
		for (const s of sub) s.y += dy;
		height += dy;
		outputY += dy;
	}
	const minHeight = outputY + bds.y + bds.height;
	if (minHeight > height) height = minHeight;
	return layout(width, height, outputY, factory, attrs, sub, subWidth);
}

// --- placement -------------------------------------------------------------------

interface InputData {
	startX: number;
	names: string[];
	inputs: Map<string, { spineX: number; ys: Loc[] }>;
}

export interface BuiltCircuit {
	components: Instance[];
	wires: Wire[];
}

class Placement implements BuiltCircuit {
	readonly components: Instance[] = [];
	readonly wires: Wire[] = [];

	add(factory: ComponentFactory, at: Loc, attrs: AttributeSet): Instance {
		const inst = new Instance(factory, at, attrs);
		this.components.push(inst);
		return inst;
	}

	wire(a: Loc, b: Loc): void {
		this.wires.push(Wire.create(a, b));
	}
}

/**
 * @param x the left edge of where the layout goes
 * @param y the top edge of where the layout goes
 * @param output the point the layout's output must connect to
 */
function placeComponents(
	result: Placement,
	lay: Layout,
	x: number,
	y: number,
	inputData: InputData,
	output: Loc,
): void {
	if (lay.inputName !== null) {
		const input = loc((inputData.inputs.get(lay.inputName) as { spineX: number }).spineX, locY(output));
		inputData.inputs.get(lay.inputName)?.ys.push(input);
		result.wire(input, output);
		return;
	}

	const factory = lay.factory as ComponentFactory;
	const compOutput = loc(x + lay.width, locY(output));
	const parent = result.add(factory, compOutput, lay.attrs as AttributeSet);
	if (compOutput !== output) result.wire(compOutput, output);

	// handle a NOT gate pattern implemented with NAND as a special case
	if (factory === NAND_GATE && lay.subLayouts.length === 1 && lay.subLayouts[0].inputName === null) {
		const sub = lay.subLayouts[0];
		const input0 = parent.getPortLocation(1);
		const input1 = parent.getPortLocation(2);
		const midX = locX(input0) - 20;
		const subOutput = loc(midX, locY(output));
		const midInput0 = loc(midX, locY(input0));
		const midInput1 = loc(midX, locY(input1));
		result.wire(subOutput, midInput0);
		result.wire(midInput0, input0);
		result.wire(subOutput, midInput1);
		result.wire(midInput1, input1);
		placeComponents(result, sub, x + lay.subX - sub.width, y + sub.y, inputData, subOutput);
		return;
	}

	if (lay.subLayouts.length === parent.ends.length - 2 && factory instanceof AbstractGate) {
		const index = Math.trunc(lay.subLayouts.length / 2) + 1;
		const value = factory.getIdentity().toIntValue();
		result.add(CONSTANT, parent.getPortLocation(index), makeAttrs(CONSTANT, { value }));
	}

	const numSubs = lay.subLayouts.length;
	lay.subLayouts.forEach((sub, i) => {
		const subDest = parent.getPortLocation(i + 1);
		let subOutputY = y + sub.y + sub.outputY;
		if (sub.inputName !== null) {
			const destY = locY(subDest);
			if ((i === 0 && destY < subOutputY) || (i === numSubs - 1 && destY > subOutputY)) subOutputY = destY;
		}

		let subOutput: Loc;
		if (subOutputY === locY(subDest)) {
			subOutput = subDest;
		} else {
			let back: number;
			if (i < Math.trunc(numSubs / 2)) {
				// bending upward, or not
				back = subOutputY < locY(subDest) ? i : Math.trunc((numSubs - 1) / 2) - i;
			} else {
				// bending downward, or not
				back = subOutputY > locY(subDest) ? numSubs - 1 - i : i - Math.trunc(numSubs / 2);
			}
			const subOutputX = locX(subDest) - 20 - 10 * back;
			subOutput = loc(subOutputX, subOutputY);
			const mid = loc(subOutputX, locY(subDest));
			result.wire(subOutput, mid);
			result.wire(mid, subDest);
		}
		placeComponents(result, sub, x + lay.subX - sub.width, y + sub.y, inputData, subOutput);
	});
}

function placeOutput(result: Placement, at: Loc, name: string): void {
	result.add(PIN, at, makeAttrs(PIN, { facing: "west", output: true, label: name, labelloc: "north" }));
}

function placeInputs(result: Placement, inputData: InputData): void {
	const forbiddenYs: Loc[] = [];
	const curX = 40;
	let curY = 30;
	for (const name of inputData.names) {
		const single = inputData.inputs.get(name) as { spineX: number; ys: Loc[] };
		// the point where we can intersect with the spine
		const spineX = single.spineX;
		let spineLoc = loc(spineX, curY);
		if (single.ys.length > 0) {
			// search for a y that won't intersect with others (needless if
			// the pin doesn't connect with anything anyway)
			while (forbiddenYs.some((l) => locY(l) === curY)) {
				curY += 10;
				spineLoc = loc(spineX, curY);
			}
			single.ys.push(spineLoc);
		}
		const at = loc(curX, curY);
		result.add(
			PIN,
			at,
			makeAttrs(PIN, { facing: "east", output: false, tristate: false, label: name, labelloc: "north" }),
		);

		const spine = single.ys;
		if (spine.length > 0) {
			// connect the pin to the spine, then build the spine
			result.wire(at, spineLoc);
			spine.sort((a, b) => locY(a) - locY(b));
			let prev = spine[0];
			for (const cur of spine.slice(1)) {
				if (cur !== prev) {
					result.wire(prev, cur);
					prev = cur;
				}
			}
		}
		// advance y and forbid spine intersections for the next pin
		forbiddenYs.push(...single.ys);
		curY += 50;
	}
}

/** CircuitBuilder.build: components and wires of the new circuit. */
export function buildCircuit(model: AnalyzerModel, twoInputs: boolean, useNands: boolean): BuiltCircuit {
	const outputs = model.outputs.getAll();
	let maxWidth = 0;
	const layouts = outputs.map((output) => {
		const expr = model.outputExpressions.getExpression(output);
		if (expr === null) return null;
		const det = determine(expr);
		if (det instanceof Gate) {
			if (twoInputs) det.convertToTwoInputs();
			if (useNands) det.convertToNands();
			det.repair();
		}
		const lay = layoutGates(det);
		maxWidth = Math.max(maxWidth, lay.width);
		return lay;
	});

	const inputData: InputData = { startX: 0, names: [...model.inputs.getAll()], inputs: new Map() };
	let spineX = 60;
	for (const name of inputData.names) {
		inputData.inputs.set(name, { spineX, ys: [] });
		spineX += 20;
	}
	inputData.startX = spineX;

	const result = new Placement();
	const x = inputData.startX;
	let y = 10;
	const outputX = x + maxWidth + 20;
	outputs.forEach((name, i) => {
		const lay = layouts[i];
		let output: Loc;
		let height: number;
		if (lay === null) {
			output = loc(outputX, y + 20);
			height = 40;
		} else {
			const dy = lay.outputY < 20 ? 20 - lay.outputY : 0;
			height = Math.max(dy + lay.height, 40);
			output = loc(outputX, y + dy + lay.outputY);
			placeComponents(result, lay, x, y + dy, inputData, output);
		}
		placeOutput(result, output, name);
		y += height + 10;
	});
	placeInputs(result, inputData);
	return result;
}
