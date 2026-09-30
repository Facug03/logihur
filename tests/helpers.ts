import { readFileSync } from "node:fs";
import path from "node:path";
import type { Circuit } from "@/engine/circuit";
import { type ComponentFactory, Instance } from "@/engine/component";
import { loc } from "@/engine/geom";
import { Wire } from "@/engine/wire";

export function fixture(name: string): string {
	return readFileSync(path.join(__dirname, "fixtures", name), "utf8");
}

/** Place a component, setting attributes by name through the factory. */
export function place(
	circuit: Circuit,
	factory: ComponentFactory,
	x: number,
	y: number,
	values: Record<string, unknown> = {},
): Instance {
	const attrs = factory.createAttributeSet();
	for (const [name, value] of Object.entries(values)) {
		const attr = factory.getAttributes(attrs).find((a) => a.name === name);
		if (!attr) throw new Error(`${factory.name} has no attribute ${name}`);
		factory.setAttribute(attrs, attr, value);
	}
	const inst = new Instance(factory, loc(x, y), attrs);
	circuit.addComponent(inst);
	return inst;
}

/** Add a wire through a list of points (each segment must be orthogonal). */
export function wire(circuit: Circuit, ...pts: [number, number][]): void {
	for (let i = 0; i + 1 < pts.length; i++) {
		circuit.addWire(Wire.create(loc(...pts[i]), loc(...pts[i + 1])));
	}
}
