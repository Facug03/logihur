// Undoable edits (Logisim's CircuitMutation/Action). Every change to the
// project goes through a Transaction that records reversible operations.

import type { AppearanceShape } from "@/engine/appearance";
import type { AttributeSet } from "@/engine/attributes";
import type { Circuit } from "@/engine/circuit";
import type { Instance } from "@/engine/component";
import type { Loc } from "@/engine/geom";
import type { Wire } from "@/engine/wire";
import type { Project } from "@/project/project";

type Op =
	| { kind: "addComp"; circuit: Circuit; comp: Instance }
	| { kind: "removeComp"; circuit: Circuit; comp: Instance }
	| { kind: "addWire"; circuit: Circuit; wire: Wire }
	| { kind: "removeWire"; circuit: Circuit; wire: Wire }
	| { kind: "attrs"; circuit: Circuit; comp: Instance; before: AttributeSet; after: AttributeSet }
	| { kind: "move"; circuit: Circuit; comp: Instance; from: Loc; to: Loc }
	| { kind: "static"; circuit: Circuit; before: AttributeSet; after: AttributeSet }
	| { kind: "addCircuit"; project: Project; circuit: Circuit; index: number }
	| { kind: "removeCircuit"; project: Project; circuit: Circuit; index: number }
	| { kind: "main"; project: Project; from: Circuit | null; to: Circuit | null }
	| { kind: "moveCircuit"; project: Project; circuit: Circuit; from: number; to: number }
	| {
			kind: "appearance";
			circuit: Circuit;
			before: AppearanceShape[] | null;
			after: AppearanceShape[] | null;
	  };

function apply(op: Op, forward: boolean): void {
	switch (op.kind) {
		case "addComp":
		case "removeComp":
			if ((op.kind === "addComp") === forward) op.circuit.addComponent(op.comp);
			else op.circuit.removeComponent(op.comp);
			break;
		case "addWire":
		case "removeWire":
			if ((op.kind === "addWire") === forward) op.circuit.addWire(op.wire);
			else op.circuit.removeWire(op.wire);
			break;
		case "attrs":
			op.comp.attrs.assign(forward ? op.after : op.before);
			op.circuit.componentChanged(op.comp);
			break;
		case "move":
			op.comp.moveTo(forward ? op.to : op.from);
			op.circuit.componentChanged(op.comp);
			break;
		case "static": {
			const target = forward ? op.after : op.before;
			const oldName = op.circuit.name;
			op.circuit.staticAttrs.assign(target);
			if (op.circuit.name !== oldName) op.circuit.setName(op.circuit.name);
			else op.circuit.voidNetlist();
			op.circuit.appearance.pinsChanged();
			break;
		}
		case "addCircuit":
		case "removeCircuit":
			if ((op.kind === "addCircuit") === forward) op.project.addCircuit(op.circuit, op.index);
			else op.project.removeCircuit(op.circuit);
			break;
		case "main":
			op.project.mainCircuit = forward ? op.to : op.from;
			break;
		case "moveCircuit":
			op.project.moveCircuit(op.circuit, forward ? op.to : op.from);
			break;
		case "appearance":
			op.circuit.appearance.setShapes(forward ? op.after : op.before);
			op.circuit.appearanceChanged();
			break;
	}
}

export class Transaction {
	readonly ops: Op[] = [];

	constructor(readonly label: string) {}

	private run(op: Op): void {
		apply(op, true);
		this.ops.push(op);
	}

	addComponent(circuit: Circuit, comp: Instance): void {
		this.run({ kind: "addComp", circuit, comp });
	}

	removeComponent(circuit: Circuit, comp: Instance): void {
		if (circuit.components.has(comp)) this.run({ kind: "removeComp", circuit, comp });
	}

	addWire(circuit: Circuit, wire: Wire): void {
		if (wire.e0 !== wire.e1 && !circuit.wires.has(wire.key)) this.run({ kind: "addWire", circuit, wire });
	}

	removeWire(circuit: Circuit, wire: Wire): void {
		const existing = circuit.wires.get(wire.key);
		if (existing) this.run({ kind: "removeWire", circuit, wire: existing });
	}

	/** Change attributes with `mutate`, recording before/after snapshots. */
	changeAttributes(circuit: Circuit, comp: Instance, mutate: (attrs: AttributeSet) => void): void {
		const before = comp.attrs.clone();
		const after = comp.attrs.clone();
		mutate(after);
		this.run({ kind: "attrs", circuit, comp, before, after });
	}

	move(circuit: Circuit, comp: Instance, to: Loc): void {
		if (comp.loc !== to) this.run({ kind: "move", circuit, comp, from: comp.loc, to });
	}

	changeStatic(circuit: Circuit, mutate: (attrs: AttributeSet) => void): void {
		const before = circuit.staticAttrs.clone();
		const after = circuit.staticAttrs.clone();
		mutate(after);
		this.run({ kind: "static", circuit, before, after });
	}

	addCircuit(project: Project, circuit: Circuit, index = project.circuits.length): void {
		this.run({ kind: "addCircuit", project, circuit, index });
	}

	removeCircuit(project: Project, circuit: Circuit): void {
		const index = project.circuits.indexOf(circuit);
		if (index >= 0) this.run({ kind: "removeCircuit", project, circuit, index });
	}

	moveCircuit(project: Project, circuit: Circuit, to: number): void {
		const from = project.circuits.indexOf(circuit);
		if (from >= 0 && from !== to) this.run({ kind: "moveCircuit", project, circuit, from, to });
	}

	/** Replace a circuit's custom appearance (null: back to the default one). */
	setAppearance(circuit: Circuit, after: AppearanceShape[] | null): void {
		const app = circuit.appearance;
		const before = app.isDefault() ? null : app.getEditableShapes();
		this.run({ kind: "appearance", circuit, before, after });
	}

	setMain(project: Project, to: Circuit): void {
		this.run({ kind: "main", project, from: project.mainCircuit, to });
	}

	undo(): void {
		for (let i = this.ops.length - 1; i >= 0; i--) apply(this.ops[i], false);
	}

	redo(): void {
		for (const op of this.ops) apply(op, true);
	}

	/** Circuits touched by this transaction. */
	circuits(): Set<Circuit> {
		const ret = new Set<Circuit>();
		for (const op of this.ops) if ("circuit" in op) ret.add(op.circuit);
		return ret;
	}
}

export class History {
	private undoStack: Transaction[] = [];
	private redoStack: Transaction[] = [];

	constructor(private readonly limit = 200) {}

	push(tx: Transaction): void {
		if (tx.ops.length === 0) return;
		this.undoStack.push(tx);
		if (this.undoStack.length > this.limit) this.undoStack.shift();
		this.redoStack = [];
	}

	canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	undoLabel(): string | null {
		return this.undoStack.at(-1)?.label ?? null;
	}

	/** Project.getLastAction(): the transaction Undo would revert. */
	lastTransaction(): Transaction | null {
		return this.undoStack.at(-1) ?? null;
	}

	redoLabel(): string | null {
		return this.redoStack.at(-1)?.label ?? null;
	}

	undo(): Transaction | null {
		const tx = this.undoStack.pop();
		if (!tx) return null;
		tx.undo();
		this.redoStack.push(tx);
		return tx;
	}

	redo(): Transaction | null {
		const tx = this.redoStack.pop();
		if (!tx) return null;
		tx.redo();
		this.undoStack.push(tx);
		return tx;
	}

	clear(): void {
		this.undoStack = [];
		this.redoStack = [];
	}
}
