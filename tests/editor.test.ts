import { describe, expect, it } from "vitest";
import { AND_GATE } from "@/components/gates/gates";
import { PIN } from "@/components/wiring/pin";
import { History, Transaction } from "@/editor/history";
import { repairWires, wirePath } from "@/editor/wires";
import { Circuit } from "@/engine/circuit";
import { Instance } from "@/engine/component";
import { formatLoc, loc } from "@/engine/geom";
import { Wire } from "@/engine/wire";
import { Project } from "@/project/project";
import { Simulator } from "@/sim/simulator";

const w = (x0: number, y0: number, x1: number, y1: number) => Wire.create(loc(x0, y0), loc(x1, y1));
const wireList = (c: Circuit) =>
	Array.from(c.wires.values())
		.map((x) => `${formatLoc(x.e0)}-${formatLoc(x.e1)}`)
		.sort();

function edit(c: Circuit, fn: (tx: Transaction) => void): Transaction {
	const tx = new Transaction("test");
	fn(tx);
	repairWires(tx, c);
	return tx;
}

describe("wire repair", () => {
	it("splits a wire where another one ends on it (T junction)", () => {
		const c = new Circuit("main");
		edit(c, (tx) => tx.addWire(c, w(0, 0, 100, 0)));
		edit(c, (tx) => tx.addWire(c, w(50, 0, 50, 50)));
		expect(wireList(c)).toEqual(["(0,0)-(50,0)", "(50,0)-(100,0)", "(50,0)-(50,50)"]);
	});

	it("leaves crossing wires unconnected", () => {
		const c = new Circuit("main");
		edit(c, (tx) => {
			tx.addWire(c, w(0, 0, 100, 0));
			tx.addWire(c, w(50, -50, 50, 50));
		});
		expect(c.wires.size).toBe(2);
	});

	it("merges collinear wires meeting end to end, unless something connects there", () => {
		const c = new Circuit("main");
		edit(c, (tx) => {
			tx.addWire(c, w(0, 0, 50, 0));
			tx.addWire(c, w(50, 0, 100, 0));
		});
		expect(wireList(c)).toEqual(["(0,0)-(100,0)"]);

		const d = new Circuit("main");
		const attrs = PIN.createAttributeSet();
		edit(d, (tx) => {
			tx.addComponent(d, new Instance(PIN, loc(50, 0), attrs));
			tx.addWire(d, w(0, 0, 50, 0));
			tx.addWire(d, w(50, 0, 100, 0));
		});
		expect(d.wires.size).toBe(2);
	});

	it("merges overlapping wires and splits at component ports", () => {
		const c = new Circuit("main");
		const and = AND_GATE.createAttributeSet();
		edit(c, (tx) => {
			tx.addWire(c, w(0, 60, 80, 60));
			tx.addWire(c, w(40, 60, 200, 60));
			// AND with 2 inputs at (100,80): output (100,80), inputs (50,60) and (50,100)
			and.setByName("inputs", 2);
			tx.addComponent(c, new Instance(AND_GATE, loc(100, 80), and));
		});
		expect(wireList(c)).toEqual(["(0,60)-(50,60)", "(50,60)-(200,60)"]);
	});

	it("draws L-shaped wires in the initial drag direction", () => {
		expect(wirePath(loc(0, 0), loc(30, 20), true).map(String)).toEqual(["w(0,0)-(30,0)", "w(30,0)-(30,20)"]);
		expect(wirePath(loc(0, 0), loc(30, 20), false).map(String)).toEqual(["w(0,0)-(0,20)", "w(0,20)-(30,20)"]);
	});
});

describe("undo / redo", () => {
	it("restores components, wires and attributes, and simulation follows", () => {
		const project = new Project();
		const c = new Circuit("main");
		project.addCircuit(c);
		const history = new History();
		const sim = new Simulator(project, c);

		const inAttrs = PIN.createAttributeSet();
		inAttrs.setByName("tristate", false);
		inAttrs.setByName("label", "a");
		const pinIn = new Instance(PIN, loc(100, 100), inAttrs);
		const outAttrs = PIN.createAttributeSet();
		outAttrs.setByName("output", true);
		outAttrs.setByName("facing", "west");
		outAttrs.setByName("label", "x");
		const pinOut = new Instance(PIN, loc(200, 100), outAttrs);

		const tx1 = edit(c, (tx) => {
			tx.addComponent(c, pinIn);
			tx.addComponent(c, pinOut);
			tx.addWire(c, w(100, 100, 200, 100));
		});
		history.push(tx1);
		sim.setInput("a", 1);
		expect(sim.getPinValue("x").toString()).toBe("1");

		const tx2 = new Transaction("width");
		tx2.changeAttributes(c, pinOut, (a) => a.setByName("label", "y"));
		history.push(tx2);
		expect(pinOut.attrs.getByName("label")).toBe("y");

		history.undo();
		expect(pinOut.attrs.getByName("label")).toBe("x");
		history.undo();
		expect(c.components.size).toBe(0);
		expect(c.wires.size).toBe(0);
		history.redo();
		sim.propagate();
		expect(c.components.size).toBe(2);
		expect(sim.getPinValue("x").toString()).toBe("1");
	});
});
