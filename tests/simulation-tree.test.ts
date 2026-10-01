// Simulation tree: jumping to the state of a nested subcircuit instance.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubcircuitFactory } from "@/components/subcircuit";
import { Workspace } from "@/ui/workspace";
import { fixture } from "./helpers";

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
});
afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("árbol de simulación", () => {
	it("muestra el estado de la instancia elegida y vuelve a la raíz", () => {
		const ws = new Workspace();
		ws.openFromText(fixture("full-adder.circ"), "full-adder.circ");
		const halves = Array.from(ws.circuit.components).filter((c) => c.factory instanceof SubcircuitFactory);
		expect(halves.length).toBe(2);
		ws.rootSimulator.setInput("A", 1);
		ws.viewPath([halves[1]]);
		expect(ws.viewStack.length).toBe(2);
		expect(ws.viewCircuit.name).toBe("half");
		// each instance has its own state
		const first = (halves[0].factory as SubcircuitFactory).getSubstate(ws.viewStack[0].state, halves[0]);
		expect(ws.viewState).not.toBe(first);
		ws.viewPath([]);
		expect(ws.viewStack.length).toBe(1);
		expect(ws.viewCircuit.name).toBe("main");
	});
});
