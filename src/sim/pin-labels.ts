// Port of com.cburch.logisim.circuit.Analyze.{getPinLabels, toValidLabel}.

import { isInputPin } from "@/components/wiring/pin";
import type { Circuit } from "@/engine/circuit";
import type { Instance } from "@/engine/component";

/** Character.isJavaIdentifierStart / isJavaIdentifierPart. */
export const isIdentStart = (c: string) => /[\p{L}\p{Nl}$_\p{Sc}\p{Pc}]/u.test(c);
export const isIdentPart = (c: string) => isIdentStart(c) || /[\p{Nd}\p{Mn}\p{Mc}]/u.test(c);

export function toValidLabel(label: string | null | undefined): string | null {
	if (label == null) return null;
	let end: string | null = null;
	let ret = "";
	let afterWhitespace = false;
	for (const ch of label) {
		let c = ch;
		if (isIdentStart(c)) {
			if (afterWhitespace) {
				c = c.toUpperCase();
				afterWhitespace = false;
			}
			ret += c;
		} else if (isIdentPart(c)) {
			if (ret.length > 0) ret += c;
			else end = (end ?? "") + c;
			afterWhitespace = false;
		} else if (/\s/.test(c)) {
			afterWhitespace = true;
		}
	}
	if (end !== null && ret.length > 0) ret += end;
	return ret.length === 0 ? null : ret;
}

/** Pins of the circuit ordered top-to-bottom, left-to-right, with names. */
export function getPinLabels(circuit: Circuit): { pin: Instance; label: string }[] {
	const pins = circuit.appearance.getPortOffsets("east").map((p) => p.pin);
	pins.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
	const labels = new Map<Instance, string>();
	const taken = new Set<string>();
	for (const pin of pins) {
		let label = toValidLabel(pin.attrs.getByName("label") as string);
		if (label !== null) {
			if (taken.has(label)) {
				let i = 2;
				while (taken.has(label + i)) i++;
				label = label + i;
			}
			labels.set(pin, label);
			taken.add(label);
		}
	}
	for (const pin of pins) {
		if (labels.has(pin)) continue;
		const options = isInputPin(pin) ? "a,b,c,d,e,f,g,h".split(",") : "x,y,z,u,v,w,s,t".split(",");
		let label = options.find((o) => !taken.has(o)) ?? null;
		if (label === null) {
			let i = 1;
			do {
				i++;
				label = `x${i}`;
			} while (taken.has(label));
		}
		taken.add(label);
		labels.set(pin, label);
	}
	return pins.map((pin) => ({ pin, label: labels.get(pin) as string }));
}
