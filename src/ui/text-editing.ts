import { TEXT, TEXT_FONT, TEXT_TEXT } from "@/components/base/text";
import type { Attribute, Font } from "@/engine/attributes";
import type { Circuit } from "@/engine/circuit";
import type { Instance } from "@/engine/component";
import { Bounds } from "@/engine/geom";
import {
	H_CENTER,
	H_RIGHT,
	measureText,
	V_BOTTOM,
	V_CENTER,
	V_CENTER_OVERALL,
	V_TOP,
} from "@/engine/graphics";

export interface TextEditing {
	circuit: Circuit;
	instance: Instance;
	attr: Attribute<string>;
	creating: boolean;
	draft: string;
}

/** Matches the original TextField anchor and alignment, including labels outside the body. */
export function labelBounds(instance: Instance): Bounds | null {
	const field = instance.textField;
	if (!field) return null;
	const text = instance.attrs.get(field.labelAttr);
	const m = measureText(text || " ", instance.attrs.get(field.fontAttr));
	let x = field.x,
		y = field.y;
	if (field.halign === H_CENTER) x -= Math.trunc(m.width / 2);
	else if (field.halign === H_RIGHT) x -= m.width;
	if (field.valign === V_TOP) y += m.ascent;
	else if (field.valign === V_CENTER) y += Math.trunc(m.ascent / 2);
	else if (field.valign === V_CENTER_OVERALL) y += Math.trunc((m.ascent - m.descent) / 2);
	else if (field.valign === V_BOTTOM) y -= m.descent;
	return Bounds.create(x, y - m.ascent, m.width, m.ascent + m.descent);
}

export function editableAttribute(instance: Instance, x: number, y: number): Attribute<string> | null {
	if (instance.factory === TEXT)
		return instance.factory.contains(instance, x - instance.x, y - instance.y) ? TEXT_TEXT : null;
	const field = instance.textField;
	if (!field) return null;
	const hasLabel = !!instance.attrs.get(field.labelAttr);
	return (hasLabel ? labelBounds(instance)?.contains(x, y, 2) : instance.bounds.contains(x, y))
		? field.labelAttr
		: null;
}

export function textEditorGeometry(editing: TextEditing): { bounds: Bounds; font: Font } {
	const instance = editing.instance;
	if (instance.factory === TEXT) {
		const attrs = instance.attrs.clone();
		attrs.set(TEXT_TEXT, editing.draft || " ");
		const bounds = TEXT.getOffsetBounds(attrs).translate(instance.x, instance.y);
		return { bounds, font: attrs.get(TEXT_FONT) };
	}
	const field = instance.textField;
	if (!field) return { bounds: instance.bounds, font: TEXT.createAttributeSet().get(TEXT_FONT) };
	return { bounds: labelBounds(instance) as Bounds, font: instance.attrs.get(field.fontAttr) };
}
