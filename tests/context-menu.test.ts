// Actions behind the Menu Tool popups and the circuit explorer menu.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AND_GATE } from "@/components/gates/gates";
import { getBitEnds, SPLITTER } from "@/components/wiring/splitter";
import { loc } from "@/engine/geom";
import { readCirc } from "@/format/circ-reader";
import { Workspace } from "@/ui/workspace";

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
});
afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

const names = (p: { circuits: { name: string }[] }) => p.circuits.map((c) => c.name);

describe("menús contextuales", () => {
	it("reordena circuitos sin cambiar el principal, con deshacer y guardado en el orden nuevo", () => {
		const ws = new Workspace();
		ws.addCircuit("b");
		ws.addCircuit("c");
		const main = ws.project.mainCircuit;
		const c = ws.project.getCircuit("c");
		if (!c) throw new Error("c");
		ws.moveCircuit(c, -1);
		ws.moveCircuit(c, -1);
		expect(names(ws.project)).toEqual(["c", "main", "b"]);
		expect(ws.project.mainCircuit).toBe(main);
		ws.moveCircuit(c, -1); // already first: nothing to do
		expect(ws.history.undoLabel()).toBe("Mover circuito arriba");
		expect(names(readCirc(ws.saveToText()))).toEqual(["c", "main", "b"]);
		ws.undo();
		ws.undo();
		expect(names(ws.project)).toEqual(["main", "b", "c"]);
		ws.redo();
		expect(names(ws.project)).toEqual(["main", "c", "b"]);
		expect(ws.project.mainCircuit).toBe(main);
	});

	it("borra un componente puntual aunque haya otra selección", () => {
		const ws = new Workspace();
		ws.selectAddTool(AND_GATE);
		const a = ws.placeComponent(loc(100, 100));
		const b = ws.placeComponent(loc(200, 200));
		if (!a || !b) throw new Error("placement");
		ws.select(b);
		ws.deleteComponent(a);
		expect(ws.circuit.components.has(a)).toBe(false);
		expect(ws.circuit.components.has(b)).toBe(true);
		ws.undo();
		expect(ws.circuit.components.has(a)).toBe(true);
	});

	it("distribuye los bits de un separador en orden ascendente y descendente", () => {
		const ws = new Workspace();
		ws.selectAddTool(SPLITTER);
		const s = ws.placeComponent(loc(100, 100));
		if (!s) throw new Error("placement");
		ws.select(s);
		ws.setAttribute(SPLITTER.getAttributes(s.attrs).find((a) => a.name === "incoming") as never, 4);
		ws.setAttribute(SPLITTER.getAttributes(s.attrs).find((a) => a.name === "fanout") as never, 2);
		expect(getBitEnds(s.attrs)).toEqual([1, 1, 2, 2]);
		expect(ws.splitterDistribution(s, 1)).toBeNull();
		ws.distributeSplitter(s, -1);
		expect(getBitEnds(s.attrs)).toEqual([2, 2, 1, 1]);
		expect(ws.splitterDistribution(s, -1)).toBeNull();
		ws.undo();
		expect(getBitEnds(s.attrs)).toEqual([1, 1, 2, 2]);
	});
});
