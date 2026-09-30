// Ports of std.io.{Led, SevenSegment, HexDigit}.
import { type AnyAttribute, AttributeSet, DEFAULT_LABEL_FONT } from "@/engine/attributes";
import {
	ComponentFactory,
	type Instance,
	type InstancePainter,
	type InstanceState,
	port,
} from "@/engine/component";
import { Bounds } from "@/engine/geom";
import { Value } from "@/engine/value";
import { FACING, LABEL, LABEL_FONT } from "../std-attrs";
import { IO_ACTIVE, IO_BACKGROUND, IO_LABEL_COLOR, IO_LABEL_LOC, IO_OFF, IO_ON, ioTextField } from "./common";

class Led extends ComponentFactory {
	readonly name = "LED";
	readonly library = "#I/O";
	readonly displayKey = "io.led";
	override readonly iconName = "led.gif";
	override readonly facingAttr = FACING;
	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(FACING, "west");
		a.set(IO_ON, "#f00000");
		a.set(IO_OFF, "#404040");
		a.set(IO_ACTIVE, true);
		a.set(LABEL, "");
		a.set(IO_LABEL_LOC, "center");
		a.set(LABEL_FONT, DEFAULT_LABEL_FONT);
		a.set(IO_LABEL_COLOR, "#000000");
		return a;
	}
	getAttributes(): AnyAttribute[] {
		return [FACING, IO_ON, IO_OFF, IO_ACTIVE, LABEL, IO_LABEL_LOC, LABEL_FONT, IO_LABEL_COLOR];
	}
	getOffsetBounds(a: AttributeSet): Bounds {
		return Bounds.create(0, -10, 20, 20).rotate("west", a.get(FACING), 0, 0);
	}
	override getPorts() {
		return [port(0, 0, "input", 1)];
	}
	override getTextField(i: Instance) {
		return ioTextField(i);
	}
	propagate(s: InstanceState): void {
		s.setData(s.getPort(0));
	}
	override paintGhost(p: InstancePainter): void {
		const b = p.getBounds();
		p.g.setLineWidth(2);
		p.g.drawOval(b.x + 1, b.y + 1, b.width - 2, b.height - 2);
	}
	paintInstance(p: InstancePainter): void {
		const b = p.getBounds().expand(-1),
			g = p.g;
		if (p.showState) {
			const val = p.getData<Value>() ?? Value.FALSE;
			g.setColor(
				val === (p.getAttr(IO_ACTIVE) ? Value.TRUE : Value.FALSE) ? p.getAttr(IO_ON) : p.getAttr(IO_OFF),
			);
			g.fillOval(b.x, b.y, b.width, b.height);
		}
		g.setColor("#000000");
		g.setLineWidth(2);
		g.drawOval(b.x, b.y, b.width, b.height);
		g.setLineWidth(1);
		p.drawLabel();
		p.drawPorts();
	}
}

const SEGMENTS = [
	[3, 8, 19, 4],
	[23, 10, 4, 19],
	[23, 30, 4, 19],
	[3, 47, 19, 4],
	[-2, 30, 4, 19],
	[-2, 10, 4, 19],
	[3, 28, 19, 4],
];
export function paintSevenSegments(p: InstancePainter): void {
	const b = p.getBounds(),
		g = p.g,
		summary = p.getData<number>() ?? 0;
	if (p.shouldDrawColor && p.getAttr(IO_BACKGROUND) !== "#ffffff00") {
		g.setColor(p.getAttr(IO_BACKGROUND));
		g.fillRect(b.x, b.y, b.width, b.height);
	}
	g.setColor("#000000");
	p.drawBounds();
	g.setColor("#404040");
	const desired = p.getAttr(IO_ACTIVE) === false ? 0 : 1;
	for (let i = 0; i < 8; i++) {
		if (p.showState) g.setColor(((summary >> i) & 1) === desired ? p.getAttr(IO_ON) : p.getAttr(IO_OFF));
		if (i < 7) {
			const [x, y, w, h] = SEGMENTS[i];
			g.fillRect(b.x + 5 + x, b.y + y, w, h);
		} else g.fillOval(b.x + 33, b.y + 48, 5, 5);
	}
	p.drawPorts();
}

abstract class SegmentDisplay extends ComponentFactory {
	readonly library = "#I/O";
	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(IO_ON, "#f00000");
		a.set(IO_OFF, "#dcdcdc");
		a.set(IO_BACKGROUND, "#ffffff00");
		return a;
	}
	getAttributes(): AnyAttribute[] {
		return [IO_ON, IO_OFF, IO_BACKGROUND];
	}
	paintInstance(p: InstancePainter): void {
		paintSevenSegments(p);
	}
}
class SevenSegment extends SegmentDisplay {
	readonly name = "7-Segment Display";
	readonly displayKey = "io.sevenSegment";
	override readonly iconName = "7seg.gif";
	override createAttributeSet() {
		const a = super.createAttributeSet();
		a.set(IO_ACTIVE, true);
		return a;
	}
	override getAttributes() {
		return [...super.getAttributes(), IO_ACTIVE];
	}
	getOffsetBounds() {
		return Bounds.create(-5, 0, 40, 60);
	}
	override getPorts() {
		return [
			[20, 0],
			[30, 0],
			[20, 60],
			[10, 60],
			[0, 60],
			[10, 0],
			[0, 0],
			[30, 60],
		].map(([x, y]) => port(x, y, "input", 1));
	}
	propagate(s: InstanceState): void {
		let summary = 0;
		for (let i = 0; i < 8; i++) if (s.getPort(i) === Value.TRUE) summary |= 1 << i;
		s.setData(summary);
	}
}
// Standard seven-segment bit order: a,b,c,d,e,f,g,decimal point.
const HEX_SEGMENTS = [
	0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x67, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71,
];
class HexDigit extends SegmentDisplay {
	readonly name = "Hex Digit Display";
	readonly displayKey = "io.hexDigit";
	override readonly iconName = "hexdig.gif";
	getOffsetBounds() {
		return Bounds.create(-15, -60, 40, 60);
	}
	override getPorts() {
		return [port(0, 0, "input", 4), port(10, 0, "input", 1)];
	}
	propagate(s: InstanceState): void {
		const v = s.getPort(0);
		let summary = v.isFullyDefined() ? HEX_SEGMENTS[v.toIntValue()] : 0x40;
		if (s.getPort(1) === Value.TRUE) summary |= 0x80;
		s.setData(summary);
	}
}
export const LED = new Led();
export const SEVEN_SEGMENT = new SevenSegment();
export const HEX_DIGIT = new HexDigit();
