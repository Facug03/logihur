import { describe, expect, it } from "vitest";
import { NAND_GATE } from "@/components/gates/gates";
import { NOT_GATE } from "@/components/gates/simple-gates";
import { CLOCK } from "@/components/wiring/clock";
import { PIN } from "@/components/wiring/pin";
import { SPLITTER } from "@/components/wiring/splitter";
import { TUNNEL } from "@/components/wiring/tunnel";
import { Circuit } from "@/engine/circuit";
import { formatLoc, loc } from "@/engine/geom";
import { Project } from "@/project/project";
import { Simulator } from "@/sim/simulator";
import { place, wire } from "./helpers";

function setup(): { project: Project; circuit: Circuit } {
	const project = new Project();
	const circuit = new Circuit("main");
	project.addCircuit(circuit);
	return { project, circuit };
}

const OUT = { facing: "west", output: true };

describe("splitter", () => {
	it("computes end locations like Logisim", () => {
		const { circuit } = setup();
		const spl = place(circuit, SPLITTER, 150, 100, { fanout: 4, incoming: 4 });
		expect(spl.ends.map((e) => formatLoc(e.loc))).toEqual([
			"(150,100)",
			"(170,60)",
			"(170,70)",
			"(170,80)",
			"(170,90)",
		]);
	});

	it("splits a bus into bits and joins it back", () => {
		const { project, circuit } = setup();
		place(circuit, PIN, 100, 100, { width: 4, tristate: false, label: "in" });
		wire(circuit, [100, 100], [150, 100]);
		place(circuit, SPLITTER, 150, 100, { fanout: 4, incoming: 4 });
		for (let i = 0; i < 4; i++) place(circuit, PIN, 170, 60 + 10 * i, { ...OUT, label: `b${i}` });
		const sim = new Simulator(project, circuit);
		sim.setInput("in", 0b1010);
		expect([0, 1, 2, 3].map((i) => sim.getPinValue(`b${i}`).toString())).toEqual(["0", "1", "0", "1"]);
	});

	it("reads bit mapping attributes (bitN) in file order", () => {
		const { circuit } = setup();
		const spl = place(circuit, SPLITTER, 0, 0, { fanout: 2, incoming: 8 });
		expect(Array.from({ length: 8 }, (_, i) => spl.attrs.getByName(`bit${i}`))).toEqual([
			1, 1, 1, 1, 2, 2, 2, 2,
		]);
	});
});

describe("tunnel", () => {
	it("connects points with the same label", () => {
		const { project, circuit } = setup();
		place(circuit, PIN, 100, 300, { tristate: false, label: "a" });
		place(circuit, TUNNEL, 100, 300, { facing: "west", label: "t" });
		place(circuit, TUNNEL, 300, 300, { facing: "east", label: "t" });
		place(circuit, PIN, 300, 300, { ...OUT, label: "x" });
		const sim = new Simulator(project, circuit);
		sim.setInput("a", 1);
		expect(sim.getPinValue("x").toString()).toBe("1");
		sim.setInput("a", 0);
		expect(sim.getPinValue("x").toString()).toBe("0");
	});
});

describe("propagation", () => {
	it("settles an undriven inverter loop at E (as Logisim does)", () => {
		const { project, circuit } = setup();
		place(circuit, NOT_GATE, 200, 500);
		wire(circuit, [200, 500], [220, 500], [220, 530], [150, 530], [150, 500], [170, 500]);
		const sim = new Simulator(project, circuit);
		expect(sim.isOscillating()).toBe(false);
		expect(sim.root.getValue(loc(200, 500)).toString()).toBe("E");
	});

	it("detects oscillation of an enabled NAND ring", () => {
		const { project, circuit } = setup();
		place(circuit, NAND_GATE, 300, 500, { inputs: 2 });
		place(circuit, PIN, 200, 480, { tristate: false, label: "en" });
		wire(circuit, [200, 480], [240, 480]);
		wire(circuit, [300, 500], [320, 500], [320, 540], [230, 540], [230, 520], [240, 520]);
		const sim = new Simulator(project, circuit);
		expect(sim.isOscillating()).toBe(false);
		sim.setInput("en", 1);
		expect(sim.isOscillating()).toBe(true);
	});

	it("marks conflicting drivers as errors", () => {
		const { project, circuit } = setup();
		place(circuit, PIN, 100, 100, { tristate: false, label: "a" });
		place(circuit, PIN, 200, 100, { tristate: false, facing: "west", label: "b" });
		place(circuit, PIN, 150, 150, { ...OUT, facing: "north", label: "x" });
		wire(circuit, [100, 100], [150, 100], [200, 100]);
		wire(circuit, [150, 100], [150, 150]);
		const sim = new Simulator(project, circuit);
		sim.setInput("a", 1);
		sim.setInput("b", 0);
		expect(sim.getPinValue("x").toString()).toBe("E");
		sim.setInput("b", 1);
		expect(sim.getPinValue("x").toString()).toBe("1");
	});

	it("runs like `logisim -tty table` until the halt pin", () => {
		const { project, circuit } = setup();
		place(circuit, CLOCK, 100, 700, { highDuration: 2, lowDuration: 2 });
		wire(circuit, [100, 700], [150, 700], [150, 750]);
		place(circuit, PIN, 150, 700, { ...OUT, label: "q" });
		place(circuit, PIN, 150, 750, { ...OUT, label: "halt" });
		const sim = new Simulator(project, circuit);
		const { lines, code } = sim.runTtyTable(10);
		expect(code).toBe(0);
		expect(lines).toEqual(["0", "1"]);
	});
});
