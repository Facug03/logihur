import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PIN } from "@/components/wiring/pin";
import { loc } from "@/engine/geom";
import { readCirc } from "@/format/circ-reader";
import { writeCirc } from "@/format/circ-writer";
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

	it("guarda los cambios pendientes por separado al abrir otro proyecto", () => {
		const setItem = vi.fn();
		vi.stubGlobal("localStorage", { setItem });
		const ws = new Workspace();
		ws.addCircuit("viejo");
		vi.advanceTimersByTime(400);
		ws.openFromText(writeCirc(new Workspace().project), "nuevo.circ");
		expect(setItem).toHaveBeenCalledTimes(1);
		const saved = JSON.parse(setItem.mock.calls[0][1]);
		expect(saved.projects).toHaveLength(2);
		expect(saved.projects[saved.activeId].name).toBe("nuevo.circ");
		expect(readCirc(saved.projects[0].xml).circuits.map((c) => c.name)).toEqual(["main", "viejo"]);
		vi.advanceTimersByTime(800);
		expect(setItem).toHaveBeenCalledTimes(1);
		ws.returnToProject();
		expect(ws.project.circuits.map((c) => c.name)).toEqual(["main", "viejo"]);
		expect(ws.dirty).toBe(true);
	});

	it("recupera el trabajo original tras varios ejemplos, incluso al recargar", () => {
		const data = new Map<string, string>();
		vi.stubGlobal("localStorage", {
			getItem: (key: string) => data.get(key) ?? null,
			setItem: (key: string, value: string) => data.set(key, value),
		});
		const ws = new Workspace();
		ws.selectAddTool(PIN);
		ws.placeComponent(loc(100, 100));
		const example = writeCirc(new Workspace().project);
		ws.openFromText(example, "ejemplo-1.circ", "example");
		ws.addCircuit("modificado");
		ws.openFromText(example, "ejemplo-2.circ", "example");
		const restored = new Workspace();
		expect(restored.restoreAutosave()).toBe(true);
		expect(restored.fileName).toBe("ejemplo-2.circ");
		expect(restored.canReturnToProject).toBe(true);
		restored.returnToProject();
		expect(restored.fileName).toBe("sin-titulo.circ");
		expect(restored.circuit.components.size).toBe(1);
		expect(restored.dirty).toBe(true);
		const firstExample = restored.projects.find((p) => p.name === "ejemplo-1.circ");
		expect(firstExample).toBeDefined();
		restored.switchProject(firstExample?.id as number);
		expect(restored.project.circuits.map((c) => c.name)).toEqual(["main", "modificado"]);
	});

	it("crear un proyecto nuevo conserva el anterior y mantiene los archivos homónimos separados", () => {
		vi.stubGlobal("localStorage", { setItem: vi.fn() });
		const ws = new Workspace();
		ws.addCircuit("original");
		ws.newProject();
		ws.addCircuit("nuevo");
		ws.returnToProject();
		expect(ws.project.circuits.map((c) => c.name)).toEqual(["main", "original"]);
		ws.returnToProject();
		expect(ws.project.circuits.map((c) => c.name)).toEqual(["main", "nuevo"]);
		expect(ws.projects).toHaveLength(2);
	});

	it("migra el autoguardado anterior sin perder el circuito", () => {
		const original = new Workspace();
		original.addCircuit("legado");
		const data = new Map([
			["logihur.autosave", JSON.stringify({ name: "legado.circ", xml: original.saveToText() })],
		]);
		vi.stubGlobal("localStorage", {
			getItem: (key: string) => data.get(key) ?? null,
			setItem: (key: string, value: string) => data.set(key, value),
		});
		const ws = new Workspace();
		expect(ws.restoreAutosave()).toBe(true);
		ws.newProject();
		const restored = new Workspace();
		expect(restored.restoreAutosave()).toBe(true);
		restored.returnToProject();
		expect(restored.fileName).toBe("legado.circ");
		expect(restored.project.circuits.map((c) => c.name)).toEqual(["main", "legado"]);
	});

	it("persiste inmediatamente al salir de la página y conserva los proyectos en memoria si falla el guardado", () => {
		const setItem = vi.fn();
		vi.stubGlobal("localStorage", { setItem });
		const ws = new Workspace();
		ws.addCircuit("pendiente");
		ws.flushAutosave();
		expect(setItem).toHaveBeenCalledTimes(1);
		setItem.mockImplementation(() => {
			throw new Error("Quota exceeded");
		});
		ws.newProject();
		expect(ws.autosaveStatus).toBe("error");
		ws.returnToProject();
		expect(ws.project.circuits.map((c) => c.name)).toEqual(["main", "pendiente"]);
	});
});

describe("eliminar proyectos", () => {
	beforeEach(() => {
		const data = new Map<string, string>();
		vi.stubGlobal("localStorage", {
			getItem: (key: string) => data.get(key) ?? null,
			setItem: (key: string, value: string) => data.set(key, value),
		});
	});

	it("elimina el proyecto activo, vuelve al anterior y no lo restaura después de recargar", () => {
		const ws = new Workspace();
		ws.addCircuit("original");
		ws.openFromText(writeCirc(new Workspace().project), "ejemplo.circ", "example");
		ws.addCircuit("por-eliminar");
		const id = ws.projects.find((p) => p.active)?.id as number;
		ws.deleteProject(id);
		expect(ws.project.circuits.map((c) => c.name)).toEqual(["main", "original"]);
		expect(ws.dirty).toBe(true);
		expect(ws.projects.some((p) => p.id === id)).toBe(false);
		expect(ws.canReturnToProject).toBe(false);
		vi.advanceTimersByTime(800);
		const restored = new Workspace();
		expect(restored.restoreAutosave()).toBe(true);
		expect(restored.projects).toHaveLength(1);
		expect(restored.project.circuits.map((c) => c.name)).toEqual(["main", "original"]);
	});

	it("eliminar el último crea un proyecto vacío sin conservar los cambios pendientes", () => {
		const ws = new Workspace();
		ws.addCircuit("por-eliminar");
		const id = ws.projects[0].id;
		ws.deleteProject(id);
		expect(ws.projects).toHaveLength(1);
		expect(ws.projects[0].id).not.toBe(id);
		expect(ws.fileName).toBe("sin-titulo.circ");
		expect(ws.dirty).toBe(false);
		expect(ws.history.canUndo()).toBe(false);
		expect(ws.canReturnToProject).toBe(false);
		vi.advanceTimersByTime(800);
		const restored = new Workspace();
		expect(restored.restoreAutosave()).toBe(true);
		expect(restored.projects).toHaveLength(1);
		expect(restored.project.circuits.map((c) => c.name)).toEqual(["main"]);
	});

	it("elimina sólo el proyecto elegido cuando tienen el mismo nombre", () => {
		const ws = new Workspace();
		ws.addCircuit("primero");
		ws.newProject();
		ws.addCircuit("segundo");
		ws.newProject();
		const secondId = ws.projects[1].id;
		ws.deleteProject(secondId);
		expect(ws.projects).toHaveLength(2);
		expect(ws.canReturnToProject).toBe(true);
		ws.returnToProject();
		expect(ws.project.circuits.map((c) => c.name)).toEqual(["main", "primero"]);
		expect(ws.projects.some((p) => p.id === secondId)).toBe(false);
	});

	it("ignora identificadores inexistentes y mantiene disponible un proyecto sin autoguardar", () => {
		const ws = new Workspace();
		expect(ws.projects).toHaveLength(1);
		ws.addCircuit("actual");
		ws.deleteProject(999);
		expect(ws.project.circuits.map((c) => c.name)).toEqual(["main", "actual"]);
		expect(ws.autosaveStatus).toBe("pending");
	});
});
