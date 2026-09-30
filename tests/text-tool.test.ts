import { afterEach, describe, expect, it, vi } from "vitest";
import { TEXT, TEXT_FONT, TEXT_TEXT } from "@/components/base/text";
import { NOT_GATE } from "@/components/gates/simple-gates";
import { PIN } from "@/components/wiring/pin";
import { Circuit } from "@/engine/circuit";
import { loc } from "@/engine/geom";
import { InstanceStateImpl } from "@/engine/simulation";
import { Value } from "@/engine/value";
import { Wire } from "@/engine/wire";
import { readCirc } from "@/format/circ-reader";
import { labelBounds } from "@/ui/text-editing";
import { Workspace } from "@/ui/workspace";
import { place } from "./helpers";

vi.useFakeTimers();
afterEach(() => vi.clearAllTimers());

describe("herramienta Texto", () => {
	it("crea sin ajustar a grilla, confirma en una transacción y guarda compatible con .circ", () => {
		const ws = new Workspace();
		ws.selectTextTool();
		ws.setAttribute(TEXT_FONT, { family: "Monospaced", style: "bold", size: 16 });
		ws.beginTextEditing(103, 117);
		ws.updateTextDraft("Sumador");
		expect(ws.circuit.components.size).toBe(0);
		ws.finishTextEditing();
		const text = Array.from(ws.circuit.components)[0];
		expect([text.x, text.y]).toEqual([103, 117]);
		expect(text.attrs.get(TEXT_TEXT)).toBe("Sumador");
		expect(text.attrs.get(TEXT_FONT).size).toBe(16);
		const loaded = readCirc(ws.saveToText());
		expect(Array.from(loaded.circuits[0].components)[0].attrs.get(TEXT_TEXT)).toBe("Sumador");
		ws.undo();
		expect(ws.circuit.components.size).toBe(0);
		ws.redo();
		expect(ws.circuit.components.size).toBe(1);
	});
	it("descarta etiquetas vacías y ediciones canceladas sin ensuciar el proyecto", () => {
		const ws = new Workspace();
		ws.selectTextTool();
		ws.beginTextEditing(100, 100);
		ws.finishTextEditing();
		ws.beginTextEditing(120, 100);
		ws.updateTextDraft("Cancelar");
		ws.finishTextEditing(false);
		expect(ws.circuit.components.size).toBe(0);
		expect(ws.dirty).toBe(false);
		expect(ws.history.canUndo()).toBe(false);
	});
	it("edita texto existente, cancelar conserva el anterior y borrar es reversible", () => {
		const ws = new Workspace();
		const text = place(ws.circuit, TEXT, 100, 100, { text: "Original" });
		ws.selectTextTool();
		ws.beginTextEditing(100, 98);
		ws.updateTextDraft("Nuevo");
		ws.finishTextEditing(false);
		expect(text.attrs.get(TEXT_TEXT)).toBe("Original");
		ws.beginTextEditing(100, 98);
		ws.updateTextDraft("Nuevo");
		ws.finishTextEditing();
		expect(ws.circuit.components.size).toBe(1);
		expect(text.attrs.get(TEXT_TEXT)).toBe("Nuevo");
		ws.undo();
		expect(text.attrs.get(TEXT_TEXT)).toBe("Original");
		ws.redo();
		ws.beginTextEditing(100, 98);
		ws.updateTextDraft("");
		ws.finishTextEditing();
		expect(ws.circuit.components.size).toBe(0);
		ws.undo();
		expect(ws.circuit.components.has(text)).toBe(true);
	});
	it("agrega a un pin sin etiqueta y edita después desde la etiqueta fuera del cuerpo", () => {
		const ws = new Workspace();
		const pin = place(ws.circuit, PIN, 100, 100);
		ws.selectTextTool();
		ws.beginTextEditing(90, 100);
		ws.updateTextDraft("Entrada");
		ws.finishTextEditing();
		expect(ws.circuit.components.size).toBe(1);
		expect(pin.attrs.getByName("label")).toBe("Entrada");
		const b = labelBounds(pin);
		if (!b) throw new Error("El pin debe tener campo de etiqueta");
		ws.beginTextEditing(b.x + b.width / 2, b.y + b.height / 2);
		expect(ws.textEditing?.instance).toBe(pin);
		ws.updateTextDraft("A");
		ws.finishTextEditing();
		expect(pin.attrs.getByName("label")).toBe("A");
		ws.undo();
		expect(pin.attrs.getByName("label")).toBe("Entrada");
	});
	it("confirma al cambiar herramienta o circuito sobre el circuito original", () => {
		const ws = new Workspace();
		ws.selectTextTool();
		ws.beginTextEditing(100, 100);
		ws.updateTextDraft("Uno");
		ws.setTool({ kind: "edit" });
		expect(ws.circuit.components.size).toBe(1);
		ws.selectTextTool();
		ws.beginTextEditing(200, 200);
		ws.updateTextDraft("Dos");
		const original = ws.circuit;
		const other = new Circuit("otro");
		ws.project.addCircuit(other);
		ws.setCircuit(other);
		expect(original.components.size).toBe(2);
		expect(other.components.size).toBe(0);
		expect(ws.textEditing).toBeNull();
	});
	it("respeta la regla Java: con etiqueta existente, clic en el cuerpo inicia una etiqueta libre", () => {
		const ws = new Workspace();
		place(ws.circuit, PIN, 100, 100, { label: "A" });
		ws.selectTextTool();
		ws.beginTextEditing(100, 100);
		expect(ws.textEditing?.creating).toBe(true);
	});
});

describe("paso de simulación", () => {
	it("pausar suspende ticks automáticos y reanudar conserva la opción de ticks", () => {
		const ws = new Workspace();
		ws.setTickFrequency(4);
		ws.setTicksEnabled(true);
		vi.advanceTimersByTime(250);
		const ticks = ws.rootSimulator.propagator.getTickCount();
		expect(ticks).toBeGreaterThan(0);
		ws.setSimEnabled(false);
		vi.advanceTimersByTime(1000);
		expect(ws.rootSimulator.propagator.getTickCount()).toBe(ticks);
		expect(ws.ticksEnabled).toBe(true);
		ws.tickOnce();
		expect(ws.rootSimulator.propagator.getTickCount()).toBe(ticks + 1);
		ws.setSimEnabled(true);
		vi.advanceTimersByTime(250);
		expect(ws.rootSimulator.propagator.getTickCount()).toBe(ticks + 2);
		ws.setTicksEnabled(false);
	});

	it("avanza por retardos, marca puntos azules y no incrementa ticks", () => {
		const ws = new Workspace();
		const input = place(ws.circuit, PIN, 100, 100, { tristate: false });
		place(ws.circuit, NOT_GATE, 200, 100);
		const output = place(ws.circuit, PIN, 300, 100, { output: true });
		ws.circuit.addWire(Wire.create(loc(100, 100), loc(170, 100)));
		ws.circuit.addWire(Wire.create(loc(200, 100), loc(300, 100)));
		ws.rootSimulator.propagate();
		expect(PIN.getValue(new InstanceStateImpl(ws.viewState, output)).equals(Value.TRUE)).toBe(true);
		ws.setSimEnabled(false);
		PIN.setValue(new InstanceStateImpl(ws.viewState, input), Value.TRUE);
		ws.viewState.markComponentAsDirty(input);
		const ticks = ws.rootSimulator.propagator.getTickCount();
		ws.stepSimulation();
		expect(ws.simEnabled).toBe(false);
		expect(PIN.getValue(new InstanceStateImpl(ws.viewState, output)).equals(Value.TRUE)).toBe(true);
		for (
			let i = 0;
			i < 4 && !PIN.getValue(new InstanceStateImpl(ws.viewState, output)).equals(Value.FALSE);
			i++
		)
			ws.stepSimulation();
		expect(PIN.getValue(new InstanceStateImpl(ws.viewState, output)).equals(Value.FALSE)).toBe(true);
		expect(ws.rootSimulator.propagator.getTickCount()).toBe(ticks);
		expect(Array.from(ws.stepPoints.values()).some((points) => points.size > 0)).toBe(true);
		ws.setSimEnabled(true);
		expect(ws.stepPoints.size).toBe(0);
	});
});
