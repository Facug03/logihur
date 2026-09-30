// Graphics implementation on top of CanvasRenderingContext2D, mimicking the
// java.awt.Graphics2D calls used by Logisim's painting code.

import { DEFAULT_LABEL_FONT, type Font } from "@/engine/attributes";
import type { Graphics, PathCommand, TextMetrics } from "@/engine/graphics";

const FAMILY_MAP: Record<string, string> = {
	sansserif: "Helvetica, Arial, sans-serif",
	dialog: "Helvetica, Arial, sans-serif",
	dialoginput: "Menlo, Consolas, monospace",
	serif: "'Times New Roman', Times, serif",
	monospaced: "Menlo, Consolas, 'Courier New', monospace",
};

export function cssFont(f: Font): string {
	const family = FAMILY_MAP[f.family.toLowerCase()] ?? `'${f.family}', Helvetica, Arial, sans-serif`;
	const italic = f.style === "italic" || f.style === "bolditalic" ? "italic " : "";
	const bold = f.style === "bold" || f.style === "bolditalic" ? "bold " : "";
	return `${italic}${bold}${f.size}px ${family}`;
}

const metricsCache = new Map<string, { ascent: number; descent: number }>();

export function measureWith(ctx: CanvasRenderingContext2D, text: string, font: Font): TextMetrics {
	const css = cssFont(font);
	ctx.save();
	ctx.font = css;
	const m = ctx.measureText(text);
	let vm = metricsCache.get(css);
	if (!vm) {
		const probe = ctx.measureText("Mg");
		vm = {
			ascent: Math.round(probe.fontBoundingBoxAscent ?? font.size * 0.93),
			descent: Math.round(probe.fontBoundingBoxDescent ?? font.size * 0.22),
		};
		metricsCache.set(css, vm);
	}
	ctx.restore();
	return { width: Math.round(m.width), ascent: vm.ascent, descent: vm.descent };
}

interface GState {
	color: string;
	lineWidth: number;
	font: Font;
	alpha: number;
}

export class CanvasGraphics implements Graphics {
	private state: GState = { color: "#000000", lineWidth: 1, font: DEFAULT_LABEL_FONT, alpha: 1 };
	private readonly stack: GState[] = [];

	constructor(readonly ctx: CanvasRenderingContext2D) {
		ctx.lineCap = "square";
		ctx.lineJoin = "miter";
		ctx.miterLimit = 10;
		ctx.textBaseline = "alphabetic";
		ctx.textAlign = "left";
	}

	getColor(): string {
		return this.state.color;
	}

	setColor(color: string): void {
		this.state.color = color;
	}

	setLineWidth(width: number): void {
		this.state.lineWidth = width;
	}

	getFont(): Font {
		return this.state.font;
	}

	setFont(font: Font): void {
		this.state.font = font;
	}

	setAlpha(alpha: number): void {
		this.state.alpha = alpha;
	}

	save(): void {
		this.stack.push({ ...this.state });
		this.ctx.save();
	}

	restore(): void {
		const s = this.stack.pop();
		if (s) this.state = s;
		this.ctx.restore();
	}

	translate(dx: number, dy: number): void {
		this.ctx.translate(dx, dy);
	}

	rotate(radians: number, cx?: number, cy?: number): void {
		if (cx !== undefined && cy !== undefined) {
			this.ctx.translate(cx, cy);
			this.ctx.rotate(radians);
			this.ctx.translate(-cx, -cy);
		} else {
			this.ctx.rotate(radians);
		}
	}

	private stroke(): void {
		const ctx = this.ctx;
		ctx.globalAlpha = this.state.alpha;
		ctx.strokeStyle = this.state.color;
		ctx.lineWidth = this.state.lineWidth;
		ctx.stroke();
	}

	private fill(): void {
		const ctx = this.ctx;
		ctx.globalAlpha = this.state.alpha;
		ctx.fillStyle = this.state.color;
		ctx.fill();
	}

	drawLine(x0: number, y0: number, x1: number, y1: number): void {
		const ctx = this.ctx;
		ctx.beginPath();
		ctx.moveTo(x0, y0);
		ctx.lineTo(x1, y1);
		this.stroke();
	}

	drawRect(x: number, y: number, w: number, h: number): void {
		this.ctx.beginPath();
		this.ctx.rect(x, y, w, h);
		this.stroke();
	}

	fillRect(x: number, y: number, w: number, h: number): void {
		this.ctx.beginPath();
		this.ctx.rect(x, y, w, h);
		this.fill();
	}

	private roundRectPath(x: number, y: number, w: number, h: number, aw: number, ah: number): void {
		const ctx = this.ctx;
		const rx = Math.min(aw / 2, w / 2);
		const ry = Math.min(ah / 2, h / 2);
		ctx.beginPath();
		ctx.moveTo(x + rx, y);
		ctx.lineTo(x + w - rx, y);
		ctx.ellipse(x + w - rx, y + ry, rx, ry, 0, -Math.PI / 2, 0);
		ctx.lineTo(x + w, y + h - ry);
		ctx.ellipse(x + w - rx, y + h - ry, rx, ry, 0, 0, Math.PI / 2);
		ctx.lineTo(x + rx, y + h);
		ctx.ellipse(x + rx, y + h - ry, rx, ry, 0, Math.PI / 2, Math.PI);
		ctx.lineTo(x, y + ry);
		ctx.ellipse(x + rx, y + ry, rx, ry, 0, Math.PI, (3 * Math.PI) / 2);
		ctx.closePath();
	}

	drawRoundRect(x: number, y: number, w: number, h: number, aw: number, ah: number): void {
		this.roundRectPath(x, y, w, h, aw, ah);
		this.stroke();
	}

	fillRoundRect(x: number, y: number, w: number, h: number, aw: number, ah: number): void {
		this.roundRectPath(x, y, w, h, aw, ah);
		this.fill();
	}

	private ovalPath(x: number, y: number, w: number, h: number): void {
		this.ctx.beginPath();
		this.ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, 2 * Math.PI);
	}

	drawOval(x: number, y: number, w: number, h: number): void {
		this.ovalPath(x, y, w, h);
		this.stroke();
	}

	fillOval(x: number, y: number, w: number, h: number): void {
		this.ovalPath(x, y, w, h);
		this.fill();
	}

	private arcPath(x: number, y: number, w: number, h: number, start: number, extent: number): void {
		const a0 = (-start * Math.PI) / 180;
		const a1 = (-(start + extent) * Math.PI) / 180;
		this.ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, a0, a1, extent > 0);
	}

	drawArc(x: number, y: number, w: number, h: number, start: number, extent: number): void {
		this.ctx.beginPath();
		this.arcPath(x, y, w, h, start, extent);
		this.stroke();
	}

	fillArc(x: number, y: number, w: number, h: number, start: number, extent: number): void {
		this.ctx.beginPath();
		this.ctx.moveTo(x + w / 2, y + h / 2);
		this.arcPath(x, y, w, h, start, extent);
		this.ctx.closePath();
		this.fill();
	}

	private polyPath(xs: readonly number[], ys: readonly number[], close: boolean): void {
		const ctx = this.ctx;
		ctx.beginPath();
		for (let i = 0; i < xs.length; i++) {
			if (i === 0) ctx.moveTo(xs[i], ys[i]);
			else ctx.lineTo(xs[i], ys[i]);
		}
		if (close) ctx.closePath();
	}

	drawPolyline(xs: readonly number[], ys: readonly number[]): void {
		this.polyPath(xs, ys, false);
		this.stroke();
	}

	drawPolygon(xs: readonly number[], ys: readonly number[]): void {
		this.polyPath(xs, ys, true);
		this.stroke();
	}

	fillPolygon(xs: readonly number[], ys: readonly number[]): void {
		this.polyPath(xs, ys, true);
		this.fill();
	}

	private pathOf(path: readonly PathCommand[]): void {
		const ctx = this.ctx;
		ctx.beginPath();
		for (const c of path) {
			switch (c.op) {
				case "M":
					ctx.moveTo(c.x, c.y);
					break;
				case "L":
					ctx.lineTo(c.x, c.y);
					break;
				case "Q":
					ctx.quadraticCurveTo(c.cx, c.cy, c.x, c.y);
					break;
				case "C":
					ctx.bezierCurveTo(c.c1x, c.c1y, c.c2x, c.c2y, c.x, c.y);
					break;
				case "Z":
					ctx.closePath();
					break;
			}
		}
	}

	drawPath(path: readonly PathCommand[]): void {
		this.pathOf(path);
		this.stroke();
	}

	fillPath(path: readonly PathCommand[]): void {
		this.pathOf(path);
		this.fill();
	}

	drawString(text: string, x: number, y: number): void {
		const ctx = this.ctx;
		ctx.globalAlpha = this.state.alpha;
		ctx.font = cssFont(this.state.font);
		ctx.fillStyle = this.state.color;
		ctx.fillText(text, x, y);
	}

	measureText(text: string, font?: Font): TextMetrics {
		return measureWith(this.ctx, text, font ?? this.state.font);
	}
}
