// Appearance editor: shape geometry, undoable edits, saving and updating the
// circuits that use the edited subcircuit.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubcircuitFactory } from "@/components/subcircuit";
import {
	createDragged,
	createPoly,
	DEFAULT_TOOL_STYLE,
	handles,
	moveHandle,
	translate,
} from "@/editor/appearance-edit";
import type { AppearanceShape } from "@/engine/appearance";
import { readCirc } from "@/format/circ-reader";
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

describe("editor de apariencia", () => {
	it("crea y deforma figuras con sus manijas", () => {
		const rect = createDragged("rect", DEFAULT_TOOL_STYLE, 60, 40, 20, 80) as AppearanceShape;
		expect(rect).toMatchObject({ kind: "rect", x: 20, y: 40, w: 40, h: 40, rx: 0, paint: "stroke" });
		expect(createDragged("oval", DEFAULT_TOOL_STYLE, 10, 10, 10, 50)).toBeNull();
		// dragging the bottom-right corner past the top-left flips the rectangle
		expect(moveHandle(rect, 2, 0, 20)).toMatchObject({ x: 0, y: 20, w: 20, h: 20 });
		const round = createDragged("roundrect", DEFAULT_TOOL_STYLE, 0, 0, 40, 30);
		expect(round).toMatchObject({ rx: 10 });
		const curve = createDragged("curve", DEFAULT_TOOL_STYLE, 0, 0, 40, 0) as AppearanceShape;
		expect(handles(curve)).toEqual([
			[0, 0],
			[20, 20],
			[40, 0],
		]);
		const poly = createPoly(true, DEFAULT_TOOL_STYLE, [
			[0, 0],
			[10, 0],
		]);
		expect(poly).toBeNull();
		const tri = createPoly(true, DEFAULT_TOOL_STYLE, [
			[0, 0],
			[10, 0],
			[0, 10],
		]) as AppearanceShape;
		expect(handles(translate(tri, 5, 5))).toEqual([
			[5, 5],
			[15, 5],
			[5, 15],
		]);
	});

	it("edita la apariencia con deshacer, la guarda y actualiza las instancias del subcircuito", () => {
		const ws = new Workspace();
		ws.openFromText(fixture("full-adder.circ"), "full-adder.circ");
		const half = ws.project.getCircuit("half");
		const main = ws.project.getCircuit("main");
		if (!half || !main) throw new Error("fixture");
		const factory = ws.project.getSubcircuitFactory(half);
		const instance = Array.from(main.components).find((c) => c.factory === factory);
		if (!instance) throw new Error("instance");
		const widthBefore = instance.bounds.width;

		ws.setCircuit(half);
		ws.setAppearanceMode(true);
		const shapes = half.appearance.getEditableShapes();
		const wide = createDragged("rect", DEFAULT_TOOL_STYLE, 0, 0, 300, 20) as AppearanceShape;
		ws.editAppearance("Agregar rectángulo", [...shapes, wide]);
		expect(half.appearance.isDefault()).toBe(false);
		expect(instance.bounds.width).toBeGreaterThan(widthBefore);
		expect(ws.history.undoLabel()).toBe("Agregar rectángulo");

		const saved = readCirc(ws.saveToText());
		const reread = saved.getCircuit("half")?.appearance.getShapes() ?? [];
		expect(reread.some((s) => s.kind === "rect" && s.w === 300)).toBe(true);
		const savedInstance = Array.from(saved.getCircuit("main")?.components ?? []).find(
			(c) => c.factory instanceof SubcircuitFactory,
		);
		expect(savedInstance?.bounds.width).toBe(instance.bounds.width);

		ws.undo();
		expect(half.appearance.isDefault()).toBe(true);
		expect(instance.bounds.width).toBe(widthBefore);
		ws.redo();
		ws.editAppearance("Revertir apariencia", null);
		expect(half.appearance.isDefault()).toBe(true);
		expect(readCirc(ws.saveToText()).getCircuit("half")?.appearance.isDefault()).toBe(true);
	});

	it("vuelve al diseño al cambiar de circuito", () => {
		const ws = new Workspace();
		ws.addCircuit("otro");
		ws.setAppearanceMode(true);
		expect(ws.appearanceMode).toBe(true);
		ws.setCircuit(ws.project.circuits[0]);
		expect(ws.appearanceMode).toBe(false);
	});
});
