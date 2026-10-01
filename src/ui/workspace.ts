// Application state outside React: the open project, which circuit (and
// which simulation state within it) is shown, the current tool and
// selection, undo history and simulation controls (Logisim's Project,
// Simulator and tool framework).

import { type AnalyzeResult, analyzeCircuit } from "@/analyze/analyze";
import { buildCircuit } from "@/analyze/circuit-builder";
import { AnalyzerModel } from "@/analyze/model";
import { TEXT, TEXT_TEXT } from "@/components/base/text";
import { RAM, ROM, ROM_CONTENTS } from "@/components/memory/mem";
import type { MemContents } from "@/components/memory/mem-contents";
import { SubcircuitFactory } from "@/components/subcircuit";
import {
	computeDistribution,
	getBitEnds,
	SPLITTER,
	SPLITTER_FANOUT,
	splitterBitAttr,
} from "@/components/wiring/splitter";
import { History, Transaction } from "@/editor/history";
import { repairWires } from "@/editor/wires";
import type { AnyAttribute, AttributeSet } from "@/engine/attributes";
import { CIRCUIT_NAME_ATTR, Circuit } from "@/engine/circuit";
import { type ComponentFactory, Instance, type Poker } from "@/engine/component";
import { type Direction, type Loc, loc, locX, locY } from "@/engine/geom";
import { prefs } from "@/engine/prefs";
import { type CircuitState, InstanceStateImpl } from "@/engine/simulation";
import { Wire } from "@/engine/wire";
import { readCirc } from "@/format/circ-reader";
import { writeCirc } from "@/format/circ-writer";
import { LogModel } from "@/log/log-model";
import { Project } from "@/project/project";
import { Simulator } from "@/sim/simulator";
import { editableAttribute, type TextEditing } from "./text-editing";

/** Tick frequencies offered by Logisim's Simulate > Tick Frequency menu. */
export const TICK_FREQUENCIES = [4096, 2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1, 0.5, 0.25];

export type Tool =
	| { kind: "poke" }
	| { kind: "edit" }
	| { kind: "wiring" }
	| { kind: "text"; factory: typeof TEXT; attrs: AttributeSet }
	| { kind: "add"; id: string; factory: ComponentFactory; attrs: AttributeSet };

type Listener = () => void;

interface ClipboardData {
	comps: { factory: ComponentFactory; attrs: AttributeSet; loc: Loc }[];
	wires: Wire[];
}

const AUTOSAVE_KEY = "logihur.autosave";

type ProjectKind = "project" | "example";
interface SavedProject {
	id: number;
	name: string;
	xml: string;
	dirty: boolean;
	kind: ProjectKind;
	/** Library files (`file#` libraries) by name. */
	libraries?: Record<string, string>;
}

function readSaved(saved: { xml: string; libraries?: Record<string, string> }): Project {
	return readCirc(saved.xml, new Map(Object.entries(saved.libraries ?? {})));
}
interface ProjectStore {
	version: 2;
	activeId: number;
	previousId: number | null;
	projects: SavedProject[];
}

export class Workspace {
	project: Project = Project.createEmpty();
	fileName = "sin-titulo.circ";
	/** Top-level circuit being viewed. */
	circuit: Circuit;
	/** One root simulation per top-level circuit, as in Logisim. */
	private simulators = new Map<Circuit, Simulator>();
	/** Path of substates when looking inside subcircuits. */
	viewStack: { state: CircuitState; via: Instance | null }[] = [];

	tool: Tool = { kind: "edit" };
	textEditing: TextEditing | null = null;
	stepPoints = new Map<CircuitState, Set<Loc>>();
	/** Attributes of each "add" tool, kept between uses like Logisim's tools. */
	private toolAttrs = new Map<string, AttributeSet>();

	simEnabled = true;
	ticksEnabled = false;
	tickFrequency = 1;
	selection = new Set<Instance>();
	selectedWires = new Set<Wire>();
	messages: string[] = [];
	notice: string | null = null;
	dirty = false;
	autosaveStatus: "idle" | "pending" | "saved" | "error" = "idle";
	readonly history = new History();
	/** The combinational analysis window's model; like Logisim's, it outlives projects. */
	readonly analyzer = new AnalyzerModel();
	private clipboard: ClipboardData | null = null;

	private listeners = new Set<Listener>();
	version = 0;
	private tickTimer: ReturnType<typeof setInterval> | null = null;
	private activePoker: { poker: Poker; state: InstanceStateImpl } | null = null;
	private pokePressed = false;
	private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
	private savedProjects: SavedProject[] = [];
	private activeProjectId = 0;
	private previousProjectId: number | null = null;
	private projectKind: ProjectKind = "project";

	get projects(): { id: number; name: string; active: boolean }[] {
		const projects = this.savedProjects.map((p) => ({
			id: p.id,
			name: p.id === this.activeProjectId ? this.fileName : p.name,
			active: p.id === this.activeProjectId,
		}));
		if (!projects.some((p) => p.active)) {
			projects.push({ id: this.activeProjectId, name: this.fileName, active: true });
		}
		return projects;
	}

	get returnToProjectLabel(): string {
		const previous = this.savedProjects.find((p) => p.id === this.previousProjectId);
		return this.projectKind === "example" && previous?.kind === "project"
			? "Volver a mi proyecto"
			: "Volver al proyecto anterior";
	}

	get canReturnToProject(): boolean {
		return this.savedProjects.some((p) => p.id === this.previousProjectId);
	}

	private snapshotProject(): void {
		const snapshot: SavedProject = {
			id: this.activeProjectId,
			name: this.fileName,
			xml: writeCirc(this.project),
			dirty: this.dirty,
			kind: this.projectKind,
			libraries: Object.fromEntries(this.project.librarySources),
		};
		const index = this.savedProjects.findIndex((p) => p.id === snapshot.id);
		if (index < 0) this.savedProjects.push(snapshot);
		else this.savedProjects[index] = snapshot;
	}

	switchProject(id: number): void {
		if (id === this.activeProjectId) return;
		const saved = this.savedProjects.find((p) => p.id === id);
		if (!saved) return;
		const project = readSaved(saved);
		this.finishTextEditing();
		this.snapshotProject();
		this.previousProjectId = this.activeProjectId;
		this.activeProjectId = saved.id;
		this.projectKind = saved.kind;
		this.loadProject(project, saved.name);
		this.dirty = saved.dirty;
		this.flushAutosave();
	}

	deleteProject(id: number): void {
		if (id !== this.activeProjectId && !this.savedProjects.some((p) => p.id === id)) return;
		const remaining = this.savedProjects.filter((p) => p.id !== id);
		if (id === this.activeProjectId) {
			const next = remaining.find((p) => p.id === this.previousProjectId) ?? remaining.at(-1);
			const project = next ? readSaved(next) : Project.createEmpty();
			this.finishTextEditing();
			this.savedProjects = remaining;
			this.activeProjectId = next?.id ?? id + 1;
			this.projectKind = next?.kind ?? "project";
			this.previousProjectId = remaining.find((p) => p.id !== this.activeProjectId)?.id ?? null;
			// Loading directly avoids archiving the project being deleted.
			this.loadProject(project, next?.name ?? "sin-titulo.circ");
			this.dirty = next?.dirty ?? false;
		} else {
			this.savedProjects = remaining;
			if (this.previousProjectId === id) {
				this.previousProjectId = remaining.find((p) => p.id !== this.activeProjectId)?.id ?? null;
			}
		}
		this.flushAutosave();
	}

	returnToProject(): void {
		if (this.previousProjectId !== null) this.switchProject(this.previousProjectId);
	}

	constructor() {
		this.circuit = this.project.mainCircuit as Circuit;
		this.resetView();
	}

	subscribe = (l: Listener): (() => void) => {
		this.listeners.add(l);
		return () => this.listeners.delete(l);
	};

	getVersion = (): number => this.version;

	changed(): void {
		this.version++;
		for (const l of Array.from(this.listeners)) l();
	}

	notify(message: string): void {
		this.notice = message;
		this.changed();
	}

	// --- project ---------------------------------------------------------

	private disposeSimulators(): void {
		for (const s of this.simulators.values()) s.dispose();
		this.simulators.clear();
		this.logModels.clear();
	}

	setProject(project: Project, fileName: string, kind: ProjectKind = "project"): void {
		this.finishTextEditing();
		this.snapshotProject();
		// Exploring several examples keeps the return button pointing at the user's project.
		if (this.projectKind !== "example" || kind !== "example") {
			this.previousProjectId = this.activeProjectId;
		}
		this.activeProjectId = Math.max(...this.savedProjects.map((p) => p.id)) + 1;
		this.projectKind = kind;
		this.loadProject(project, fileName);
		this.flushAutosave();
	}

	private loadProject(project: Project, fileName: string): void {
		this.finishTextEditing();
		this.stopPoking();
		this.stopTicking();
		this.disposeSimulators();
		this.project = project;
		this.fileName = fileName;
		this.messages = [...project.messages];
		this.clearSelection();
		this.history.clear();
		this.dirty = false;
		this.autosaveStatus = "idle";
		if (this.autosaveTimer !== null) clearTimeout(this.autosaveTimer);
		this.circuit = project.mainCircuit ?? project.circuits[0];
		this.resetView();
		if (this.ticksEnabled) this.startTicking();
		this.changed();
	}

	newProject(): void {
		this.setProject(Project.createEmpty(), "sin-titulo.circ");
	}

	openFromText(
		text: string,
		fileName: string,
		kind: ProjectKind = "project",
		libraries: ReadonlyMap<string, string> = new Map(),
	): void {
		this.setProject(readCirc(text, libraries), fileName, kind);
	}

	// --- Logisim libraries (Proyecto > Cargar Librería > Librería Logisim) ---

	/** Re-read the project with more library files, e.g. the ones it was missing. */
	provideLibraries(files: ReadonlyMap<string, string>): void {
		const sources = new Map([...this.project.librarySources, ...files]);
		const dirty = this.dirty;
		const viewed = this.circuit.name;
		this.loadProject(readCirc(writeCirc(this.project), sources), this.fileName);
		const again = this.project.getCircuit(viewed);
		if (again) this.setCircuit(again);
		this.dirty = dirty;
		this.flushAutosave();
	}

	/** Add a .circ file as a library whose circuits can be placed but not edited. */
	loadLibrary(fileName: string, text: string): void {
		const desc = `file#${fileName}`;
		if (this.project.libraries.some((l) => l.desc === desc)) {
			this.notify(`La librería ${fileName} ya está cargada.`);
			return;
		}
		let n = this.project.libraries.length;
		while (this.project.libraries.some((l) => l.name === `${n}`)) n++;
		this.project.libraries.push({ name: `${n}`, desc, tools: [] });
		this.dirty = true;
		this.provideLibraries(new Map([[fileName, text]]));
		this.dirty = true;
		this.notify(`Se cargó la librería ${fileName}.`);
	}

	/** Proyecto > Descargar Librería: only when nothing uses it. */
	unloadLibrary(desc: string): void {
		if (this.project.usesLibrary(desc)) {
			this.notify("La librería se usa en algún circuito; quitá esos componentes primero.");
			return;
		}
		this.project.libraries = this.project.libraries.filter((l) => l.desc !== desc);
		this.project.loadedLibraries.delete(desc);
		if (this.tool.kind === "add" && this.tool.factory.library === desc) this.setTool({ kind: "edit" });
		this.dirty = true;
		this.scheduleAutosave();
		this.changed();
	}

	saveToText(): string {
		this.finishTextEditing();
		const xml = writeCirc(this.project);
		this.dirty = false;
		this.scheduleAutosave();
		this.changed();
		return xml;
	}

	/** Restore the project collection, migrating the original single-project autosave. */
	restoreAutosave(): boolean {
		try {
			const raw = localStorage.getItem(AUTOSAVE_KEY);
			if (!raw) return false;
			const data = JSON.parse(raw) as ProjectStore | { name: string; xml: string };
			if (!("version" in data)) {
				this.loadProject(readSaved(data), data.name);
				this.dirty = true;
				this.flushAutosave();
				return true;
			}
			if (data.version !== 2 || !Array.isArray(data.projects)) return false;
			const active = data.projects.find((p) => p.id === data.activeId);
			if (!active) return false;
			const project = readSaved(active);
			this.savedProjects = data.projects;
			this.activeProjectId = active.id;
			this.previousProjectId = data.previousId;
			this.projectKind = active.kind;
			this.loadProject(project, active.name);
			this.dirty = active.dirty;
			this.autosaveStatus = "saved";
			this.changed();
			return true;
		} catch {
			return false;
		}
	}

	/** Persist immediately when changing projects or leaving the page. */
	flushAutosave(): void {
		if (this.autosaveTimer !== null) clearTimeout(this.autosaveTimer);
		this.autosaveTimer = null;
		try {
			this.snapshotProject();
			const store: ProjectStore = {
				version: 2,
				activeId: this.activeProjectId,
				previousId: this.previousProjectId,
				projects: this.savedProjects,
			};
			localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(store));
			this.autosaveStatus = "saved";
		} catch {
			this.autosaveStatus = "error";
		}
		this.changed();
	}

	private scheduleAutosave(): void {
		this.autosaveStatus = "pending";
		if (this.autosaveTimer !== null) clearTimeout(this.autosaveTimer);
		this.autosaveTimer = setTimeout(() => this.flushAutosave(), 800);
	}

	// --- viewing ---------------------------------------------------------

	simulatorFor(circuit: Circuit): Simulator {
		let sim = this.simulators.get(circuit);
		if (!sim) {
			sim = new Simulator(this.project, circuit);
			this.simulators.set(circuit, sim);
		}
		return sim;
	}

	private readonly logModels = new Map<Simulator, LogModel>();

	/** Simular > Registro: one log per top-level circuit simulation, like Logisim's per circuit state. */
	get logModel(): LogModel {
		const sim = this.rootSimulator;
		let model = this.logModels.get(sim);
		if (!model) {
			const created = new LogModel(sim.root);
			sim.propagationListeners.add(() => created.propagationCompleted());
			this.logModels.set(sim, created);
			model = created;
		}
		return model;
	}

	get rootSimulator(): Simulator {
		return this.simulatorFor(this.circuit);
	}

	private resetView(): void {
		this.stepPoints.clear();
		this.viewStack = [{ state: this.simulatorFor(this.circuit).root, via: null }];
	}

	/** The state being displayed (root or a substate). */
	get viewState(): CircuitState {
		return this.viewStack[this.viewStack.length - 1].state;
	}

	get viewCircuit(): Circuit {
		return this.viewState.circuit;
	}

	setCircuit(c: Circuit): void {
		this.finishTextEditing();
		if (c === this.circuit && this.viewStack.length === 1) return;
		this.stopPoking();
		this.circuit = c;
		this.clearSelection();
		this.resetView();
		this.changed();
	}

	/** View the inside of a subcircuit instance (Logisim: "View <name>"). */
	enterSubcircuit(inst: Instance): void {
		this.finishTextEditing();
		if (!(inst.factory instanceof SubcircuitFactory)) return;
		this.stopPoking();
		const sub = inst.factory.getSubstate(this.viewState, inst);
		this.viewStack.push({ state: sub, via: inst });
		this.clearSelection();
		this.changed();
	}

	leaveSubcircuit(levels = 1): void {
		this.finishTextEditing();
		this.stopPoking();
		let n = levels;
		while (n-- > 0 && this.viewStack.length > 1) this.viewStack.pop();
		this.clearSelection();
		this.changed();
	}

	// --- tools -----------------------------------------------------------

	/** Select an "add component" tool; `preset` customizes a fresh tool. */
	selectAddTool(factory: ComponentFactory, id = factory.name, preset: Record<string, unknown> = {}): void {
		this.finishTextEditing();
		this.stopPoking();
		let attrs = this.toolAttrs.get(id);
		if (!attrs) {
			attrs = factory.createAttributeSet();
			for (const [name, value] of Object.entries(preset)) {
				const attr = factory.getAttributes(attrs).find((a) => a.name === name);
				if (attr) factory.setAttribute(attrs, attr, value);
			}
			this.toolAttrs.set(id, attrs);
		}
		this.tool = { kind: "add", id, factory, attrs };
		this.clearSelection();
		this.changed();
	}

	setTool(tool: Tool): void {
		this.finishTextEditing();
		if (tool.kind !== "poke") this.stopPoking();
		this.tool = tool;
		if (tool.kind !== "edit") this.clearSelection();
		this.changed();
	}

	selectTextTool(): void {
		this.finishTextEditing();
		this.stopPoking();
		let attrs = this.toolAttrs.get("Text Tool");
		if (!attrs) {
			attrs = TEXT.createAttributeSet();
			this.toolAttrs.set("Text Tool", attrs);
		}
		this.tool = { kind: "text", factory: TEXT, attrs };
		this.clearSelection();
		this.changed();
	}

	beginTextEditing(x: number, y: number): void {
		this.finishTextEditing();
		if (this.tool.kind !== "text") return;
		const candidates = [...Array.from(this.selection), ...Array.from(this.viewCircuit.components).reverse()];
		for (const instance of candidates) {
			const attr = editableAttribute(instance, x, y);
			if (!attr) continue;
			this.textEditing = {
				circuit: this.viewCircuit,
				instance,
				attr,
				creating: false,
				draft: instance.attrs.get(attr),
			};
			this.select(instance);
			return;
		}
		if (x < 0 || y < 0) return;
		const instance = new Instance(TEXT, loc(Math.round(x), Math.round(y)), this.tool.attrs.clone());
		this.clearSelection();
		this.textEditing = {
			circuit: this.viewCircuit,
			instance,
			attr: TEXT_TEXT,
			creating: true,
			draft: instance.attrs.get(TEXT_TEXT),
		};
		this.changed();
	}

	updateTextDraft(text: string): void {
		if (!this.textEditing) return;
		this.textEditing.draft = text.replace(/[\r\n]/g, "");
		this.changed();
	}

	finishTextEditing(commit = true): void {
		const editing = this.textEditing;
		if (!editing) return;
		this.textEditing = null;
		if (commit && editing.circuit === this.viewCircuit) {
			const { instance, attr, draft, creating } = editing;
			if (creating && draft !== "") {
				instance.attrs.set(attr, draft);
				this.edit("Agregar etiqueta", (tx, circuit) => tx.addComponent(circuit, instance), false);
				this.selection = new Set([instance]);
			} else if (!creating && editing.circuit.components.has(instance)) {
				if (draft === "" && instance.factory === TEXT) {
					this.edit("Borrar etiqueta", (tx, circuit) => tx.removeComponent(circuit, instance), false);
				} else if (draft !== instance.attrs.get(attr)) {
					this.edit(
						"Editar texto",
						(tx, circuit) => tx.changeAttributes(circuit, instance, (attrs) => attrs.set(attr, draft)),
						false,
					);
				}
			}
		}
		this.changed();
	}

	// --- selection -------------------------------------------------------

	clearSelection(): void {
		this.selection.clear();
		this.selectedWires.clear();
	}

	select(inst: Instance | null, additive = false): void {
		if (!additive) this.clearSelection();
		if (inst) {
			if (additive && this.selection.has(inst)) this.selection.delete(inst);
			else this.selection.add(inst);
		}
		this.changed();
	}

	selectWire(w: Wire, additive = false): void {
		if (!additive) this.clearSelection();
		if (additive && this.selectedWires.has(w)) this.selectedWires.delete(w);
		else this.selectedWires.add(w);
		this.changed();
	}

	selectRect(x0: number, y0: number, x1: number, y1: number, additive: boolean): void {
		if (!additive) this.clearSelection();
		const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
		const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
		const inside = (x: number, y: number) => x >= ax && x <= bx && y >= ay && y <= by;
		for (const c of this.viewCircuit.components) {
			const b = c.bounds;
			if (inside(b.x, b.y) && inside(b.x + b.width, b.y + b.height)) this.selection.add(c);
		}
		for (const w of this.viewCircuit.wires.values()) {
			if (inside(locX(w.e0), locY(w.e0)) && inside(locX(w.e1), locY(w.e1))) this.selectedWires.add(w);
		}
		this.changed();
	}

	selectAll(): void {
		this.clearSelection();
		for (const c of this.viewCircuit.components) this.selection.add(c);
		for (const w of this.viewCircuit.wires.values()) this.selectedWires.add(w);
		this.changed();
	}

	hasSelection(): boolean {
		return this.selection.size > 0 || this.selectedWires.size > 0;
	}

	// --- editing ---------------------------------------------------------

	/** Run an undoable edit on the viewed circuit, then repair wires. */
	edit(label: string, fn: (tx: Transaction, circuit: Circuit) => void, repair = true): void {
		const tx = new Transaction(label);
		const circuit = this.viewCircuit;
		fn(tx, circuit);
		// like Logisim, a library's circuits can be viewed but not changed
		if (Array.from(tx.circuits()).some((c) => this.project.isLibraryCircuit(c))) {
			tx.undo();
			this.notify("Este circuito pertenece a una librería y no se puede modificar acá.");
			return;
		}
		if (repair) {
			for (const c of tx.circuits()) repairWires(tx, c);
		}
		if (tx.ops.length === 0) return;
		this.history.push(tx);
		this.afterEdit();
	}

	private afterEdit(): void {
		this.dirty = true;
		for (const log of this.logModels.values()) log.prune();
		// keep only selected items that still exist
		const circuit = this.viewCircuit;
		for (const c of Array.from(this.selection)) if (!circuit.components.has(c)) this.selection.delete(c);
		for (const w of Array.from(this.selectedWires))
			if (!circuit.wires.has(w.key)) this.selectedWires.delete(w);
		if (!this.project.circuits.includes(this.circuit)) {
			this.circuit = this.project.mainCircuit ?? this.project.circuits[0];
			this.resetView();
		}
		this.propagate();
		this.scheduleAutosave();
		this.changed();
	}

	undo(): void {
		if (this.history.undo()) this.afterEdit();
	}

	redo(): void {
		if (this.history.redo()) this.afterEdit();
	}

	private canPlace(factory: ComponentFactory): boolean {
		if (
			factory instanceof SubcircuitFactory &&
			this.project.wouldCreateCycle(this.viewCircuit, factory.source)
		) {
			this.notify("No se puede agregar un circuito dentro de sí mismo.");
			return false;
		}
		return true;
	}

	placeComponent(at: Loc): Instance | null {
		const tool = this.tool;
		if (tool.kind !== "add" || !this.canPlace(tool.factory)) return null;
		const inst = new Instance(tool.factory, at, tool.attrs.clone());
		this.edit(`Agregar ${tool.factory.name}`, (tx, c) => tx.addComponent(c, inst));
		return inst;
	}

	addWires(wires: Wire[]): void {
		if (wires.length === 0) return;
		this.edit("Agregar cable", (tx, c) => {
			for (const w of wires) tx.addWire(c, w);
		});
	}

	deleteSelection(): void {
		if (!this.hasSelection()) return;
		const comps = Array.from(this.selection);
		const wires = Array.from(this.selectedWires);
		this.clearSelection();
		this.edit("Borrar", (tx, c) => {
			for (const comp of comps) tx.removeComponent(c, comp);
			for (const w of wires) tx.removeWire(c, w);
		});
	}

	/** Menu Tool "Borrar": one component, whether or not it is selected. */
	deleteComponent(comp: Instance): void {
		this.selection.delete(comp);
		this.edit("Borrar", (tx, c) => tx.removeComponent(c, comp));
	}

	/** SplitterDistributeItem: the bit layout of `order` (1 ascending, -1 descending), or null if already so. */
	splitterDistribution(comp: Instance, order: number): number[] | null {
		if (comp.factory !== SPLITTER) return null;
		const actual = getBitEnds(comp.attrs);
		const desired = computeDistribution(comp.attrs.get(SPLITTER_FANOUT), actual.length, order);
		return actual.every((v, i) => v === desired[i]) ? null : desired;
	}

	distributeSplitter(comp: Instance, order: number): void {
		const desired = this.splitterDistribution(comp, order);
		if (!desired) return;
		this.edit(order > 0 ? "Distribuir ascendente" : "Distribuir descendente", (tx, c) => {
			tx.changeAttributes(c, comp, (attrs) => {
				desired.forEach((end, i) => {
					SPLITTER.setAttribute(attrs, splitterBitAttr(i), end);
				});
			});
		});
	}

	moveSelection(dx: number, dy: number): void {
		if ((dx === 0 && dy === 0) || !this.hasSelection()) return;
		const comps = Array.from(this.selection);
		const wires = Array.from(this.selectedWires);
		this.edit("Mover", (tx, c) => {
			for (const comp of comps) tx.move(c, comp, loc(comp.x + dx, comp.y + dy));
			for (const w of wires) tx.removeWire(c, w);
			const moved = wires.map((w) =>
				Wire.create(loc(locX(w.e0) + dx, locY(w.e0) + dy), loc(locX(w.e1) + dx, locY(w.e1) + dy)),
			);
			for (const w of moved) tx.addWire(c, w);
			this.selectedWires = new Set(moved);
		});
		// wire objects may have been re-created by the repair
		const keys = new Set(Array.from(this.selectedWires).map((w) => w.key));
		this.selectedWires = new Set(Array.from(this.viewCircuit.wires.values()).filter((w) => keys.has(w.key)));
		this.changed();
	}

	/** Attribute changes apply to the selection, else to the current add tool. */
	setAttribute(attr: AnyAttribute, value: unknown): void {
		const targets = Array.from(this.selection).filter((c) =>
			c.factory.getAttributes(c.attrs).some((a) => a.name === attr.name),
		);
		if (targets.length > 0) {
			this.edit("Cambiar atributo", (tx, circuit) => {
				for (const comp of targets) {
					if (comp.factory instanceof SubcircuitFactory && !comp.factory.isToSave(attr)) {
						this.changeCircuitAttr(tx, comp.factory.source, attr, value);
					} else {
						tx.changeAttributes(circuit, comp, (a) => comp.factory.setAttribute(a, attr, value));
					}
				}
			});
			return;
		}
		if (this.tool.kind === "add" || this.tool.kind === "text") {
			const { factory, attrs } = this.tool;
			factory.setAttribute(attrs, attr, value);
			this.changed();
		}
	}

	private changeCircuitAttr(tx: Transaction, circuit: Circuit, attr: AnyAttribute, value: unknown): boolean {
		if (attr.name === CIRCUIT_NAME_ATTR.name) {
			const name = String(value).trim();
			if (!name || this.project.circuits.some((c) => c !== circuit && c.name === name)) {
				this.notify(name ? `Ya existe un circuito llamado "${name}".` : "El nombre no puede estar vacío.");
				return false;
			}
			value = name;
		}
		tx.changeStatic(circuit, (a) => a.set(attr, value));
		return true;
	}

	/** ROM is project data; RAM belongs to the simulation instance currently viewed. */
	memoryContents(inst: Instance): MemContents | null {
		if (inst.factory === ROM) return inst.attrs.get(ROM_CONTENTS);
		if (inst.factory === RAM) return RAM.getState(new InstanceStateImpl(this.viewState, inst)).contents;
		return null;
	}

	setMemoryContents(inst: Instance, contents: MemContents): void {
		if (!this.viewCircuit.components.has(inst)) return;
		const current = this.memoryContents(inst);
		if (!current) return;
		const next = contents.clone();
		next.setDimensions(current.logLength, current.dataWidth);
		if (inst.factory === ROM) {
			this.edit(
				"Editar contenidos de ROM",
				(tx, circuit) => {
					tx.changeAttributes(circuit, inst, (attrs) => ROM.setAttribute(attrs, ROM_CONTENTS, next));
				},
				false,
			);
		} else {
			const state = new InstanceStateImpl(this.viewState, inst);
			RAM.getState(state).contents = next;
			state.fireInvalidated();
			this.propagate();
			this.changed();
		}
	}

	setCircuitAttribute(circuit: Circuit, attr: AnyAttribute, value: unknown): void {
		this.edit(
			"Cambiar atributo del circuito",
			(tx) => {
				this.changeCircuitAttr(tx, circuit, attr, value);
			},
			false,
		);
	}

	/** Arrow keys: change the facing of the selection or of the add tool. */
	setFacing(dir: Direction): void {
		const targets = Array.from(this.selection).filter((c) => c.factory.facingAttr);
		if (targets.length > 0) {
			this.edit("Cambiar orientación", (tx, circuit) => {
				for (const comp of targets) {
					const fa = comp.factory.facingAttr as AnyAttribute;
					tx.changeAttributes(circuit, comp, (a) => comp.factory.setAttribute(a, fa, dir));
				}
			});
		} else if (this.tool.kind === "add" && this.tool.factory.facingAttr) {
			this.tool.factory.setAttribute(this.tool.attrs, this.tool.factory.facingAttr, dir);
			this.changed();
		}
	}

	copy(): void {
		if (!this.hasSelection()) return;
		this.clipboard = {
			comps: Array.from(this.selection).map((c) => ({
				factory: c.factory,
				attrs: c.attrs.clone(),
				loc: c.loc,
			})),
			wires: Array.from(this.selectedWires),
		};
	}

	cut(): void {
		this.copy();
		this.deleteSelection();
	}

	paste(offset = 20): void {
		const clip = this.clipboard;
		if (!clip) return;
		const comps = clip.comps
			.filter((c) => this.canPlace(c.factory))
			.map((c) => new Instance(c.factory, loc(locX(c.loc) + offset, locY(c.loc) + offset), c.attrs.clone()));
		const wires = clip.wires.map((w) =>
			Wire.create(
				loc(locX(w.e0) + offset, locY(w.e0) + offset),
				loc(locX(w.e1) + offset, locY(w.e1) + offset),
			),
		);
		this.edit("Pegar", (tx, c) => {
			for (const comp of comps) tx.addComponent(c, comp);
			for (const w of wires) tx.addWire(c, w);
		});
		this.clearSelection();
		for (const comp of comps) this.selection.add(comp);
		const keys = new Set(wires.map((w) => w.key));
		for (const w of this.viewCircuit.wires.values()) if (keys.has(w.key)) this.selectedWires.add(w);
		// the next paste lands further away
		this.clipboard = {
			comps: comps.map((c) => ({ factory: c.factory, attrs: c.attrs.clone(), loc: c.loc })),
			wires: Array.from(this.selectedWires),
		};
		this.changed();
	}

	duplicate(): void {
		this.copy();
		this.paste();
	}

	// --- circuits (Project menu) ------------------------------------------

	addCircuit(name: string): void {
		const trimmed = name.trim();
		if (!trimmed) return;
		if (this.project.getCircuit(trimmed)) {
			this.notify(`Ya existe un circuito llamado "${trimmed}".`);
			return;
		}
		const circuit = new Circuit(trimmed);
		this.edit("Agregar circuito", (tx) => tx.addCircuit(this.project, circuit), false);
		this.setCircuit(circuit);
	}

	removeCircuit(circuit: Circuit): void {
		if (this.project.circuits.length <= 1) {
			this.notify("El proyecto tiene que tener al menos un circuito.");
			return;
		}
		if (this.project.getUsers(circuit).length > 0) {
			this.notify(`"${circuit.name}" se usa como subcircuito; quitalo primero de los otros circuitos.`);
			return;
		}
		this.edit(
			"Borrar circuito",
			(tx) => {
				if (this.project.mainCircuit === circuit) {
					const other = this.project.circuits.find((c) => c !== circuit) as Circuit;
					tx.setMain(this.project, other);
				}
				tx.removeCircuit(this.project, circuit);
			},
			false,
		);
	}

	// --- combinational analysis (Project > Analyze Circuit) --------------

	analyzeViewedCircuit(): AnalyzeResult {
		this.finishTextEditing();
		return analyzeCircuit(this.analyzer, this.project, this.viewCircuit);
	}

	/** BuildCircuitButton: a new circuit, or replace the contents of an existing one. */
	buildAnalyzedCircuit(name: string, twoInputs: boolean, useNands: boolean): Circuit {
		const built = buildCircuit(this.analyzer, twoInputs, useNands);
		const existing = this.project.getCircuit(name);
		const target = existing ?? new Circuit(name);
		this.edit(existing ? "Reemplazar circuito" : "Crear circuito", (tx) => {
			if (existing) {
				for (const comp of Array.from(existing.components)) tx.removeComponent(existing, comp);
				for (const w of Array.from(existing.wires.values())) tx.removeWire(existing, w);
			} else {
				tx.addCircuit(this.project, target);
			}
			for (const comp of built.components) tx.addComponent(target, comp);
			for (const w of built.wires) tx.addWire(target, w);
		});
		this.setCircuit(target);
		return target;
	}

	/** The explorer's up/down arrows: reorder circuits in the project. */
	moveCircuit(circuit: Circuit, delta: number): void {
		const from = this.project.circuits.indexOf(circuit);
		const to = from + delta;
		if (from < 0 || to < 0 || to >= this.project.circuits.length) return;
		this.edit(
			delta < 0 ? "Mover circuito arriba" : "Mover circuito abajo",
			(tx) => tx.moveCircuit(this.project, circuit, to),
			false,
		);
	}

	setMainCircuit(circuit: Circuit): void {
		if (this.project.mainCircuit === circuit) return;
		this.edit("Circuito principal", (tx) => tx.setMain(this.project, circuit), false);
	}

	// --- simulation ------------------------------------------------------

	propagate(): void {
		if (this.simEnabled) this.stepPoints.clear();
		if (this.simEnabled) this.rootSimulator.propagate();
	}

	setSimEnabled(v: boolean): void {
		if (v) this.stepPoints.clear();
		this.simEnabled = v;
		if (v) this.propagate();
		this.changed();
	}

	resetSimulation(): void {
		this.stepPoints.clear();
		this.rootSimulator.reset();
		this.changed();
	}

	stepSimulation(): void {
		this.setSimEnabled(false);
		this.stepPoints = this.rootSimulator.propagator.step();
		this.changed();
	}

	/** Simulate > Tick Once. */
	tickOnce(): void {
		this.stepPoints.clear();
		this.rootSimulator.propagator.tick();
		this.propagate();
		this.changed();
	}

	setTicksEnabled(v: boolean): void {
		this.ticksEnabled = v;
		if (v) this.startTicking();
		else this.stopTicking();
		this.changed();
	}

	setTickFrequency(f: number): void {
		this.tickFrequency = f;
		if (this.ticksEnabled) {
			this.stopTicking();
			this.startTicking();
		}
		this.changed();
	}

	private startTicking(): void {
		this.stopTicking();
		// Browsers clamp timers; batch several ticks per interval.
		const periodMs = 1000 / this.tickFrequency;
		const interval = Math.max(periodMs, 16);
		const perInterval = Math.max(1, Math.round(interval / periodMs));
		this.tickTimer = setInterval(() => {
			if (!this.simEnabled) return;
			const sim = this.rootSimulator;
			for (let i = 0; i < perInterval; i++) {
				sim.propagator.tick();
				if (this.simEnabled) sim.propagate();
			}
			this.changed();
		}, interval);
	}

	private stopTicking(): void {
		if (this.tickTimer !== null) clearInterval(this.tickTimer);
		this.tickTimer = null;
	}

	isOscillating(): boolean {
		return this.rootSimulator.isOscillating();
	}

	// --- poke tool -------------------------------------------------------

	pokePress(inst: Instance, x: number, y: number): boolean {
		// PokeTool: a new press ends the previous caret
		this.stopPoking();
		const poker = inst.factory.createPoker(inst);
		if (!poker) return false;
		const state = new InstanceStateImpl(this.viewState, inst);
		if (poker.init && !poker.init(state, x, y)) return false;
		this.activePoker = { poker, state };
		this.pokePressed = true;
		poker.mousePressed?.(state, x, y);
		this.propagate();
		this.changed();
		return true;
	}

	pokeRelease(x: number, y: number): void {
		const active = this.activePoker;
		if (!active || !this.pokePressed) return;
		this.pokePressed = false;
		active.poker.mouseReleased?.(active.state, x, y);
		this.propagate();
		this.changed();
	}

	pokeDrag(x: number, y: number): void {
		const active = this.activePoker;
		if (!active || !this.pokePressed || !active.poker.mouseDragged) return;
		active.poker.mouseDragged(active.state, x, y);
		this.propagate();
		this.changed();
	}

	pokeKeyPressed(key: string): boolean {
		const caret = this.pokeCaret;
		if (!caret?.poker.keyPressed?.(caret.state, key)) return false;
		this.propagate();
		this.changed();
		return true;
	}

	/** The poker that receives typed keys (Logisim's poke caret). */
	get pokeCaret(): { poker: Poker; state: InstanceStateImpl } | null {
		const active = this.activePoker;
		if (!active || active.state.circuitState !== this.viewState) return null;
		if (!this.viewCircuit.components.has(active.state.instance)) return null;
		return active;
	}

	/** Deliver a typed key to the poke caret; returns whether it was taken. */
	pokeKey(key: string): boolean {
		const caret = this.pokeCaret;
		if (!caret?.poker.keyTyped) return false;
		caret.poker.keyTyped(caret.state, key);
		this.propagate();
		this.changed();
		this.scheduleAutosave();
		return true;
	}

	stopPoking(): void {
		const active = this.activePoker;
		this.activePoker = null;
		this.pokePressed = false;
		if (active?.poker.stopEditing) {
			active.poker.stopEditing(active.state);
			this.propagate();
		}
	}

	setGateShape(shape: typeof prefs.gateShape): void {
		prefs.gateShape = shape;
		for (const c of this.project.circuits) for (const comp of c.components) comp.invalidate();
		this.changed();
	}
}
