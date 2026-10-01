import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BUTTON, JOYSTICK } from "@/components/io/controls";
import { HEX_DIGIT, LED, SEVEN_SEGMENT } from "@/components/io/displays";
import { KEYBOARD, type KeyboardData } from "@/components/io/keyboard";
import { DOT_MATRIX, type MatrixData } from "@/components/io/matrix";
import { TTY, type TtyData } from "@/components/io/tty";
import { PIN } from "@/components/wiring/pin";
import { Circuit } from "@/engine/circuit";
import type { ComponentFactory } from "@/engine/component";
import { locX, locY } from "@/engine/geom";
import { Value } from "@/engine/value";
import { readCirc } from "@/format/circ-reader";
import { writeCirc } from "@/format/circ-writer";
import { Project } from "@/project/project";
import { Simulator } from "@/sim/simulator";
import { Workspace } from "@/ui/workspace";
import { place } from "./helpers";

function setup(factory: ComponentFactory, attrs: Record<string, unknown> = {}) {
	const project = new Project(),
		circuit = new Circuit("main");
	project.addCircuit(circuit);
	project.mainCircuit = circuit;
	const comp = place(circuit, factory, 300, 200, attrs);
	for (const [i, end] of comp.ends.entries())
		if (end.type === "input")
			place(circuit, PIN, locX(end.loc), locY(end.loc), {
				label: `i${i}`,
				width: end.width,
				tristate: true,
			});
	const sim = new Simulator(project, circuit);
	for (const [i, end] of comp.ends.entries()) if (end.type === "input") sim.setInput(`i${i}`, 0);
	return {
		project,
		circuit,
		comp,
		sim,
		drive: (port: number, v: number | Value) => sim.setInput(`i${port}`, v),
	};
}
vi.useFakeTimers();
afterEach(() => vi.clearAllTimers());

describe("I/O displays", () => {
	it("records LED states including floating and error inputs", () => {
		const { comp, sim, drive } = setup(LED);
		for (const value of [Value.FALSE, Value.TRUE, Value.UNKNOWN, Value.ERROR]) {
			drive(0, value);
			expect(sim.root.getData(comp)).toBe(value);
		}
	});
	it("keeps the eight segment inputs in Logisim's order", () => {
		const { comp, sim, drive } = setup(SEVEN_SEGMENT);
		for (let i = 0; i < 8; i++) {
			drive(i, 1);
			expect(sim.root.getData(comp)).toBe(2 ** (i + 1) - 1);
		}
		drive(3, Value.UNKNOWN);
		expect(sim.root.getData(comp)).toBe(247);
	});
	it("renders hex digits, decimal point and the unknown/error dash", () => {
		const { comp, sim, drive } = setup(HEX_DIGIT);
		const expected = [
			0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x67, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71,
		];
		for (let digit = 0; digit < 16; digit++) {
			drive(0, digit);
			expect(sim.root.getData(comp)).toBe(expected[digit]);
		}
		drive(1, 1);
		expect(sim.root.getData(comp)).toBe(0xf1);
		for (const value of [Value.createUnknown(4), Value.createError(4)]) {
			drive(0, value);
			expect(sim.root.getData(comp)).toBe(0xc0);
		}
	});
});

describe("interactive controls", () => {
	it("holds a button only while pressed, and releases when poke editing ends", () => {
		const ws = new Workspace(),
			button = place(ws.viewCircuit, BUTTON, 200, 100);
		ws.propagate();
		expect(ws.viewState.getValue(button.loc)).toBe(Value.FALSE);
		ws.pokePress(button, 190, 100);
		expect(ws.viewState.getValue(button.loc)).toBe(Value.TRUE);
		ws.pokeRelease(400, 400);
		expect(ws.viewState.getValue(button.loc)).toBe(Value.FALSE);
		ws.pokePress(button, 190, 100);
		ws.setTool({ kind: "edit" });
		expect(ws.viewState.getValue(button.loc)).toBe(Value.FALSE);
	});
	it("updates the joystick during drag, clamps movement and recenters on release", () => {
		const ws = new Workspace(),
			joy = place(ws.viewCircuit, JOYSTICK, 200, 100);
		ws.propagate();
		const xy = () => joy.ends.map((e) => ws.viewState.getValue(e.loc).toIntValue());
		expect(xy()).toEqual([8, 8]);
		ws.pokePress(joy, 185, 105);
		ws.pokeDrag(1000, -1000);
		expect(xy()).toEqual([15, 1]);
		ws.pokeRelease(1000, -1000);
		expect(xy()).toEqual([8, 8]);
	});
});

describe("keyboard FIFO", () => {
	it("inserts at the caret, consumes on enabled edges and clears asynchronously", () => {
		const { project, comp, sim } = setup(KEYBOARD, { buflen: 4 });
		const ws = new Workspace();
		ws.setProject(project, "keyboard.circ");
		for (const i of [0, 1, 2]) ws.rootSimulator.setInput(`i${i}`, 0);
		ws.pokePress(comp, 320, 195);
		ws.pokeKey("A");
		ws.pokeKey("C");
		ws.pokeKeyPressed("ArrowLeft");
		ws.pokeKey("B");
		const data = ws.viewState.getData(comp) as KeyboardData;
		expect(data.buffer.join("")).toBe("ABC");
		expect(ws.viewState.getValue(comp.ends[4].loc).toIntValue()).toBe(65);
		// Drive the same circuit through Workspace's simulator.
		const driveWs = (port: number, value: number) => ws.rootSimulator.setInput(`i${port}`, value);
		driveWs(2, 1);
		driveWs(1, 1);
		expect(data.buffer.join("")).toBe("BC");
		driveWs(2, 0);
		driveWs(1, 0);
		driveWs(1, 1);
		expect(data.buffer.join("")).toBe("BC");
		ws.pokeKeyPressed("Home");
		ws.pokeKeyPressed("Delete");
		expect(data.buffer.join("")).toBe("C");
		ws.pokeKeyPressed("End");
		for (const c of "DEFG") ws.pokeKey(c);
		expect(data.buffer.join("")).toBe("CDEF");
		ws.pokeKey("\b");
		expect(data.buffer.length).toBe(4); // full buffer rejects all insertions
		driveWs(0, 1);
		expect(data.buffer).toEqual([]);
		expect(ws.viewState.getValue(comp.ends[3].loc)).toBe(Value.FALSE);
		// Keep the secondary simulator from owning resources past this test.
		sim.dispose();
	});
	it("uses falling edges and preserves ASCII control characters as data", () => {
		const { comp, sim, drive } = setup(KEYBOARD, { trigger: "falling" });
		const state = sim.root.getInstanceState(comp);
		const poker = KEYBOARD.createPoker();
		poker.keyTyped?.(state, "\b");
		poker.keyTyped?.(state, "\n");
		state.fireInvalidated();
		sim.propagate();
		expect(sim.root.getValue(comp.ends[4].loc).toIntValue()).toBe(8);
		drive(2, 1);
		drive(1, 1);
		expect((sim.root.getData(comp) as KeyboardData).buffer.length).toBe(2);
		drive(1, 0);
		expect(sim.root.getValue(comp.ends[4].loc).toIntValue()).toBe(10);
	});
});

describe("TTY", () => {
	it("wraps, scrolls, processes control characters, and honors enable/clear", () => {
		const { comp, sim, drive } = setup(TTY, { rows: 2, cols: 3 });
		drive(2, 1);
		const send = (c: string | Value) => {
			drive(3, typeof c === "string" ? c.charCodeAt(0) : c);
			drive(1, 1);
			drive(1, 0);
		};
		for (const c of "abcdefg") send(c);
		const data = sim.root.getData(comp) as TtyData;
		expect(data.lines).toEqual(["def", "g"]);
		send("\b");
		expect(data.current).toBe("");
		send("\n");
		expect(data.lines).toEqual(["", ""]);
		send(Value.createUnknown(7));
		expect(data.current).toBe("?");
		drive(2, 0);
		send("Z");
		expect(data.current).toBe("?");
		drive(0, 1);
		expect(data.lines).toEqual([""]);
	});
	it("supports falling-edge printing and a one-row terminal", () => {
		const { comp, sim, drive } = setup(TTY, { rows: 1, cols: 1, trigger: "falling" });
		drive(2, 1);
		drive(3, 65);
		drive(1, 1);
		const data = sim.root.getData(comp) as TtyData;
		expect(data.current).toBe("");
		drive(1, 0);
		expect(data.current).toBe("A");
		drive(3, 66);
		drive(1, 1);
		drive(1, 0);
		expect(data.lines).toEqual(["B"]);
	});
});

describe("LED matrix", () => {
	it("handles the single-port select variants for one row or one column", () => {
		for (const [rows, cols] of [
			[1, 3],
			[3, 1],
		]) {
			const { comp, sim, drive } = setup(DOT_MATRIX, {
				matrixrows: rows,
				matrixcols: cols,
				inputtype: "select",
			});
			expect(comp.ends.length).toBe(1);
			drive(0, 5);
			expect((sim.root.getData(comp) as MatrixData).grid).toEqual([Value.TRUE, Value.FALSE, Value.TRUE]);
		}
	});
	it("maps direct rows and columns with their most significant bits at the top/left", () => {
		for (const type of ["row", "column"]) {
			const { comp, sim, drive } = setup(DOT_MATRIX, { matrixrows: 2, matrixcols: 2, inputtype: type });
			drive(0, 2);
			drive(1, 1);
			const data = sim.root.getData(comp) as MatrixData;
			expect(data.grid).toEqual([Value.TRUE, Value.FALSE, Value.FALSE, Value.TRUE]);
		}
	});
	it("multiplexes rows, maps select columns LSB first, and expires persistence by tick", () => {
		const { comp, sim, drive } = setup(DOT_MATRIX, {
			matrixrows: 2,
			matrixcols: 2,
			inputtype: "select",
			persist: 2,
		});
		drive(0, 1);
		drive(1, 2);
		const data = sim.root.getData(comp) as MatrixData;
		expect(data.grid).toEqual([Value.TRUE, Value.FALSE, Value.FALSE, Value.FALSE]);
		drive(1, 0);
		expect(data.get(0, 0, 0)).toBe(Value.TRUE);
		expect(data.get(0, 0, 1)).toBe(Value.TRUE);
		expect(data.get(0, 0, 2)).toBe(Value.FALSE);
		drive(1, Value.createUnknown(2));
		expect(data.grid.every((v) => v === Value.ERROR)).toBe(true);
	});
});

describe(".circ I/O compatibility", () => {
	it("the example sends each queued keyboard character to TTY exactly once", () => {
		const ws = new Workspace();
		ws.openFromText(
			readFileSync(path.join(import.meta.dirname, "../public/examples/io-demo.circ"), "utf8"),
			"io-demo.circ",
		);
		const keyboard = Array.from(ws.viewCircuit.components).find((i) => i.factory === KEYBOARD);
		const tty = Array.from(ws.viewCircuit.components).find((i) => i.factory === TTY);
		if (!keyboard || !tty) throw new Error("missing demo component");
		ws.pokePress(keyboard, keyboard.x + 10, keyboard.y - 5);
		for (const char of "Hola") ws.pokeKey(char);
		for (let tick = 0; tick < 12; tick++) ws.tickOnce();
		expect((ws.viewState.getData(tty) as TtyData).lines).toEqual(["Hola"]);
		expect((ws.viewState.getData(keyboard) as KeyboardData).buffer).toEqual([]);
	});
	it("the marquee example scrolls the message in from the right", () => {
		const ws = new Workspace();
		ws.openFromText(
			readFileSync(path.join(import.meta.dirname, "../public/examples/marquee.circ"), "utf8"),
			"marquee.circ",
		);
		expect(ws.messages).toEqual([]);
		const matrix = Array.from(ws.viewCircuit.components).find((i) => i.factory === DOT_MATRIX);
		if (!matrix) throw new Error("missing demo component");
		const screen = () => {
			const data = ws.viewState.getData(matrix) as MatrixData;
			return Array.from({ length: 8 }, (_, r) =>
				Array.from({ length: 32 }, (_, c) => (data.get(r, c, Infinity) === Value.TRUE ? "#" : ".")).join(""),
			);
		};
		// one column per clock cycle (two ticks)
		for (let tick = 0; tick < 40; tick++) ws.tickOnce();
		expect(screen()).toEqual([
			"................................",
			"............#...#.#...#..###..#.",
			"............#...#.#...#.#...#.#.",
			"............#...#.##..#.#...#.#.",
			"............#...#.#.#.#.#####.##",
			"............#...#.#..##.#...#.#.",
			"............#...#.#...#.#...#.#.",
			".............###..#...#.#...#.#.",
		]);
		// the 104-column message loops forever
		for (let tick = 0; tick < 2 * 104; tick++) ws.tickOnce();
		const looped = screen();
		for (let tick = 0; tick < 2 * 104; tick++) ws.tickOnce();
		expect(screen()).toEqual(looped);
	});
	it("round-trips all eight factories and RGBA backgrounds without placeholders", () => {
		const project = new Project(),
			c = new Circuit("main");
		project.addCircuit(c);
		for (const [i, f] of [
			BUTTON,
			JOYSTICK,
			KEYBOARD,
			LED,
			SEVEN_SEGMENT,
			HEX_DIGIT,
			DOT_MATRIX,
			TTY,
		].entries())
			place(c, f, 100 + i * 300, 200);
		const copy = readCirc(writeCirc(project));
		expect(copy.messages).toEqual([]);
		expect(Array.from(copy.circuits[0].components).map((i) => i.factory.name)).toEqual(
			Array.from(c.components).map((i) => i.factory.name),
		);
		const tty = Array.from(copy.circuits[0].components).find((i) => i.factory === TTY);
		expect(tty?.attrs.getByName("bg")).toBe("#00000040");
	});
});
