// Application state outside React: the open project, which circuit (and
// which simulation state within it) is shown, the current tool and
// selection, undo history and simulation controls (Logisim's Project,
// Simulator and tool framework).

import { RAM, ROM, ROM_CONTENTS } from "@/components/memory/mem";
import type { MemContents } from "@/components/memory/mem-contents";
import { SubcircuitFactory } from "@/components/subcircuit";
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
import { Project } from "@/project/project";
import { Simulator } from "@/sim/simulator";

/** Tick frequencies offered by Logisim's Simulate > Tick Frequency menu. */
export const TICK_FREQUENCIES = [4096, 2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1, 0.5, 0.25];

export type Tool =
	| { kind: "poke" }
	| { kind: "edit" }
	| { kind: "wiring" }
	| { kind: "add"; id: string; factory: ComponentFactory; attrs: AttributeSet };

type Listener = () => void;

interface ClipboardData {
	comps: { factory: ComponentFactory; attrs: AttributeSet; loc: Loc }[];
	wires: Wire[];
}

const AUTOSAVE_KEY = "logihur.autosave";

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
	private clipboard: ClipboardData | null = null;

	private listeners = new Set<Listener>();
	version = 0;
	private tickTimer: ReturnType<typeof setInterval> | null = null;
	private activePoker: { poker: Poker; state: InstanceStateImpl } | null = null;
	private pokePressed = false;
	private autosaveTimer: ReturnType<typeof setTimeout> | null = null;

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
	}

	setProject(project: Project, fileName: string): void {
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
		this.scheduleAutosave();
		this.changed();
	}

	newProject(): void {
		this.setProject(Project.createEmpty(), "sin-titulo.circ");
	}

	openFromText(text: string, fileName: string): void {
		this.setProject(readCirc(text), fileName);
	}

	saveToText(): string {
		const xml = writeCirc(this.project);
		this.dirty = false;
		this.changed();
		return xml;
	}

	/** Restore the last autosaved project, if any. */
	restoreAutosave(): boolean {
		try {
			const raw = localStorage.getItem(AUTOSAVE_KEY);
			if (!raw) return false;
			const { name, xml } = JSON.parse(raw) as { name: string; xml: string };
			this.setProject(readCirc(xml), name);
			return true;
		} catch {
			return false;
		}
	}

	private scheduleAutosave(): void {
		this.autosaveStatus = "pending";
		if (this.autosaveTimer !== null) clearTimeout(this.autosaveTimer);
		this.autosaveTimer = setTimeout(() => {
			try {
				localStorage.setItem(
					AUTOSAVE_KEY,
					JSON.stringify({ name: this.fileName, xml: writeCirc(this.project) }),
				);
				this.autosaveStatus = "saved";
			} catch {
				this.autosaveStatus = "error";
			}
			this.changed();
		}, 800);
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

	get rootSimulator(): Simulator {
		return this.simulatorFor(this.circuit);
	}

	private resetView(): void {
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
		if (c === this.circuit && this.viewStack.length === 1) return;
		this.stopPoking();
		this.circuit = c;
		this.clearSelection();
		this.resetView();
		this.changed();
	}

	/** View the inside of a subcircuit instance (Logisim: "View <name>"). */
	enterSubcircuit(inst: Instance): void {
		if (!(inst.factory instanceof SubcircuitFactory)) return;
		this.stopPoking();
		const sub = inst.factory.getSubstate(this.viewState, inst);
		this.viewStack.push({ state: sub, via: inst });
		this.clearSelection();
		this.changed();
	}

	leaveSubcircuit(levels = 1): void {
		this.stopPoking();
		let n = levels;
		while (n-- > 0 && this.viewStack.length > 1) this.viewStack.pop();
		this.clearSelection();
		this.changed();
	}

	// --- tools -----------------------------------------------------------

	/** Select an "add component" tool; `preset` customizes a fresh tool. */
	selectAddTool(factory: ComponentFactory, id = factory.name, preset: Record<string, unknown> = {}): void {
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
		if (tool.kind !== "poke") this.stopPoking();
		this.tool = tool;
		if (tool.kind !== "edit") this.clearSelection();
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
		if (repair) {
			for (const c of tx.circuits()) repairWires(tx, c);
		}
		if (tx.ops.length === 0) return;
		this.history.push(tx);
		this.afterEdit();
	}

	private afterEdit(): void {
		this.dirty = true;
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
		if (this.tool.kind === "add") {
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

	setMainCircuit(circuit: Circuit): void {
		if (this.project.mainCircuit === circuit) return;
		this.edit("Circuito principal", (tx) => tx.setMain(this.project, circuit), false);
	}

	// --- simulation ------------------------------------------------------

	propagate(): void {
		if (this.simEnabled) this.rootSimulator.propagate();
	}

	setSimEnabled(v: boolean): void {
		this.simEnabled = v;
		if (v) this.propagate();
		this.changed();
	}

	resetSimulation(): void {
		this.rootSimulator.reset();
		this.changed();
	}

	/** Simulate > Tick Once. */
	tickOnce(): void {
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
