import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PIN } from "@/components/wiring/pin";
import { loc } from "@/engine/geom";
import { readCirc } from "@/format/circ-reader";
import { Workspace } from "@/ui/workspace";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("autoguardado y feedback", () => {
	it("indica guardado sólo después de persistir y permite recuperar el circuito editado", () => {
		const data = new Map<string, string>();
		vi.stubGlobal("localStorage", {
			getItem: (key: string) => data.get(key) ?? null,
			setItem: (key: string, value: string) => data.set(key, value),
		});
		const ws = new Workspace();
		ws.selectAddTool(PIN);
		ws.placeComponent(loc(100, 100));
		expect(ws.autosaveStatus).toBe("pending");
		expect(data.size).toBe(0);
		vi.advanceTimersByTime(800);
		expect(ws.autosaveStatus).toBe("saved");
		expect(ws.dirty).toBe(true); // A browser copy doesn't mean a .circ download.
		const restored = new Workspace();
		expect(restored.restoreAutosave()).toBe(true);
		expect(restored.circuit.components.size).toBe(1);
	});

	it("informa que no se pudo guardar cuando el navegador rechaza almacenamiento", () => {
		vi.stubGlobal("localStorage", {
			setItem: () => {
				throw new Error("Quota exceeded");
			},
		});
		const ws = new Workspace();
		ws.addCircuit("otro");
		vi.advanceTimersByTime(800);
		expect(ws.autosaveStatus).toBe("error");
		expect(ws.dirty).toBe(true);
	});

	it("reemplaza un guardado pendiente al abrir otro proyecto, incluso sin editarlo", () => {
		const setItem = vi.fn();
		vi.stubGlobal("localStorage", { setItem });
		const ws = new Workspace();
		ws.addCircuit("viejo");
		vi.advanceTimersByTime(400);
		ws.openFromText(new Workspace().saveToText(), "nuevo.circ");
		vi.advanceTimersByTime(400);
		expect(setItem).not.toHaveBeenCalled();
		vi.advanceTimersByTime(400);
		expect(setItem).toHaveBeenCalledTimes(1);
		const saved = JSON.parse(setItem.mock.calls[0][1]);
		expect(saved.name).toBe("nuevo.circ");
		expect(readCirc(saved.xml).circuits.map((c) => c.name)).toEqual(["main"]);
	});
});
