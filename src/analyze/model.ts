// Port of com.cburch.logisim.analyze.model.{AnalyzerModel, VariableList,
// TruthTable, OutputExpressions}. The listener chain is kept as in Java: the
// truth table reacts to variable changes first, then the output expressions,
// and every edit keeps the table and the expressions consistent.

import type { Circuit } from "@/engine/circuit";
import { DONT_CARE, type Entry, ONE, ZERO } from "./entry";
import {
	constant,
	type Expression,
	equals,
	evaluate,
	removeVariable,
	replaceVariable,
	toText,
} from "./expression";
import { computeMinimal, FORMAT_SUM_OF_PRODUCTS, type Implicant, implicantsToExpression } from "./implicant";
import { replaceVariableInText } from "./parser";

export const MAX_INPUTS = 12;
export const MAX_OUTPUTS = 12;

export type VariableListEvent =
	| { type: "allReplaced" }
	| { type: "add"; variable: string }
	| { type: "remove"; variable: string; index: number }
	| { type: "move"; variable: string; delta: number }
	| { type: "replace"; variable: string; index: number };

type VariableListListener = (list: VariableList, e: VariableListEvent) => void;

export class VariableList {
	private readonly data: string[] = [];
	private readonly listeners: VariableListListener[] = [];

	constructor(readonly maxSize: number) {}

	addListener(l: VariableListListener): void {
		this.listeners.push(l);
	}

	private fire(e: VariableListEvent): void {
		for (const l of this.listeners) l(this, e);
	}

	getAll(): readonly string[] {
		return this.data;
	}

	get size(): number {
		return this.data.length;
	}

	isFull(): boolean {
		return this.data.length >= this.maxSize;
	}

	get(index: number): string {
		return this.data[index];
	}

	indexOf(name: string): number {
		return this.data.indexOf(name);
	}

	contains(name: string): boolean {
		return this.data.includes(name);
	}

	setAll(values: readonly string[]): void {
		if (values.length > this.maxSize) throw new Error(`maximum size is ${this.maxSize}`);
		this.data.splice(0, this.data.length, ...values);
		this.fire({ type: "allReplaced" });
	}

	add(name: string): void {
		if (this.isFull()) throw new Error(`maximum size is ${this.maxSize}`);
		this.data.push(name);
		this.fire({ type: "add", variable: name });
	}

	remove(name: string): void {
		const index = this.data.indexOf(name);
		if (index < 0) throw new Error(`input ${name}`);
		this.data.splice(index, 1);
		this.fire({ type: "remove", variable: name, index });
	}

	move(name: string, delta: number): void {
		const index = this.data.indexOf(name);
		if (index < 0) throw new Error(name);
		const newIndex = index + delta;
		if (newIndex < 0 || newIndex > this.data.length - 1) {
			throw new Error(`cannot move index ${index} by ${delta}`);
		}
		if (index === newIndex) return;
		this.data.splice(index, 1);
		this.data.splice(newIndex, 0, name);
		this.fire({ type: "move", variable: name, delta: newIndex - index });
	}

	replace(oldName: string, newName: string): void {
		const index = this.data.indexOf(oldName);
		if (index < 0) throw new Error(oldName);
		if (oldName === newName) return;
		this.data[index] = newName;
		this.fire({ type: "replace", variable: oldName, index });
	}
}

export function isInputSet(row: number, column: number, inputs: number): boolean {
	return ((row >> (inputs - 1 - column)) & 1) === 1;
}

type TruthTableListener = { cellsChanged(column: number): void; structureChanged(): void };

export class TruthTable {
	private readonly outputColumns = new Map<string, Entry[]>();
	private readonly listeners: TruthTableListener[] = [];

	constructor(private readonly model: AnalyzerModel) {
		model.inputs.addListener((_, e) => {
			this.inputsChanged(e);
			this.fireStructureChanged();
		});
		model.outputs.addListener((_, e) => {
			this.outputsChanged(e);
			this.fireStructureChanged();
		});
	}

	addListener(l: TruthTableListener): void {
		this.listeners.push(l);
	}

	private fireCellsChanged(column: number): void {
		for (const l of this.listeners) l.cellsChanged(column);
	}

	private fireStructureChanged(): void {
		for (const l of this.listeners) l.structureChanged();
	}

	private inputsChanged(e: VariableListEvent): void {
		for (const [output, column] of Array.from(this.outputColumns)) {
			if (e.type === "add") {
				const next = new Array<Entry>(2 * column.length);
				for (let i = 0; i < column.length; i++) {
					next[2 * i] = column[i];
					next[2 * i + 1] = column[i];
				}
				this.outputColumns.set(output, next);
			} else if (e.type === "remove") {
				this.outputColumns.set(output, this.removeInput(column, e.index));
			} else if (e.type === "move") {
				const newIndex = this.model.inputs.indexOf(e.variable);
				this.outputColumns.set(output, this.moveInput(column, newIndex - e.delta, newIndex));
			}
		}
	}

	private outputsChanged(e: VariableListEvent): void {
		if (e.type === "allReplaced") {
			this.outputColumns.clear();
		} else if (e.type === "remove") {
			this.outputColumns.delete(e.variable);
		} else if (e.type === "replace") {
			const column = this.outputColumns.get(e.variable);
			if (column !== undefined) {
				this.outputColumns.delete(e.variable);
				this.outputColumns.set(this.model.outputs.get(e.index), column);
			}
		}
	}

	/** Rows that only differed in the removed input merge; conflicts become x. */
	private removeInput(old: Entry[], index: number): Entry[] {
		const oldInputCount = this.model.inputs.size + 1;
		const ret: Entry[] = [];
		const mask = 1 << (oldInputCount - 1 - index);
		for (let i = 0; i < old.length; i++) {
			if ((i & mask) === 0) {
				const e0 = old[i];
				const e1 = old[i | mask];
				ret.push(e0 === e1 ? e0 : DONT_CARE);
			}
		}
		return ret;
	}

	private moveInput(old: Entry[], oldIndexIn: number, newIndexIn: number): Entry[] {
		const inputs = this.model.inputs.size;
		const oldIndex = inputs - 1 - oldIndexIn;
		const newIndex = inputs - 1 - newIndexIn;
		const ret = new Array<Entry>(old.length);
		const sameMask =
			(old.length - 1) ^
			((1 << (1 + Math.max(oldIndex, newIndex))) - 1) ^
			((1 << Math.min(oldIndex, newIndex)) - 1); // bits that don't change
		const moveMask = 1 << oldIndex; // bit that moves
		const moveDist = Math.abs(newIndex - oldIndex);
		const moveLeft = newIndex > oldIndex;
		const blockMask = (old.length - 1) ^ sameMask ^ moveMask; // bits that move by one
		for (let i = 0; i < old.length; i++) {
			const j = moveLeft
				? (i & sameMask) | ((i & moveMask) << moveDist) | ((i & blockMask) >> 1)
				: (i & sameMask) | ((i & moveMask) >> moveDist) | ((i & blockMask) << 1);
			ret[j] = old[i];
		}
		return ret;
	}

	get rowCount(): number {
		return 1 << this.model.inputs.size;
	}

	get inputColumnCount(): number {
		return this.model.inputs.size;
	}

	get outputColumnCount(): number {
		return this.model.outputs.size;
	}

	getInputEntry(row: number, column: number): Entry {
		return isInputSet(row, column, this.model.inputs.size) ? ONE : ZERO;
	}

	getOutputEntry(row: number, column: number): Entry {
		if (row < 0 || row >= this.rowCount || column < 0 || column >= this.model.outputs.size) return DONT_CARE;
		const data = this.outputColumns.get(this.model.outputs.get(column));
		if (data === undefined) return DONT_CARE;
		return row < data.length ? data[row] : DONT_CARE;
	}

	setOutputEntry(row: number, column: number, value: Entry): void {
		if (row < 0 || row >= this.rowCount) throw new Error(`row index: ${row} size: ${this.rowCount}`);
		if (column < 0 || column >= this.model.outputs.size) throw new Error(`column index: ${column}`);
		const name = this.model.outputs.get(column);
		let data = this.outputColumns.get(name);
		if (data === undefined) {
			if (value === DONT_CARE) return;
			data = new Array<Entry>(this.rowCount).fill(DONT_CARE);
			this.outputColumns.set(name, data);
			data[row] = value;
		} else {
			if (data[row] === value) return;
			data[row] = value;
		}
		this.fireCellsChanged(column);
	}

	/** The entries of every row, without creating the column. */
	getEntries(column: number): Entry[] {
		return Array.from({ length: this.rowCount }, (_, row) => this.getOutputEntry(row, column));
	}

	getOutputColumn(column: number): Entry[] {
		if (column < 0 || column >= this.model.outputs.size) throw new Error(`index: ${column}`);
		const name = this.model.outputs.get(column);
		let data = this.outputColumns.get(name);
		if (data === undefined) {
			data = new Array<Entry>(this.rowCount).fill(DONT_CARE);
			this.outputColumns.set(name, data);
		}
		return data;
	}

	setOutputColumn(column: number, values: Entry[] | null): void {
		if (values !== null && values.length !== this.rowCount) {
			throw new Error("argument to setOutputColumn is wrong length");
		}
		if (column < 0 || column >= this.model.outputs.size) throw new Error(`index: ${column}`);
		const name = this.model.outputs.get(column);
		if (this.outputColumns.get(name) === values) return;
		if (values === null) this.outputColumns.delete(name);
		else this.outputColumns.set(name, values);
		this.fireCellsChanged(column);
	}
}

export type OutputExpressionsEvent =
	| { type: "allVariablesReplaced" }
	| { type: "expression"; variable: string }
	| { type: "minimal"; variable: string };

class OutputData {
	format = FORMAT_SUM_OF_PRODUCTS;
	expr: Expression | null = null;
	exprString: string | null = null;
	minimalImplicants: Implicant[] | null = null;
	minimalExpr: Expression | null = null;
	private invalidating = false;

	constructor(
		private readonly owner: OutputExpressions,
		public output: string,
	) {
		this.invalidate(true, false);
	}

	private get model(): AnalyzerModel {
		return this.owner.model;
	}

	isExpressionMinimal(): boolean {
		return this.expr === this.minimalExpr;
	}

	getExpressionString(): string {
		if (this.exprString === null) {
			if (this.expr === null) this.invalidate(false, false);
			this.exprString = this.expr === null ? "" : toText(this.expr);
		}
		return this.exprString;
	}

	getMinimalExpression(): Expression | null {
		if (this.minimalExpr === null) this.invalidate(false, false);
		return this.minimalExpr;
	}

	setMinimizedFormat(value: number): void {
		if (this.format !== value) {
			this.format = value;
			this.invalidate(false, true);
		}
	}

	setExpression(expr: Expression | null, exprString: string | null): void {
		this.expr = expr;
		this.exprString = exprString;
		if (expr !== this.minimalExpr) {
			// for efficiency, avoid recomputation
			const values = computeColumn(this.model, expr);
			const column = this.model.outputs.indexOf(this.output);
			this.owner.updatingTable = true;
			try {
				this.model.truthTable.setOutputColumn(column, values);
			} finally {
				this.owner.updatingTable = false;
			}
		}
		this.owner.fire({ type: "expression", variable: this.output });
	}

	removeInput(input: string): void {
		const oldMinExpr = this.minimalExpr;
		this.minimalImplicants = null;
		this.minimalExpr = null;
		this.exprString = null; // recompute it
		if (this.expr !== null) {
			const oldExpr = this.expr;
			let newExpr: Expression | null;
			if (oldExpr === oldMinExpr) {
				newExpr = this.getMinimalExpression();
				this.expr = newExpr;
			} else {
				newExpr = removeVariable(this.expr, input);
			}
			if (newExpr === null || !equals(newExpr, oldExpr)) {
				this.expr = newExpr;
				this.owner.fire({ type: "expression", variable: this.output });
			}
		}
		this.owner.fire({ type: "minimal", variable: this.output });
	}

	replaceInput(input: string, newName: string): void {
		this.minimalExpr = null;
		if (this.exprString !== null) this.exprString = replaceVariableInText(this.exprString, input, newName);
		if (this.expr !== null) {
			const newExpr = replaceVariable(this.expr, input, newName);
			if (!equals(newExpr, this.expr)) {
				this.expr = newExpr;
				this.owner.fire({ type: "expression", variable: this.output });
			}
		} else {
			this.owner.fire({ type: "expression", variable: this.output });
		}
		this.owner.fire({ type: "minimal", variable: this.output });
	}

	invalidate(initializing: boolean, formatChanged: boolean): void {
		if (this.invalidating) return;
		this.invalidating = true;
		try {
			const oldImplicants = this.minimalImplicants;
			const oldMinExpr = this.minimalExpr;
			const column = this.model.outputs.indexOf(this.output);
			this.minimalImplicants =
				column < 0 ? [] : computeMinimal(this.format, this.model.truthTable.getEntries(column));
			this.minimalExpr = implicantsToExpression(
				this.format,
				this.model.inputs.getAll(),
				this.minimalImplicants,
			);
			const minChanged = !implicantsSame(oldImplicants, this.minimalImplicants);

			if (!this.owner.updatingTable) {
				// is the expression still consistent with the truth table?
				const outputColumn = computeColumn(this.model, this.expr);
				const currentColumn = this.model.truthTable.getOutputColumn(column);
				if (!columnsMatch(currentColumn, outputColumn) || isAllUndefined(outputColumn) || formatChanged) {
					// if not, change the expression to maintain consistency
					const exprChanged = this.expr !== oldMinExpr || minChanged;
					this.expr = this.minimalExpr;
					if (exprChanged) {
						this.exprString = null;
						if (!initializing) this.owner.fire({ type: "expression", variable: this.output });
					}
				}
			}
			if (!initializing && minChanged) this.owner.fire({ type: "minimal", variable: this.output });
		} finally {
			this.invalidating = false;
		}
	}
}

function computeColumn(model: AnalyzerModel, expr: Expression | null): Entry[] {
	const rows = model.truthTable.rowCount;
	const inputs = model.inputs.getAll();
	if (expr === null) return new Array<Entry>(rows).fill(DONT_CARE);
	const values = new Array<Entry>(rows);
	const assignment = new Map<string, boolean>();
	for (let i = 0; i < rows; i++) {
		inputs.forEach((name, j) => {
			assignment.set(name, isInputSet(i, j, inputs.length));
		});
		values[i] = evaluate(expr, assignment) ? ONE : ZERO;
	}
	return values;
}

function isDefined(e: Entry): boolean {
	return e === ZERO || e === ONE;
}

function columnsMatch(a: Entry[], b: Entry[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i] && isDefined(a[i]) && isDefined(b[i])) return false;
	}
	return true;
}

function isAllUndefined(a: Entry[]): boolean {
	return !a.some(isDefined);
}

function implicantsSame(a: Implicant[] | null, b: Implicant[] | null): boolean {
	if (a === null) return b === null || b.length === 0;
	if (b === null) return a.length === 0;
	return a.length === b.length && a.every((imp, i) => imp.equals(b[i]));
}

export class OutputExpressions {
	private readonly outputData = new Map<string, OutputData>();
	private readonly listeners: ((e: OutputExpressionsEvent) => void)[] = [];
	updatingTable = false;

	constructor(readonly model: AnalyzerModel) {
		model.inputs.addListener((list, e) => this.inputsChanged(list, e));
		model.outputs.addListener((list, e) => this.outputsChanged(list, e));
		model.truthTable.addListener({
			cellsChanged: (column) =>
				this.getOutputData(model.outputs.get(column), false)?.invalidate(false, false),
			structureChanged: () => {},
		});
	}

	addListener(l: (e: OutputExpressionsEvent) => void): void {
		this.listeners.push(l);
	}

	fire(e: OutputExpressionsEvent): void {
		for (const l of this.listeners) l(e);
	}

	private inputsChanged(list: VariableList, e: VariableListEvent): void {
		if (e.type === "allReplaced" && this.outputData.size > 0) {
			this.outputData.clear();
			this.fire({ type: "allVariablesReplaced" });
		} else if (e.type === "remove") {
			for (const data of Array.from(this.outputData.values())) data.removeInput(e.variable);
		} else if (e.type === "replace") {
			const newName = list.get(e.index);
			for (const data of Array.from(this.outputData.values())) data.replaceInput(e.variable, newName);
		} else if (e.type === "move" || e.type === "add") {
			for (const data of Array.from(this.outputData.values())) data.invalidate(false, false);
		}
	}

	private outputsChanged(list: VariableList, e: VariableListEvent): void {
		if (e.type === "allReplaced" && this.outputData.size > 0) {
			this.outputData.clear();
			this.fire({ type: "allVariablesReplaced" });
		} else if (e.type === "remove") {
			this.outputData.delete(e.variable);
		} else if (e.type === "replace") {
			const toMove = this.outputData.get(e.variable);
			if (toMove !== undefined) {
				this.outputData.delete(e.variable);
				toMove.output = list.get(e.index);
				this.outputData.set(toMove.output, toMove);
			}
		}
	}

	private getOutputData(output: string, create: true): OutputData;
	private getOutputData(output: string, create: boolean): OutputData | undefined;
	private getOutputData(output: string, create: boolean): OutputData | undefined {
		let ret = this.outputData.get(output);
		if (ret === undefined && create) {
			if (this.model.outputs.indexOf(output) < 0) throw new Error(`unrecognized output ${output}`);
			ret = new OutputData(this, output);
			this.outputData.set(output, ret);
		}
		return ret;
	}

	getExpression(output: string | null): Expression | null {
		return output === null ? null : this.getOutputData(output, true).expr;
	}

	getExpressionString(output: string | null): string {
		return output === null ? "" : this.getOutputData(output, true).getExpressionString();
	}

	isExpressionMinimal(output: string): boolean {
		return this.getOutputData(output, false)?.isExpressionMinimal() ?? true;
	}

	getMinimalExpression(output: string | null): Expression | null {
		return output === null ? constant(0) : this.getOutputData(output, true).getMinimalExpression();
	}

	getMinimalImplicants(output: string | null): Implicant[] | null {
		return output === null ? [] : this.getOutputData(output, true).minimalImplicants;
	}

	getMinimizedFormat(output: string | null): number {
		return output === null ? FORMAT_SUM_OF_PRODUCTS : this.getOutputData(output, true).format;
	}

	setMinimizedFormat(output: string, format: number): void {
		if (format !== this.getMinimizedFormat(output)) {
			const data = this.getOutputData(output, true);
			data.setMinimizedFormat(format);
			// OutputExpressions.invalidate ignores its formatChanged argument
			data.invalidate(false, false);
		}
	}

	setExpression(output: string | null, expr: Expression | null, exprString: string | null = null): void {
		if (output === null) return;
		this.getOutputData(output, true).setExpression(expr, exprString);
	}
}

export class AnalyzerModel {
	readonly inputs = new VariableList(MAX_INPUTS);
	readonly outputs = new VariableList(MAX_OUTPUTS);
	// the order matters: the output expressions listen to the truth table
	readonly truthTable = new TruthTable(this);
	readonly outputExpressions = new OutputExpressions(this);
	/** Circuit analyzed last; the default target of "Crear Circuito". */
	currentCircuit: Circuit | null = null;

	private version = 0;
	private readonly subscribers = new Set<() => void>();

	private notifyScheduled = false;

	constructor() {
		// Lazy getters may recompute (and fire) while React renders, so
		// subscribers hear about changes afterwards, once per batch.
		const bump = () => {
			this.version++;
			if (this.notifyScheduled) return;
			this.notifyScheduled = true;
			queueMicrotask(() => {
				this.notifyScheduled = false;
				for (const l of Array.from(this.subscribers)) l();
			});
		};
		this.inputs.addListener(bump);
		this.outputs.addListener(bump);
		this.truthTable.addListener({ cellsChanged: bump, structureChanged: bump });
		this.outputExpressions.addListener(bump);
	}

	subscribe = (l: () => void): (() => void) => {
		this.subscribers.add(l);
		return () => this.subscribers.delete(l);
	};

	getVersion = (): number => this.version;

	setVariables(inputs: readonly string[], outputs: readonly string[]): void {
		this.inputs.setAll(inputs);
		this.outputs.setAll(outputs);
	}
}
