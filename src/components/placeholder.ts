// Stand-in for components of libraries not ported yet. It keeps the raw
// attributes so files round-trip unchanged, and draws a labelled box.

import { type AnyAttribute, AttributeSet, stringAttr } from "@/engine/attributes";
import { ComponentFactory, type InstancePainter } from "@/engine/component";
import { Bounds } from "@/engine/geom";
import { drawCenteredText } from "@/engine/graphics";

const rawAttrs = new Map<string, AnyAttribute>();
function rawAttr(name: string): AnyAttribute {
	let a = rawAttrs.get(name);
	if (!a) {
		a = stringAttr(name, name);
		rawAttrs.set(name, a);
	}
	return a;
}

export class PlaceholderFactory extends ComponentFactory {
	readonly displayKey = "";

	constructor(
		readonly name: string,
		readonly library: string,
	) {
		super();
	}

	createAttributeSet(): AttributeSet {
		return new AttributeSet();
	}

	getAttributes(attrs: AttributeSet): AnyAttribute[] {
		return Array.from(attrs.entries()).map(([name]) => rawAttr(name));
	}

	/** Raw attributes are always written back as they were read. */
	override getDefaultValue(): unknown {
		return null;
	}

	rawAttribute(name: string): AnyAttribute {
		return rawAttr(name);
	}

	getOffsetBounds(): Bounds {
		return Bounds.create(-30, -15, 30, 30);
	}

	propagate(): void {
		// unknown behaviour
	}

	paintInstance(painter: InstancePainter): void {
		const g = painter.g;
		const b = painter.getBounds();
		g.setColor("#999999");
		g.setLineWidth(1);
		g.drawRect(b.x, b.y, b.width, b.height);
		g.setColor("#666666");
		g.setFont({ family: "SansSerif", style: "plain", size: 8 });
		drawCenteredText(g, "?", b.x + b.width / 2, b.y + b.height / 2);
	}
}
