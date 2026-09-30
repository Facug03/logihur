// Ports of com.cburch.logisim.circuit.{Splitter, SplitterFactory,
// SplitterAttributes, SplitterParameters, SplitterPainter}.

import {
	type AnyAttribute,
	type Attribute,
	AttributeSet,
	bitWidthAttr,
	intRangeAttr,
	optionAttr,
} from "@/engine/attributes";
import {
	ComponentFactory,
	type Instance,
	type InstancePainter,
	type PortDef,
	port,
} from "@/engine/component";
import { Bounds, type Direction, loc, locX, locY, manhattanTo } from "@/engine/geom";
import { drawText, H_LEFT, H_RIGHT, V_BASELINE, V_TOP } from "@/engine/graphics";
import type { SplitterLike } from "@/engine/netlist";
import { compareVersion } from "@/engine/version";
import { WIRE_WIDTH } from "@/engine/wire";
import { FACING } from "../std-attrs";

export const SPLITTER_FANOUT = intRangeAttr("fanout", "splitter.fanOut", 1, 32);
export const SPLITTER_WIDTH = bitWidthAttr("incoming", "splitter.bitWidth");
export const SPLITTER_APPEAR = optionAttr("appear", "splitter.appearance", [
	{ value: "left", label: "splitter.appearanceLeft" },
	{ value: "right", label: "splitter.appearanceRight" },
	{ value: "center", label: "splitter.appearanceCenter" },
	{ value: "legacy", label: "splitter.appearanceLegacy" },
]);

const bitAttrs: Attribute<number>[] = [];
/** "bitN": which end bit N goes to; 0 = none (saved as "none"), k = end k. */
export function splitterBitAttr(which: number): Attribute<number> {
	let a = bitAttrs[which];
	if (!a) {
		a = {
			name: `bit${which}`,
			label: "splitter.bit",
			labelArgs: [which],
			kind: "int",
			parse: (s) => (s === "none" ? 0 : 1 + Number.parseInt(s, 10)),
			format: (v) => (v === 0 ? "none" : `${v - 1}`),
		};
		bitAttrs[which] = a;
	}
	return a;
}

/** SplitterAttributes.computeDistribution */
export function computeDistribution(fanout: number, bits: number, order: number): number[] {
	const ret: number[] = new Array(bits).fill(0);
	if (order >= 0) {
		if (fanout >= bits) {
			for (let i = 0; i < bits; i++) ret[i] = i + 1;
		} else {
			const perEnd = Math.trunc(bits / fanout);
			let withExtra = bits % fanout;
			let curEnd = -1;
			let left = 0;
			for (let i = 0; i < bits; i++) {
				if (left === 0) {
					++curEnd;
					left = perEnd;
					if (withExtra > 0) {
						++left;
						--withExtra;
					}
				}
				ret[i] = 1 + curEnd;
				--left;
			}
		}
	} else if (fanout >= bits) {
		for (let i = 0; i < bits; i++) ret[i] = fanout - i;
	} else {
		const perEnd = Math.trunc(bits / fanout);
		let withExtra = bits % fanout;
		let curEnd = -1;
		let left = 0;
		for (let i = bits - 1; i >= 0; i--) {
			if (left === 0) {
				++curEnd;
				left = perEnd;
				if (withExtra > 0) {
					++left;
					--withExtra;
				}
			}
			ret[i] = 1 + curEnd;
			--left;
		}
	}
	return ret;
}

interface SplitterParameters {
	dxEnd0: number;
	dyEnd0: number;
	ddxEnd: number;
	ddyEnd: number;
	dxEndSpine: number;
	dyEndSpine: number;
	dxSpine0: number;
	dySpine0: number;
	dxSpine1: number;
	dySpine1: number;
	textAngle: number;
	halign: number;
	valign: number;
}

function parameters(attrs: AttributeSet): SplitterParameters {
	const appear = attrs.get(SPLITTER_APPEAR);
	const fanout = attrs.get(SPLITTER_FANOUT);
	const facing = attrs.get(FACING);
	let justify: number;
	if (appear === "center" || appear === "legacy") justify = 0;
	else if (appear === "right") justify = 1;
	else justify = -1;
	const width = 20;
	const offs = 6;
	if (facing === "north" || facing === "south") {
		const m = facing === "north" ? 1 : -1;
		return {
			dxEnd0: justify === 0 ? 10 * (Math.trunc((fanout + 1) / 2) - 1) : m * justify < 0 ? -10 : 10 * fanout,
			dyEnd0: -m * width,
			ddxEnd: -10,
			ddyEnd: 0,
			dxEndSpine: 0,
			dyEndSpine: m * (width - offs),
			dxSpine0: m * justify * (10 * fanout - 1),
			dySpine0: -m * offs,
			dxSpine1: m * justify * offs,
			dySpine1: -m * offs,
			textAngle: 90,
			halign: m > 0 ? H_RIGHT : H_LEFT,
			valign: m * justify <= 0 ? V_BASELINE : V_TOP,
		};
	}
	const m = facing === "west" ? -1 : 1;
	return {
		dxEnd0: m * width,
		dyEnd0: justify === 0 ? -10 * Math.trunc(fanout / 2) : m * justify > 0 ? 10 : -10 * fanout,
		ddxEnd: 0,
		ddyEnd: 10,
		dxEndSpine: -m * (width - offs),
		dyEndSpine: 0,
		dxSpine0: m * offs,
		dySpine0: m * justify * (10 * fanout - 1),
		dxSpine1: m * offs,
		dySpine1: m * justify * offs,
		textAngle: 0,
		halign: m > 0 ? H_LEFT : H_RIGHT,
		valign: m * justify < 0 ? V_TOP : V_BASELINE,
	};
}

export function getBitEnds(attrs: AttributeSet): number[] {
	const width = attrs.get(SPLITTER_WIDTH);
	const ret: number[] = [];
	for (let i = 0; i < width; i++) ret.push((attrs.getByName(`bit${i}`) as number) ?? 0);
	return ret;
}

const SPINE_WIDTH = WIRE_WIDTH + 2;
const SPINE_DOT = WIRE_WIDTH + 4;

class SplitterFactory extends ComponentFactory implements SplitterLike {
	readonly name = "Splitter";
	readonly library = "#Wiring";
	readonly displayKey = "wiring.splitter";
	override readonly role = "splitter" as const;
	override readonly facingAttr = FACING;
	override readonly iconName = "splitter.gif";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(FACING, "east");
		a.set(SPLITTER_FANOUT, 2);
		a.set(SPLITTER_WIDTH, 2);
		a.set(SPLITTER_APPEAR, "left");
		this.configureDefaults(a);
		return a;
	}

	getAttributes(attrs: AttributeSet): AnyAttribute[] {
		const ret: AnyAttribute[] = [FACING, SPLITTER_FANOUT, SPLITTER_WIDTH, SPLITTER_APPEAR];
		const width = attrs.get(SPLITTER_WIDTH);
		for (let i = 0; i < width; i++) ret.push(splitterBitAttr(i));
		return ret;
	}

	override getDefaultValue(attr: AnyAttribute, sourceVersion?: string): unknown {
		if (attr === SPLITTER_APPEAR) {
			if (sourceVersion !== undefined && compareVersion(sourceVersion, "2.6.3.202") < 0) {
				return "legacy";
			}
			return "left";
		}
		if (attr.name.startsWith("bit")) {
			// BitOutAttribute.getDefault: which + 1
			return Number.parseInt(attr.name.slice(3), 10) + 1;
		}
		return super.getDefaultValue(attr);
	}

	override setAttribute(attrs: AttributeSet, attr: AnyAttribute, value: unknown): void {
		if (attr === SPLITTER_FANOUT || attr === SPLITTER_WIDTH) {
			attrs.set(attr, value);
			this.configureDefaults(attrs);
		} else if (attr.name.startsWith("bit")) {
			const v = value as number;
			if (v >= 0 && v <= attrs.get(SPLITTER_FANOUT)) attrs.set(attr, v);
		} else {
			attrs.set(attr, value);
		}
	}

	/** SplitterAttributes.configureDefaults */
	private configureDefaults(attrs: AttributeSet): void {
		const width = attrs.get(SPLITTER_WIDTH);
		const dflt = computeDistribution(attrs.get(SPLITTER_FANOUT), width, 1);
		for (let i = 0; i < width; i++) attrs.set(splitterBitAttr(i), dflt[i]);
		for (let i = width; attrs.has(`bit${i}`); i++) attrs.delete(`bit${i}`);
	}

	getBitEnds(instance: Instance): number[] {
		return getBitEnds(instance.attrs);
	}

	getOffsetBounds(attrs: AttributeSet): Bounds {
		const fanout = attrs.get(SPLITTER_FANOUT);
		const p = parameters(attrs);
		return Bounds.create(0, 0, 1, 1)
			.addPoint(p.dxEnd0, p.dyEnd0)
			.addPoint(p.dxEnd0 + (fanout - 1) * p.ddxEnd, p.dyEnd0 + (fanout - 1) * p.ddyEnd);
	}

	override getPorts(instance: Instance): PortDef[] {
		const attrs = instance.attrs;
		const fanout = attrs.get(SPLITTER_FANOUT);
		const bitEnd = getBitEnds(attrs);
		const endWidth = new Array<number>(fanout + 1).fill(0);
		endWidth[0] = bitEnd.length;
		for (const e of bitEnd) if (e > 0) endWidth[e]++;
		const p = parameters(attrs);
		const ports: PortDef[] = [port(0, 0, "inout", bitEnd.length, "shared")];
		let x = p.dxEnd0;
		let y = p.dyEnd0;
		for (let i = 0; i < fanout; i++) {
			ports.push(port(x, y, "inout", endWidth[i + 1], "shared"));
			x += p.ddxEnd;
			y += p.ddyEnd;
		}
		return ports;
	}

	override contains(instance: Instance, dx: number, dy: number): boolean {
		if (!this.getOffsetBounds(instance.attrs).contains(dx, dy, 1)) return false;
		const facing = instance.attrs.get(FACING);
		if (facing === "east" || facing === "west") {
			return Math.abs(dx) > 5 || manhattanTo(loc(0, 0), dx, dy) <= 5;
		}
		return Math.abs(dy) > 5 || manhattanTo(loc(0, 0), dx, dy) <= 5;
	}

	propagate(): void {
		// handled by the netlist
	}

	override paintGhost(painter: InstancePainter): void {
		if (painter.getAttr(SPLITTER_APPEAR) === "legacy") this.drawLegacy(painter);
		else this.drawLines(painter);
	}

	paintInstance(painter: InstancePainter): void {
		if (painter.getAttr(SPLITTER_APPEAR) === "legacy") {
			this.drawLegacy(painter);
		} else {
			this.drawLines(painter);
			this.drawLabels(painter);
			painter.drawPorts();
		}
	}

	private drawLines(painter: InstancePainter): void {
		const attrs = painter.attrs;
		const showState = painter.showState && painter.instance !== null;
		const p = parameters(attrs);
		const origin = painter.getLocation();
		const x0 = locX(origin);
		const y0 = locY(origin);
		let x = x0 + p.dxEnd0;
		let y = y0 + p.dyEnd0;
		const g = painter.g;
		const oldColor = g.getColor();
		const fanout = attrs.get(SPLITTER_FANOUT);
		g.setLineWidth(WIRE_WIDTH);
		for (let i = 0; i < fanout; i++) {
			if (showState) g.setColor(painter.getPort(i + 1).getColor());
			g.drawLine(x, y, x + p.dxEndSpine, y + p.dyEndSpine);
			x += p.ddxEnd;
			y += p.ddyEnd;
		}
		g.setLineWidth(SPINE_WIDTH);
		g.setColor(oldColor);
		let spine0x = x0 + p.dxSpine0;
		let spine0y = y0 + p.dySpine0;
		let spine1x = x0 + p.dxSpine1;
		let spine1y = y0 + p.dySpine1;
		if (spine0x === spine1x && spine0y === spine1y) {
			spine0x = x0 + p.dxEnd0 + p.dxEndSpine;
			spine0y = y0 + p.dyEnd0 + p.dyEndSpine;
			spine1x = spine0x + (fanout - 1) * p.ddxEnd;
			spine1y = spine0y + (fanout - 1) * p.ddyEnd;
			if (p.ddxEnd === 0) {
				if (spine0y < spine1y) {
					spine0y++;
					spine1y--;
				} else {
					spine0y--;
					spine1y++;
				}
				g.drawLine(x0 + Math.trunc(p.dxSpine1 / 4), y0, spine0x, y0);
			} else {
				if (spine0x < spine1x) {
					spine0x++;
					spine1x--;
				} else {
					spine0x--;
					spine1x++;
				}
				g.drawLine(x0, y0 + Math.trunc(p.dySpine1 / 4), x0, spine0y);
			}
			if (fanout <= 1) {
				const d = SPINE_DOT;
				g.fillOval(spine0x - Math.trunc(d / 2), spine0y - Math.trunc(d / 2), d, d);
			} else {
				g.drawLine(spine0x, spine0y, spine1x, spine1y);
			}
		} else {
			g.drawPolyline(
				[spine0x, spine1x, x0 + Math.trunc(p.dxSpine1 / 4)],
				[spine0y, spine1y, y0 + Math.trunc(p.dySpine1 / 4)],
			);
		}
	}

	private drawLabels(painter: InstancePainter): void {
		const attrs = painter.attrs;
		const fanout = attrs.get(SPLITTER_FANOUT);
		const bitEnd = getBitEnds(attrs);
		const ends: (string | null)[] = new Array(fanout + 1).fill(null);
		let curEnd = -1;
		let cur0 = 0;
		for (let i = 0, n = bitEnd.length; i <= n; i++) {
			const bit = i === n ? -1 : bitEnd[i];
			if (bit !== curEnd) {
				const cur1 = i - 1;
				let toAdd: string | null;
				if (curEnd <= 0) toAdd = null;
				else if (cur0 === cur1) toAdd = `${cur0}`;
				else toAdd = `${cur0}-${cur1}`;
				if (toAdd !== null) {
					const old = ends[curEnd];
					ends[curEnd] = old === null ? toAdd : `${old},${toAdd}`;
				}
				curEnd = bit;
				cur0 = i;
			}
		}

		const g = painter.g;
		g.save();
		g.setFont({ ...g.getFont(), size: 7 });
		const p = parameters(attrs);
		const origin = painter.getLocation();
		let x = locX(origin) + p.dxEnd0 + p.dxEndSpine;
		let y = locY(origin) + p.dyEnd0 + p.dyEndSpine;
		let dx = p.ddxEnd;
		let dy = p.ddyEnd;
		if (p.textAngle !== 0) {
			g.rotate(Math.PI / 2);
			let t = -x;
			x = y;
			y = t;
			t = -dx;
			dx = dy;
			dy = t;
		}
		const halign = p.halign;
		const valign = p.valign;
		x += (halign === H_RIGHT ? -1 : 1) * (Math.trunc(SPINE_WIDTH / 2) + 1);
		y += valign === V_TOP ? 0 : -3;
		for (let i = 0; i < fanout; i++) {
			const text = ends[i + 1];
			if (text !== null) drawText(g, text, x, y, halign, valign);
			x += dx;
			y += dy;
		}
		g.restore();
	}

	private drawLegacy(painter: InstancePainter): void {
		const attrs = painter.attrs;
		const g = painter.g;
		const facing: Direction = attrs.get(FACING);
		const fanout = attrs.get(SPLITTER_FANOUT);
		const p = parameters(attrs);
		const showState = painter.showState && painter.instance !== null;
		g.setColor("#000000");
		const origin = painter.getLocation();
		const x0 = locX(origin);
		const y0 = locY(origin);
		const x1 = x0 + p.dxEnd0;
		const y1 = y0 + p.dyEnd0;
		const dx = p.ddxEnd;
		const dy = p.ddyEnd;
		if (facing === "north" || facing === "south") {
			const ySpine = Math.trunc((y0 + y1) / 2);
			g.setLineWidth(WIRE_WIDTH);
			g.drawLine(x0, y0, x0, ySpine);
			let xi = x1;
			const yi = y1;
			for (let i = 1; i <= fanout; i++) {
				if (showState) g.setColor(painter.getPort(i).getColor());
				const xSpine = xi + (xi === x0 ? 0 : xi < x0 ? 10 : -10);
				g.drawLine(xi, yi, xSpine, ySpine);
				xi += dx;
			}
			if (fanout > 3) {
				g.setLineWidth(SPINE_WIDTH);
				g.setColor("#000000");
				g.drawLine(x1 + dx, ySpine, x1 + (fanout - 2) * dx, ySpine);
			} else {
				g.setColor("#000000");
				g.fillOval(x0 - SPINE_DOT / 2, ySpine - SPINE_DOT / 2, SPINE_DOT, SPINE_DOT);
			}
		} else {
			const xSpine = Math.trunc((x0 + x1) / 2);
			g.setLineWidth(WIRE_WIDTH);
			g.drawLine(x0, y0, xSpine, y0);
			const xi = x1;
			let yi = y1;
			for (let i = 1; i <= fanout; i++) {
				if (showState) g.setColor(painter.getPort(i).getColor());
				const ySpine = yi + (yi === y0 ? 0 : yi < y0 ? 10 : -10);
				g.drawLine(xi, yi, xSpine, ySpine);
				yi += dy;
			}
			if (fanout >= 3) {
				g.setLineWidth(SPINE_WIDTH);
				g.setColor("#000000");
				g.drawLine(xSpine, y1 + dy, xSpine, y1 + (fanout - 2) * dy);
			} else {
				g.setColor("#000000");
				g.fillOval(xSpine - SPINE_DOT / 2, y0 - SPINE_DOT / 2, SPINE_DOT, SPINE_DOT);
			}
		}
		g.setLineWidth(1);
	}
}

export const SPLITTER = new SplitterFactory();
