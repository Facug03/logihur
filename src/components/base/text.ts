// Port of com.cburch.logisim.std.base.{Text, TextAttributes}.

import { type AnyAttribute, AttributeSet, fontAttr, optionAttr, stringAttr } from "@/engine/attributes";
import { ComponentFactory, type Instance, type InstancePainter } from "@/engine/component";
import { Bounds, locX, locY } from "@/engine/geom";
import {
	H_CENTER,
	H_LEFT,
	H_RIGHT,
	measureText,
	V_BASELINE,
	V_BOTTOM,
	V_CENTER,
	V_TOP,
} from "@/engine/graphics";

export const TEXT_TEXT = stringAttr("text", "text.text");
export const TEXT_FONT = fontAttr("font", "text.font");
export const TEXT_HALIGN = optionAttr("halign", "text.horzAlign", [
	{ value: "left", label: "text.alignLeft" },
	{ value: "right", label: "text.alignRight" },
	{ value: "center", label: "text.alignCenter" },
]);
export const TEXT_VALIGN = optionAttr("valign", "text.vertAlign", [
	{ value: "top", label: "text.alignTop" },
	{ value: "base", label: "text.alignBase" },
	{ value: "bottom", label: "text.alignBottom" },
	{ value: "center", label: "text.alignCenter" },
]);

function hAlign(v: string): number {
	return v === "left" ? H_LEFT : v === "right" ? H_RIGHT : H_CENTER;
}

function vAlign(v: string): number {
	switch (v) {
		case "top":
			return V_TOP;
		case "bottom":
			return V_BOTTOM;
		case "center":
			return V_CENTER;
		default:
			return V_BASELINE;
	}
}

/** TextField.getBounds relative to the anchor point. */
function textBounds(attrs: AttributeSet): Bounds {
	const text = attrs.get(TEXT_TEXT);
	if (!text) return Bounds.EMPTY;
	const m = measureText(text, attrs.get(TEXT_FONT));
	let x = 0;
	let y = 0;
	const ha = hAlign(attrs.get(TEXT_HALIGN));
	const va = vAlign(attrs.get(TEXT_VALIGN));
	if (ha === H_CENTER) x -= Math.trunc(m.width / 2);
	else if (ha === H_RIGHT) x -= m.width;
	if (va === V_TOP) y += m.ascent;
	else if (va === V_CENTER) y += Math.trunc(m.ascent / 2);
	else if (va === V_BOTTOM) y -= m.descent;
	return Bounds.create(x, y - m.ascent, m.width, m.ascent + m.descent);
}

class Text extends ComponentFactory {
	readonly name = "Text";
	readonly library = "#Base";
	readonly displayKey = "base.text";
	override readonly role = "text" as const;
	override readonly shouldSnap = false;
	override readonly iconName = "text.gif";

	createAttributeSet(): AttributeSet {
		const a = new AttributeSet();
		a.set(TEXT_TEXT, "");
		a.set(TEXT_FONT, { family: "SansSerif", style: "plain", size: 12 });
		a.set(TEXT_HALIGN, "center");
		a.set(TEXT_VALIGN, "base");
		return a;
	}

	getAttributes(): AnyAttribute[] {
		return [TEXT_TEXT, TEXT_FONT, TEXT_HALIGN, TEXT_VALIGN];
	}

	getOffsetBounds(attrs: AttributeSet): Bounds {
		return textBounds(attrs);
	}

	override contains(instance: Instance, dx: number, dy: number): boolean {
		const b = textBounds(instance.attrs);
		if (b.width < 4 || b.height < 4) return b.add(Bounds.create(-2, -2, 4, 4)).contains(dx, dy);
		return b.contains(dx, dy);
	}

	propagate(): void {
		// nothing to do
	}

	override paintGhost(painter: InstancePainter): void {
		this.paintInstance(painter);
	}

	paintInstance(painter: InstancePainter): void {
		const attrs = painter.attrs;
		const text = attrs.get(TEXT_TEXT);
		if (!text) return;
		const l = painter.getLocation();
		const b = textBounds(attrs);
		const g = painter.g;
		g.save();
		g.setFont(attrs.get(TEXT_FONT));
		const m = g.measureText(text);
		g.drawString(text, locX(l) + b.x, locY(l) + b.y + m.ascent);
		g.restore();
	}
}

export const TEXT = new Text();
