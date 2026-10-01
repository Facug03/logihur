// Ports of NotGate, Buffer and ControlledBuffer (buffer and inverter).

import { type AnyAttribute, AttributeSet, DEFAULT_LABEL_FONT, optionAttr } from "@/engine/attributes";
import {
	ComponentFactory,
	type Instance,
	type InstancePainter,
	type InstanceState,
	type PortDef,
	port,
	type TextFieldSpec,
} from "@/engine/component";
import { Bounds, dirRadians, type Loc, loc, locX, locY, reverseDir, translateDir } from "@/engine/geom";
import { drawCenteredText, H_CENTER, H_LEFT, V_BASELINE } from "@/engine/graphics";
import { prefs } from "@/engine/prefs";
import { Value } from "@/engine/value";
import { FACING, LABEL, LABEL_FONT, WIDTH } from "../std-attrs";
import { GATE_DELAY, GATE_OUTPUT, pullOutput } from "./abstract-gate";
import { paintDin } from "./painter-din";
import { paintNot } from "./painter-shaped";

export const NOT_SIZE = optionAttr("size", "gate.size", [
	{ value: "20", label: "gate.sizeNarrow" },
	{ value: "30", label: "gate.sizeWide" },
]);

/** NotGate.configureLabel, shared with Buffer and ControlledBuffer. */
function configureLabel(instance: Instance, isRectangular: boolean, control: Loc | null): TextFieldSpec {
	const facing = instance.attrs.get(FACING);
	const bds = instance.bounds;
	let x: number;
	let y: number;
	let halign: number;
	if (facing === "north" || facing === "south") {
		x = bds.x + Math.trunc(bds.width / 2) + 2;
		y = bds.y - 2;
		halign = H_LEFT;
	} else {
		y = isRectangular ? bds.y - 2 : bds.y;
		if (control !== null && locY(control) === bds.y) {
			x = locX(control) + 2;
			halign = H_LEFT;
		} else {
			x = bds.x + Math.trunc(bds.width / 2);
			halign = H_CENTER;
		}
	}
	return { labelAttr: LABEL, fontAttr: LABEL_FONT, x, y, halign, valign: V_BASELINE };
}

/** Buffer.repair */
function repair(state: InstanceState, v: Value): Value {
	let repaired = v;
	if (state.options.gateUndefined === "error") {
		const vw = v.width;
		const ww = state.getAttr(WIDTH);
		if (!(vw === ww && v.isFullyDefined())) {
			const vs: Value[] = [];
			for (let i = 0; i < ww; i++) {
				const ini = i < vw ? v.get(i) : Value.ERROR;
				vs.push(ini.isFullyDefined() ? ini : Value.ERROR);
			}
			repaired = Value.fromBits(vs);
		}
	}
	return pullOutput(repaired, state.getAttr(GATE_OUTPUT));
}

class NotGate extends ComponentFactory {
	readonly name = "NOT Gate";
	readonly library = "#Gates";
	readonly displayKey = "gates.not";
	override readonly facingAttr = FACING;
	override readonly iconName = "notGate.gif";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(FACING, "east");
		a.set(WIDTH, 1);
		a.set(NOT_SIZE, "30");
		a.set(GATE_OUTPUT, "01");
		a.set(LABEL, "");
		a.set(LABEL_FONT, DEFAULT_LABEL_FONT);
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [FACING, WIDTH, NOT_SIZE, GATE_OUTPUT, LABEL, LABEL_FONT];
	}

	getOffsetBounds(attrs: AttributeSet): Bounds {
		const narrow = attrs.get(NOT_SIZE) === "20";
		const len = narrow ? 20 : 30;
		switch (attrs.get(FACING)) {
			case "south":
				return Bounds.create(-9, -len, 18, len);
			case "north":
				return Bounds.create(-9, 0, 18, len);
			case "west":
				return Bounds.create(0, -9, len, 18);
			default:
				return Bounds.create(-len, -9, len, 18);
		}
	}

	override getPorts(instance: Instance): PortDef[] {
		const dx = instance.attrs.get(NOT_SIZE) === "20" ? -20 : -30;
		const out = translateDir(loc(0, 0), instance.attrs.get(FACING), dx);
		return [port(0, 0, "output", WIDTH), port(locX(out), locY(out), "input", WIDTH)];
	}

	override getTextField(instance: Instance): TextFieldSpec {
		return configureLabel(instance, prefs.gateShape === "rectangular", null);
	}

	propagate(state: InstanceState): void {
		const out = repair(state, state.getPort(1).not());
		state.setPort(0, out, GATE_DELAY);
	}

	override paintGhost(painter: InstancePainter): void {
		this.paintBase(painter);
	}

	paintInstance(painter: InstancePainter): void {
		painter.g.setColor("#000000");
		this.paintBase(painter);
		painter.drawPorts();
		painter.drawLabel();
	}

	private paintBase(painter: InstancePainter): void {
		const g = painter.g;
		const facing = painter.getAttr(FACING);
		const l = painter.getLocation();
		const narrow = painter.getAttr(NOT_SIZE) === "20";
		g.save();
		g.translate(locX(l), locY(l));
		if (facing !== "east") g.rotate(-dirRadians(facing));
		if (painter.gateShape === "shaped") {
			paintNot(painter, narrow);
		} else if (painter.gateShape === "din40700") {
			paintDin(painter, narrow ? 20 : 30, 18, true, "and");
		} else {
			g.setLineWidth(2);
			if (narrow) {
				g.drawRect(-20, -9, 14, 18);
				drawCenteredText(g, "1", -13, 0);
				g.drawOval(-6, -3, 6, 6);
			} else {
				g.drawRect(-30, -9, 20, 18);
				drawCenteredText(g, "1", -20, 0);
				g.drawOval(-10, -5, 9, 9);
			}
			g.setLineWidth(1);
		}
		g.restore();
	}
}

class Buffer extends ComponentFactory {
	readonly name = "Buffer";
	readonly library = "#Gates";
	readonly displayKey = "gates.buffer";
	override readonly facingAttr = FACING;
	override readonly iconName = "bufferGate.gif";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(FACING, "east");
		a.set(WIDTH, 1);
		a.set(GATE_OUTPUT, "01");
		a.set(LABEL, "");
		a.set(LABEL_FONT, DEFAULT_LABEL_FONT);
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [FACING, WIDTH, GATE_OUTPUT, LABEL, LABEL_FONT];
	}

	getOffsetBounds(attrs: AttributeSet): Bounds {
		switch (attrs.get(FACING)) {
			case "south":
				return Bounds.create(-9, -20, 18, 20);
			case "north":
				return Bounds.create(-9, 0, 18, 20);
			case "west":
				return Bounds.create(0, -9, 20, 18);
			default:
				return Bounds.create(-20, -9, 20, 18);
		}
	}

	override getPorts(instance: Instance): PortDef[] {
		const out = translateDir(loc(0, 0), instance.attrs.get(FACING), -20);
		return [port(0, 0, "output", WIDTH), port(locX(out), locY(out), "input", WIDTH)];
	}

	override getTextField(instance: Instance): TextFieldSpec {
		return configureLabel(instance, false, null);
	}

	propagate(state: InstanceState): void {
		state.setPort(0, repair(state, state.getPort(1)), GATE_DELAY);
	}

	override paintGhost(painter: InstancePainter): void {
		this.paintBase(painter);
	}

	paintInstance(painter: InstancePainter): void {
		painter.g.setColor("#000000");
		this.paintBase(painter);
		painter.drawPorts();
		painter.drawLabel();
	}

	private paintBase(painter: InstancePainter): void {
		const g = painter.g;
		const facing = painter.getAttr(FACING);
		const l = painter.getLocation();
		g.save();
		g.translate(locX(l), locY(l));
		if (facing !== "east") g.rotate(-dirRadians(facing));
		g.setLineWidth(2);
		g.drawPolyline([0, -19, -19, 0], [0, -7, 7, 0]);
		g.restore();
	}
}

export const CONTROL_ATTR = optionAttr("control", "gate.controlSide", [
	{ value: "right", label: "gate.controlRight" },
	{ value: "left", label: "gate.controlLeft" },
]);

class ControlledBuffer extends ComponentFactory {
	readonly name: string;
	readonly library = "#Gates";
	readonly displayKey: string;
	override readonly facingAttr = FACING;
	override readonly iconName: string;

	constructor(private readonly isInverter: boolean) {
		super();
		this.name = isInverter ? "Controlled Inverter" : "Controlled Buffer";
		this.displayKey = isInverter ? "gates.controlledInverter" : "gates.controlledBuffer";
		this.iconName = isInverter ? "controlledInverter.gif" : "controlledBuffer.gif";
	}

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(FACING, "east");
		a.set(WIDTH, 1);
		if (this.isInverter) a.set(NOT_SIZE, "30");
		a.set(CONTROL_ATTR, "right");
		a.set(LABEL, "");
		a.set(LABEL_FONT, DEFAULT_LABEL_FONT);
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return this.isInverter
			? [FACING, WIDTH, NOT_SIZE, CONTROL_ATTR, LABEL, LABEL_FONT]
			: [FACING, WIDTH, CONTROL_ATTR, LABEL, LABEL_FONT];
	}

	getOffsetBounds(attrs: AttributeSet): Bounds {
		const w = this.isInverter && attrs.get(NOT_SIZE) !== "20" ? 30 : 20;
		switch (attrs.get(FACING)) {
			case "north":
				return Bounds.create(-10, 0, 20, w);
			case "south":
				return Bounds.create(-10, -w, 20, w);
			case "west":
				return Bounds.create(0, -10, w, 20);
			default:
				return Bounds.create(-w, -10, w, 20);
		}
	}

	override getPorts(instance: Instance): PortDef[] {
		const facing = instance.attrs.get(FACING);
		const bds = this.getOffsetBounds(instance.attrs);
		const d = Math.max(bds.width, bds.height) - 20;
		const loc0 = loc(0, 0);
		const loc1 = translateDir(loc0, reverseDir(facing), 20 + d);
		const side = instance.attrs.get(CONTROL_ATTR) === "left" ? 10 : -10;
		const loc2 = translateDir(loc0, reverseDir(facing), 10 + d, side);
		return [
			port(0, 0, "output", WIDTH),
			port(locX(loc1), locY(loc1), "input", WIDTH),
			port(locX(loc2), locY(loc2), "input", 1),
		];
	}

	override getTextField(instance: Instance): TextFieldSpec {
		return configureLabel(instance, false, instance.getPortLocation(2));
	}

	propagate(state: InstanceState): void {
		const control = state.getPort(2);
		const width = state.getAttr(WIDTH);
		if (control === Value.TRUE) {
			const input = state.getPort(1);
			state.setPort(0, this.isInverter ? input.not() : input, GATE_DELAY);
		} else if (control === Value.ERROR || control === Value.UNKNOWN) {
			state.setPort(0, Value.createError(width), GATE_DELAY);
		} else {
			let out: Value;
			if (control === Value.NIL && state.options.gateUndefined === "error") {
				out = Value.createError(width);
			} else {
				out = Value.createUnknown(width);
			}
			state.setPort(0, out, GATE_DELAY);
		}
	}

	override paintGhost(painter: InstancePainter): void {
		this.paintShape(painter);
	}

	paintInstance(painter: InstancePainter): void {
		const face = painter.getAttr(FACING);
		const g = painter.g;
		const inst = painter.instance;
		if (inst) {
			g.setLineWidth(3);
			const pt0 = inst.getPortLocation(2);
			const side = painter.getAttr(CONTROL_ATTR) === "left" ? 6 : -6;
			const pt1 = translateDir(pt0, face, 0, side);
			if (painter.showState) g.setColor(painter.getPort(2).getColor());
			g.drawLine(locX(pt0), locY(pt0), locX(pt1), locY(pt1));
		}
		g.setColor("#000000");
		this.paintShape(painter);
		if (!painter.printView) {
			painter.drawPort(0);
			painter.drawPort(1);
		}
		painter.drawLabel();
	}

	private paintShape(painter: InstancePainter): void {
		const g = painter.g;
		const facing = painter.getAttr(FACING);
		const l = painter.getLocation();
		g.save();
		g.translate(locX(l), locY(l));
		if (facing !== "east") g.rotate(-dirRadians(facing));
		if (this.isInverter) {
			paintNot(painter, painter.getAttr(NOT_SIZE) === "20");
		} else {
			g.setLineWidth(2);
			g.drawPolyline([0, -19, -19, 0], [0, -7, 7, 0]);
		}
		g.restore();
	}
}

export const NOT_GATE = new NotGate();
export const BUFFER = new Buffer();
export const CONTROLLED_BUFFER = new ControlledBuffer(false);
export const CONTROLLED_INVERTER = new ControlledBuffer(true);
