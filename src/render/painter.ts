// InstancePainter implementation (port of InstancePainter +
// ComponentDrawContext helpers).

import type { Attribute, AttributeSet } from "@/engine/attributes";
import type { Circuit } from "@/engine/circuit";
import type { ComponentFactory, GateShape, Instance, InstancePainter } from "@/engine/component";
import { Bounds, type Direction, type Loc, loc, locX, locY } from "@/engine/geom";
import {
	drawText,
	type Graphics,
	H_CENTER,
	H_LEFT,
	H_RIGHT,
	V_BASELINE,
	V_BOTTOM,
	V_CENTER,
	V_CENTER_OVERALL,
	V_TOP,
} from "@/engine/graphics";
import type { CircuitState } from "@/engine/simulation";
import { Value } from "@/engine/value";

const PIN_OFFS = 2;
const PIN_RAD = 4;

export interface PaintContext {
	g: Graphics;
	circuit: Circuit;
	state: CircuitState | null;
	showState: boolean;
	printView: boolean;
	gateShape: GateShape;
}

export class CanvasInstancePainter implements InstancePainter {
	instance: Instance | null = null;
	private ghostFactory: ComponentFactory | null = null;
	private ghostAttrs: AttributeSet | null = null;
	private ghostLoc: Loc = loc(0, 0);

	constructor(private readonly ctx: PaintContext) {}

	setInstance(inst: Instance): void {
		this.instance = inst;
		this.ghostFactory = null;
	}

	setGhost(factory: ComponentFactory, attrs: AttributeSet, at: Loc): void {
		this.instance = null;
		this.ghostFactory = factory;
		this.ghostAttrs = attrs;
		this.ghostLoc = at;
	}

	get g(): Graphics {
		return this.ctx.g;
	}

	get attrs(): AttributeSet {
		return this.instance ? this.instance.attrs : (this.ghostAttrs as AttributeSet);
	}

	get showState(): boolean {
		return !this.ctx.printView && this.ctx.showState && this.ctx.state !== null;
	}

	get printView(): boolean {
		return this.ctx.printView;
	}

	get shouldDrawColor(): boolean {
		return !this.ctx.printView;
	}

	get gateShape(): GateShape {
		return this.ctx.gateShape;
	}

	getAttr<T>(attr: Attribute<T>): T {
		return this.attrs.get(attr);
	}

	getLocation(): Loc {
		return this.instance ? this.instance.loc : this.ghostLoc;
	}

	getBounds(): Bounds {
		if (this.instance) return this.instance.bounds;
		const f = this.ghostFactory as ComponentFactory;
		return f.getOffsetBounds(this.attrs).translate(locX(this.ghostLoc), locY(this.ghostLoc));
	}

	getOffsetBounds(): Bounds {
		if (this.instance) {
			return this.instance.bounds.translate(-this.instance.x, -this.instance.y);
		}
		return (this.ghostFactory as ComponentFactory).getOffsetBounds(this.attrs);
	}

	getPort(index: number): Value {
		const s = this.ctx.state;
		if (this.instance && s) return s.getValue(this.instance.ends[index].loc);
		return Value.UNKNOWN;
	}

	isPortConnected(index: number): boolean {
		if (!this.instance) return false;
		return this.ctx.circuit.isConnected(this.instance.ends[index].loc, this.instance);
	}

	getData<T>(): T | undefined {
		if (!this.instance || !this.ctx.state) return undefined;
		return this.ctx.state.getData(this.instance) as T | undefined;
	}

	drawBounds(): void {
		const g = this.g;
		g.setLineWidth(2);
		g.setColor("#000000");
		const b = this.getBounds();
		g.drawRect(b.x, b.y, b.width, b.height);
		g.setLineWidth(1);
	}

	drawRectangle(x: number, y: number, w: number, h: number, label: string): void {
		const g = this.g;
		g.setLineWidth(2);
		g.drawRect(x, y, w, h);
		if (label) {
			const m = g.measureText(label);
			if (h > 20) {
				g.drawString(label, x + Math.trunc((w - m.width) / 2), y + 2 + m.ascent);
			} else {
				g.drawString(label, x + Math.trunc((w - m.width) / 2), y + Math.trunc((h + m.ascent) / 2) - 1);
			}
		}
	}

	drawDongle(x: number, y: number): void {
		this.g.setLineWidth(2);
		this.g.drawOval(x - 4, y - 4, 9, 9);
	}

	private pinColor(pt: Loc): string {
		if (this.showState && this.ctx.state) return this.ctx.state.getValue(pt).getColor();
		return "#000000";
	}

	drawPort(index: number, label?: string, dir?: Direction): void {
		const inst = this.instance;
		if (!inst || index < 0 || index >= inst.ends.length) return;
		const g = this.g;
		const pt = inst.ends[index].loc;
		const x = locX(pt);
		const y = locY(pt);
		const cur = g.getColor();
		g.setColor(this.pinColor(pt));
		g.fillOval(x - PIN_OFFS, y - PIN_OFFS, PIN_RAD, PIN_RAD);
		g.setColor(cur);
		if (label === undefined || dir === undefined) return;
		if (dir === "east") drawText(g, label, x + 3, y, H_LEFT, V_CENTER);
		else if (dir === "west") drawText(g, label, x - 3, y, H_RIGHT, V_CENTER);
		else if (dir === "south") drawText(g, label, x, y - 3, H_CENTER, V_BASELINE);
		else drawText(g, label, x, y + 3, H_CENTER, V_TOP);
	}

	drawPorts(): void {
		const inst = this.instance;
		if (!inst) return;
		const g = this.g;
		const cur = g.getColor();
		for (const e of inst.ends) {
			g.setColor(this.pinColor(e.loc));
			g.fillOval(locX(e.loc) - PIN_OFFS, locY(e.loc) - PIN_OFFS, PIN_RAD, PIN_RAD);
		}
		g.setColor(cur);
	}

	drawClock(index: number, dir: Direction): void {
		const inst = this.instance;
		if (!inst) return;
		const g = this.g;
		const cur = g.getColor();
		g.setColor("#000000");
		g.setLineWidth(2);
		const pt = inst.ends[index].loc;
		const x = locX(pt);
		const y = locY(pt);
		const S = 4;
		const D = S - 1;
		if (dir === "north") {
			g.drawLine(x - D, y - 1, x, y - S);
			g.drawLine(x + D, y - 1, x, y - S);
		} else if (dir === "south") {
			g.drawLine(x - D, y + 1, x, y + S);
			g.drawLine(x + D, y + 1, x, y + S);
		} else if (dir === "east") {
			g.drawLine(x + 1, y - D, x + S, y);
			g.drawLine(x + 1, y + D, x + S, y);
		} else {
			g.drawLine(x - 1, y - D, x - S, y);
			g.drawLine(x - 1, y + D, x - S, y);
		}
		g.setColor(cur);
		g.setLineWidth(1);
	}

	/** InstanceTextField.draw / TextField.draw */
	drawLabel(): void {
		const inst = this.instance;
		const tf = inst?.textField;
		if (!inst || !tf) return;
		const text = inst.attrs.get(tf.labelAttr);
		if (!text) return;
		const g = this.g;
		g.save();
		const font = inst.attrs.get(tf.fontAttr);
		if (font) g.setFont(font);
		g.setColor("#000000");
		const m = g.measureText(text);
		let x = tf.x;
		let y = tf.y;
		if (tf.halign === H_CENTER) x -= Math.trunc(m.width / 2);
		else if (tf.halign === H_RIGHT) x -= m.width;
		if (tf.valign === V_TOP) y += m.ascent;
		else if (tf.valign === V_CENTER) y += Math.trunc(m.ascent / 2);
		else if (tf.valign === V_CENTER_OVERALL) y += Math.trunc((m.ascent - m.descent) / 2);
		else if (tf.valign === V_BOTTOM) y -= m.descent;
		g.drawString(text, x, y);
		g.restore();
	}
}

/** Bounds of an instance including its label (Component.getBounds(Graphics)). */
export function boundsWithLabel(inst: Instance, g: Graphics): Bounds {
	const tf = inst.textField;
	if (!tf) return inst.bounds;
	const text = inst.attrs.get(tf.labelAttr);
	if (!text) return inst.bounds;
	const m = g.measureText(text, inst.attrs.get(tf.fontAttr));
	let x = tf.x;
	let y = tf.y;
	if (tf.halign === H_CENTER) x -= Math.trunc(m.width / 2);
	else if (tf.halign === H_RIGHT) x -= m.width;
	if (tf.valign === V_TOP) y += m.ascent;
	else if (tf.valign === V_CENTER) y += Math.trunc(m.ascent / 2);
	else if (tf.valign === V_CENTER_OVERALL) y += Math.trunc((m.ascent - m.descent) / 2);
	else if (tf.valign === V_BOTTOM) y -= m.descent;
	return inst.bounds.add(Bounds.create(x, y - m.ascent, m.width, m.ascent + m.descent));
}
