import { describe, expect, it } from "vitest";
import { formatLoc } from "@/engine/geom";
import { readCirc } from "@/format/circ-reader";
import { writeCirc } from "@/format/circ-writer";
import { childElements, isElement, parseXml, type XmlElement } from "@/format/xml";
import { Simulator } from "@/sim/simulator";
import { fixture } from "./helpers";

/** Canonical form of an XML tree, ignoring whitespace-only text. */
function canonical(e: XmlElement): unknown {
	return {
		tag: e.tag,
		attrs: Object.fromEntries(Object.entries(e.attrs).sort()),
		children: e.children
			.filter((c) => isElement(c) || c.trim() !== "")
			.map((c) => (isElement(c) ? canonical(c) : c.trim())),
	};
}

describe("half adder (.circ from Logisim 2.7.1)", () => {
	const project = readCirc(fixture("half-adder.circ"));
	const main = project.mainCircuit;

	it("loads circuits, components and wires", () => {
		expect(project.messages).toEqual([]);
		expect(main?.name).toBe("main");
		expect(main?.components.size).toBe(6);
		expect(main?.wires.size).toBe(10);
	});

	it("computes gate ports exactly like Logisim", () => {
		const xor = Array.from(main?.components ?? []).find((c) => c.factory.name === "XOR Gate");
		expect(xor?.ends.map((e) => formatLoc(e.loc))).toEqual(["(250,110)", "(190,90)", "(190,130)"]);
		const and = Array.from(main?.components ?? []).find((c) => c.factory.name === "AND Gate");
		expect(and?.ends.map((e) => formatLoc(e.loc))).toEqual(["(250,190)", "(200,170)", "(200,210)"]);
	});

	it("simulates the truth table", () => {
		const sim = new Simulator(project, main as NonNullable<typeof main>);
		const table: string[] = [];
		for (const [a, b] of [
			[0, 0],
			[0, 1],
			[1, 0],
			[1, 1],
		]) {
			sim.setInput("A", a);
			sim.setInput("B", b);
			table.push(`${a}${b}:${sim.getPinValue("S")}${sim.getPinValue("C")}`);
		}
		expect(table).toEqual(["00:00", "01:10", "10:10", "11:01"]);
	});

	it("round-trips without losing information", () => {
		const src = fixture("half-adder.circ");
		const written = writeCirc(readCirc(src));
		expect(canonical(parseXml(written))).toEqual(canonical(parseXml(src)));
		expect(writeCirc(readCirc(written))).toBe(written);
	});

	it("omits attributes that have their default value", () => {
		const written = parseXml(writeCirc(project));
		const circuit = childElements(written, "circuit")[0];
		const xor = childElements(circuit, "comp").find((c) => c.attrs.name === "XOR Gate");
		expect(xor && childElements(xor, "a").map((a) => a.attrs.name)).toEqual(["inputs"]);
	});
});

describe("full adder built from half-adder subcircuits", () => {
	const project = readCirc(fixture("full-adder.circ"));
	const main = project.getCircuit("main");

	it("places subcircuit ports from the default appearance", () => {
		const subs = Array.from(main?.components ?? []).filter((c) => c.factory.name === "half");
		expect(subs[0].ends.map((e) => formatLoc(e.loc))).toEqual([
			"(370,100)",
			"(370,110)",
			"(400,100)",
			"(400,110)",
		]);
	});

	it("simulates all 8 combinations", () => {
		const sim = new Simulator(project, main as NonNullable<typeof main>);
		for (let n = 0; n < 8; n++) {
			const a = n & 1;
			const b = (n >> 1) & 1;
			const c = (n >> 2) & 1;
			sim.setInput("A", a);
			sim.setInput("B", b);
			sim.setInput("Cin", c);
			const total = a + b + c;
			expect(sim.getPinValue("Sum").toIntValue()).toBe(total & 1);
			expect(sim.getPinValue("Cout").toIntValue()).toBe(total >> 1);
		}
	});

	it("round-trips", () => {
		const src = fixture("full-adder.circ");
		expect(canonical(parseXml(writeCirc(readCirc(src))))).toEqual(canonical(parseXml(src)));
	});
});
