// Port of std.io.Keyboard and KeyboardData (ASCII FIFO with an editing caret).
import { type AnyAttribute, AttributeSet, intRangeAttr } from "@/engine/attributes";
import {
	ComponentFactory,
	type InstancePainter,
	type InstanceState,
	type Poker,
	port,
} from "@/engine/component";
import { Bounds } from "@/engine/geom";
import { drawCenteredText, type Graphics } from "@/engine/graphics";
import { Value } from "@/engine/value";
import { EDGE_TRIGGER } from "../std-attrs";
import { IO_FONT } from "./common";

export const KEYBOARD_BUFFER = intRangeAttr("buflen", "io.keyboardBuffer", 1, 256);
const isControl = (code: number) => code < 32 || (code >= 127 && code <= 159);
export class KeyboardData {
	lastClock = Value.UNKNOWN;
	buffer: string[] = [];
	cursor = 0;
	displayStart = 0;
	displayEnd = 0;
	constructor(public capacity: number) {}
	resize(capacity: number): void {
		this.capacity = capacity;
		this.buffer.length = Math.min(this.buffer.length, capacity);
		this.cursor = Math.min(this.cursor, this.buffer.length);
	}
	clear(): void {
		this.buffer = [];
		this.cursor = 0;
		this.displayStart = 0;
		this.displayEnd = 0;
	}
	dequeue(): void {
		this.buffer.shift();
		this.cursor = Math.max(0, this.cursor - 1);
	}
	insert(ch: string): boolean {
		if (this.buffer.length >= this.capacity) return false;
		this.buffer.splice(this.cursor++, 0, ch);
		return true;
	}
	delete(): void {
		this.buffer.splice(this.cursor, 1);
	}
	get text(): string {
		return this.buffer.map((c) => (isControl(c.charCodeAt(0)) ? " " : c)).join("");
	}
	/** KeyboardData.updateDisplay: show the head and keep the caret visible. */
	updateDisplay(g: Graphics): void {
		const str = this.text,
			len = str.length,
			max = 133,
			pos = this.cursor;
		const width = (s: string) => g.measureText(s).width;
		if (width(str) <= max) {
			this.displayStart = 0;
			this.displayEnd = len;
			return;
		}
		let start = Math.min(this.displayStart, len),
			end = Math.min(this.displayEnd, len);
		const w0 = width(`${str[0]}m`),
			w1 = width("m");
		if ((start === 0 ? width(str) : w0 + width(str.slice(start))) <= max) end = len;
		if (pos <= start) {
			if (pos < start) {
				end += pos - start;
				start = pos;
			}
			if (pos === start && start > 0) {
				start--;
				end--;
			}
		}
		if (pos >= end) {
			if (pos > end) {
				start += pos - end;
				end = pos;
			}
			if (pos === end && end < len) {
				start++;
				end++;
			}
		}
		if (start <= 2) start = 0;
		const fits = (a: number, b: number) =>
			a >= b || (a >= 0 && b <= len && width(str.slice(a, b)) + (a > 0 ? w0 : 0) + (b < len ? w1 : 0) <= max);
		if (fits(start, end)) {
			while (fits(start, end + 1)) end++;
			while (fits(start - 1, end)) start--;
		} else if (pos < (start + end) / 2) {
			do {
				end--;
			} while (!fits(start, end));
		} else {
			do {
				start++;
			} while (!fits(start, end));
		}
		if (start === 1) start = 0;
		this.displayStart = start;
		this.displayEnd = end;
	}
}

class Keyboard extends ComponentFactory {
	readonly name = "Keyboard";
	readonly library = "#I/O";
	readonly displayKey = "io.keyboard";
	override readonly iconName = "keyboard.gif";
	createAttributeSet() {
		const a = new AttributeSet();
		a.set(KEYBOARD_BUFFER, 32);
		a.set(EDGE_TRIGGER, "rising");
		return a;
	}
	getAttributes(): AnyAttribute[] {
		return [KEYBOARD_BUFFER, EDGE_TRIGGER];
	}
	getOffsetBounds() {
		return Bounds.create(0, -15, 145, 25);
	}
	override getPorts() {
		return [
			port(20, 10, "input", 1),
			port(0, 0, "input", 1),
			port(10, 10, "input", 1),
			port(130, 10, "output", 1),
			port(140, 10, "output", 7),
		];
	}
	getState(s: InstanceState): KeyboardData {
		let d = s.getData<KeyboardData>();
		const len = s.getAttr(KEYBOARD_BUFFER);
		if (!d) {
			d = new KeyboardData(len);
			s.setData(d);
		} else d.resize(len);
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
		)
			d.dequeue();
		const code = d.buffer[0]?.charCodeAt(0) ?? 0;
		s.setPort(4, Value.createKnown(7, code & 0x7f), 9);
		s.setPort(3, code !== 0 ? Value.TRUE : Value.FALSE, 11);
	}
	override createPoker(): Poker {
		return {
			keyPressed: (s, key) => {
				const d = this.getState(s);
				switch (key) {
					case "Delete":
						d.delete();
						break;
					case "ArrowLeft":
						d.cursor = Math.max(0, d.cursor - 1);
						break;
					case "ArrowRight":
						d.cursor = Math.min(d.buffer.length, d.cursor + 1);
						break;
					case "Home":
						d.cursor = 0;
						break;
					case "End":
						d.cursor = d.buffer.length;
						break;
					default:
						return false;
				}
				s.fireInvalidated();
				return true;
			},
			keyTyped: (s, key) => {
				if (key.length === 1 && (!isControl(key.charCodeAt(0)) || ["\b", "\n", "\f"].includes(key))) {
					this.getState(s).insert(key);
					s.fireInvalidated();
				}
			},
			paint: (p) => {
				const d = p.getData<KeyboardData>();
				if (!d) return;
				const g = p.g,
					b = p.getBounds();
				g.save();
				g.setFont(IO_FONT);
				d.updateDisplay(g);
				const str = d.text,
					start = d.displayStart;
				const x =
					b.x +
					8 +
					(start > 0
						? g.measureText(`${str[0]}m`).width + g.measureText(str.slice(start, d.cursor)).width
						: g.measureText(str.slice(0, d.cursor)).width);
				const asc = g.measureText("Mg").ascent,
					y = b.y + Math.trunc((25 + asc) / 2);
				g.setColor("#000000");
				g.drawLine(x, y - asc, x, y);
				g.restore();
			},
		};
	}
	paintInstance(p: InstancePainter): void {
		p.drawClock(1, "east");
		p.drawBounds();
		for (const i of [0, 2, 3, 4]) p.drawPort(i);
		const b = p.getBounds(),
			g = p.g;
		if (!p.showState) {
			drawCenteredText(g, `Teclado (${p.getAttr(KEYBOARD_BUFFER)})`, b.x + 72, b.y + 12);
			return;
		}
		const d = p.getData<KeyboardData>();
		d?.resize(p.getAttr(KEYBOARD_BUFFER));
		if (!d?.buffer.length) return;
		g.save();
		g.setFont(IO_FONT);
		d.updateDisplay(g);
		const str = d.text,
			start = d.displayStart,
			end = d.displayEnd,
			asc = g.measureText("Mg").ascent;
		let x = b.x + 8;
		const y = b.y + Math.trunc((25 + asc) / 2),
			dotsWidth = g.measureText("m").width;
		const dots = (at: number) => {
			const r = Math.max(1, Math.trunc(dotsWidth / 10));
			for (let i = 0; i < 3; i++)
				if ((2 + i * 3) * r <= dotsWidth) g.fillOval(at + (1 + i * 3) * r, y - 2 * r, 2 * r, 2 * r);
		};
		if (start > 0) {
			g.drawString(str[0], x, y);
			dots(x + g.measureText(str[0]).width);
			x += g.measureText(`${str[0]}m`).width;
		}
		g.drawString(str.slice(start, end), x, y);
		if (end < str.length) dots(x + g.measureText(str.slice(start, end)).width);
		for (let i = 0; i < d.buffer.length; i++) {
			const c = d.buffer[i];
			if (!["\b", "\n", "\f"].includes(c) || !(i === 0 || (i >= start && i < end))) continue;
			const left = i === 0 ? b.x + 8 : x + g.measureText(str.slice(start, i)).width,
				right = left + g.measureText(" ").width - 1;
			if (c === "\f") g.drawRect(left + 1, y - asc, right - left - 1, asc);
			else {
				const yy = c === "\n" ? y - 3 : y - Math.trunc(asc / 2);
				if (c === "\n") g.drawLine(right, y - asc, right, yy);
				g.drawLine(left + 1, yy, right, yy);
				g.drawPolyline([left + 4, left + 1, left + 4], [yy - 3, yy, yy + 3]);
			}
		}
		g.restore();
	}
}
export const KEYBOARD = new Keyboard();
