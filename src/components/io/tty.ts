// Port of std.io.{Tty, TtyState}.
import { type AnyAttribute, AttributeSet, intRangeAttr } from "@/engine/attributes";
import { ComponentFactory, type InstancePainter, type InstanceState, port } from "@/engine/component";
import { Bounds } from "@/engine/geom";
import { drawCenteredText } from "@/engine/graphics";
import { Value } from "@/engine/value";
import { EDGE_TRIGGER } from "../std-attrs";
import { IO_BACKGROUND, IO_COLOR, IO_FONT } from "./common";

export const TTY_ROWS = intRangeAttr("rows", "io.ttyRows", 1, 48);
export const TTY_COLS = intRangeAttr("cols", "io.ttyCols", 1, 120);
export class TtyData {
	lastClock = Value.UNKNOWN;
	completed: string[] = [];
	current = "";
	constructor(
		public rows: number,
		public columns: number,
	) {}
	clear(): void {
		this.completed = [];
		this.current = "";
	}
	resize(rows: number, columns: number): void {
		if (this.completed.length >= rows)
			this.completed = this.completed.slice(this.completed.length - rows + 1);
		this.rows = rows;
		this.columns = columns;
		this.completed = this.completed.map((s) => s.slice(0, columns));
		this.current = this.current.slice(0, columns);
	}
	private commit(): void {
		this.completed.push(this.current);
		this.current = "";
		if (this.completed.length >= this.rows) this.completed.shift();
	}
	add(ch: string): void {
		if (ch === "\f") this.clear();
		else if (ch === "\b") this.current = this.current.slice(0, -1);
		else if (ch === "\n" || ch === "\r") this.commit();
		else if (ch.charCodeAt(0) >= 32 && !(ch.charCodeAt(0) >= 127 && ch.charCodeAt(0) <= 159)) {
			if (this.current.length === this.columns) this.commit();
			this.current += ch;
		}
	}
	get lines(): string[] {
		return [...this.completed, this.current];
	}
}
class Tty extends ComponentFactory {
	readonly name = "TTY";
	readonly library = "#I/O";
	readonly displayKey = "io.tty";
	override readonly iconName = "tty.gif";
	createAttributeSet() {
		const a = new AttributeSet();
		a.set(TTY_ROWS, 8);
		a.set(TTY_COLS, 32);
		a.set(EDGE_TRIGGER, "rising");
		a.set(IO_COLOR, "#000000");
		a.set(IO_BACKGROUND, "#00000040");
		return a;
	}
	getAttributes(): AnyAttribute[] {
		return [TTY_ROWS, TTY_COLS, EDGE_TRIGGER, IO_COLOR, IO_BACKGROUND];
	}
	getOffsetBounds(a: AttributeSet) {
		const w = Math.max(30, 10 + a.get(TTY_COLS) * 7),
			h = Math.max(30, 10 + a.get(TTY_ROWS) * 15);
		return Bounds.create(0, 10 - h, w, h);
	}
	override getPorts() {
		return [
			port(20, 10, "input", 1),
			port(0, 0, "input", 1),
			port(10, 10, "input", 1),
			port(0, -10, "input", 7),
		];
	}
	getState(s: InstanceState): TtyData {
		let d = s.getData<TtyData>();
		const rows = s.getAttr(TTY_ROWS),
			cols = s.getAttr(TTY_COLS);
		if (!d) {
			d = new TtyData(rows, cols);
			s.setData(d);
		} else d.resize(rows, cols);
		return d;
	}
	propagate(s: InstanceState): void {
		const d = this.getState(s),
			clock = s.getPort(1),
			last = d.lastClock;
		d.lastClock = clock;
		if (s.getPort(0) === Value.TRUE) d.clear();
		else if (
			s.getPort(2) !== Value.FALSE &&
			(s.getAttr(EDGE_TRIGGER) === "falling"
				? last === Value.TRUE && clock === Value.FALSE
				: last === Value.FALSE && clock === Value.TRUE)
		) {
			const v = s.getPort(3);
			d.add(v.isFullyDefined() ? String.fromCharCode(v.toIntValue()) : "?");
		}
	}
	override paintGhost(p: InstancePainter): void {
		const b = p.getBounds();
		p.g.setLineWidth(2);
		p.g.drawRoundRect(b.x, b.y, b.width, b.height, 10, 10);
	}
	paintInstance(p: InstancePainter): void {
		const b = p.getBounds(),
			g = p.g;
		p.drawClock(1, "east");
		if (p.shouldDrawColor) {
			g.setColor(p.getAttr(IO_BACKGROUND));
			g.fillRoundRect(b.x, b.y, b.width, b.height, 10, 10);
		}
		g.setColor("#000000");
		g.setLineWidth(2);
		g.drawRoundRect(b.x, b.y, b.width, b.height, 10, 10);
		g.setLineWidth(1);
		for (const i of [0, 2, 3]) p.drawPort(i);
		if (!p.showState) {
			drawCenteredText(g, "TTY", b.x + Math.trunc(b.width / 2), b.y + Math.trunc(b.height / 2));
			return;
		}
		const d = p.getData<TtyData>();
		if (!d) return;
		d.resize(p.getAttr(TTY_ROWS), p.getAttr(TTY_COLS));
		g.save();
		g.setFont(IO_FONT);
		g.setColor(p.getAttr(IO_COLOR));
		const asc = g.measureText("Mg").ascent;
		let y = b.y + 5 + Math.trunc((15 + asc) / 2);
		const x = b.x + 5;
		for (let i = 0; i < p.getAttr(TTY_ROWS); i++) {
			const line = d.lines[i] ?? "";
			g.drawString(line, x, y);
			if (i === d.completed.length) {
				const xx = x + g.measureText(line).width;
				g.drawLine(xx, y - asc, xx, y);
			}
			y += 15;
		}
		g.restore();
	}
}
export const TTY = new Tty();
