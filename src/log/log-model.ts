// Port of com.cburch.logisim.gui.log.{Model, Selection, SelectionItem,
// ValueLog} and the tree of ComponentSelector. A model belongs to one root
// circuit state; after each propagation it appends a row if any selected
// value changed, keeping the last 400 rows, and optionally builds a text file.

import { LABEL } from "@/components/std-attrs";
import { SubcircuitFactory } from "@/components/subcircuit";
import type { Instance } from "@/engine/component";
import { formatLoc } from "@/engine/geom";
import { type CircuitState, InstanceStateImpl } from "@/engine/simulation";
import type { Value } from "@/engine/value";
import { t } from "@/i18n/es";
import { formatLogValue, type InstanceLogger, LOGGERS } from "./loggers";

const LOG_SIZE = 400;

function displayName(inst: Instance): string {
	const f = inst.factory;
	return f instanceof SubcircuitFactory ? f.name : f.displayKey ? t(f.displayKey) : f.name;
}

function loggerOf(inst: Instance): InstanceLogger | undefined {
	return LOGGERS.get(inst.factory);
}

/** The state of `inst`'s circuit reached through the subcircuit `path`. */
function stateAt(root: CircuitState, path: readonly Instance[]): CircuitState {
	let cur = root;
	for (const sub of path) cur = (sub.factory as SubcircuitFactory).getSubstate(cur, sub);
	return cur;
}

/** SelectionItem.computeDescriptors: the short name. */
function shortName(
	root: CircuitState,
	path: readonly Instance[],
	comp: Instance,
	option: number | null,
): string {
	const logger = loggerOf(comp);
	const state = new InstanceStateImpl(stateAt(root, path), comp);
	const name = logger?.getLogName(state, option);
	if (name) return name;
	return `${displayName(comp)}${formatLoc(comp.loc)}${option === null ? "" : `.${option}`}`;
}

export class LogItem {
	radix = 2;

	constructor(
		readonly path: readonly Instance[],
		readonly comp: Instance,
		readonly option: number | null,
	) {}

	same(o: LogItem): boolean {
		return (
			this.comp === o.comp &&
			this.option === o.option &&
			this.path.length === o.path.length &&
			this.path.every((p, i) => p === o.path[i])
		);
	}

	shortName(root: CircuitState): string {
		return shortName(root, this.path, this.comp, this.option);
	}

	/** SelectionItem.toString: subcircuit labels (or name + location) joined by dots. */
	longName(root: CircuitState): string {
		const prefix = this.path.map((p) => {
			const label = p.attrs.get(LABEL);
			return `${label ? label : `${displayName(p)}${formatLoc(p.loc)}`}.`;
		});
		return prefix.join(".") + this.shortName(root);
	}

	fetchValue(root: CircuitState): Value {
		const logger = loggerOf(this.comp) as InstanceLogger;
		return logger.getLogValue(new InstanceStateImpl(stateAt(root, this.path), this.comp), this.option);
	}
}

/** A node of the component tree offered for selection. */
export interface LogTreeNode {
	label: string;
	/** Present on loggable components (and on each option of multi-valued ones). */
	item: LogItem | null;
	children: LogTreeNode[];
}

/** ComponentSelector: loggable components by name, then subcircuits. */
export function logTree(root: CircuitState): LogTreeNode {
	const build = (path: Instance[], label: string): LogTreeNode => {
		const state = stateAt(root, path);
		const comps: LogTreeNode[] = [];
		const subs: Instance[] = [];
		for (const comp of state.circuit.components) {
			if (comp.factory instanceof SubcircuitFactory) {
				subs.push(comp);
				continue;
			}
			const logger = loggerOf(comp);
			if (!logger) continue;
			const options = logger.getLogOptions?.(new InstanceStateImpl(state, comp)) ?? null;
			comps.push({
				label: shortName(root, path, comp, null),
				item: options === null ? new LogItem(path, comp, null) : null,
				children: (options ?? []).map((o) => ({
					label: shortName(root, path, comp, o),
					item: new LogItem(path, comp, o),
					children: [],
				})),
			});
		}
		comps.sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));
		subs.sort((a, b) => a.y - b.y || a.x - b.x);
		const children = subs.map((sub) => {
			const subLabel = sub.attrs.get(LABEL);
			return build([...path, sub], subLabel ? subLabel : `${displayName(sub)}${formatLoc(sub.loc)}`);
		});
		return { label, item: null, children: [...comps, ...children] };
	};
	return build([], root.circuit.name);
}

export class LogModel {
	readonly selection: LogItem[] = [];
	private readonly logs = new Map<LogItem, Value[]>();
	/** Rows recorded for the file since it was enabled (LogThread). */
	fileEnabled = false;
	fileHeader = true;
	fileLines: string[] = [];
	private headerDirty = true;
	private version = 0;
	private readonly listeners = new Set<() => void>();

	constructor(readonly root: CircuitState) {}

	subscribe = (l: () => void): (() => void) => {
		this.listeners.add(l);
		return () => this.listeners.delete(l);
	};

	getVersion = (): number => this.version;

	private fire(): void {
		this.version++;
		for (const l of Array.from(this.listeners)) l();
	}

	getValues(item: LogItem): readonly Value[] {
		return this.logs.get(item) ?? [];
	}

	/** Number of rows currently kept (all items have the same length). */
	get rowCount(): number {
		return this.selection.length === 0 ? 0 : this.getValues(this.selection[0]).length;
	}

	add(item: LogItem): void {
		if (this.selection.some((i) => i.same(item))) return;
		this.selection.push(item);
		this.headerDirty = true;
		this.fire();
	}

	remove(item: LogItem): void {
		const i = this.selection.indexOf(item);
		if (i < 0) return;
		this.selection.splice(i, 1);
		this.logs.delete(item);
		this.headerDirty = true;
		this.fire();
	}

	move(item: LogItem, delta: number): void {
		const i = this.selection.indexOf(item);
		const j = i + delta;
		if (i < 0 || j < 0 || j >= this.selection.length) return;
		this.selection.splice(i, 1);
		this.selection.splice(j, 0, item);
		this.headerDirty = true;
		this.fire();
	}

	/** "Cambiar Base" cycles 2 → 10 → 16 → 2 (SelectionPanel). */
	changeRadix(item: LogItem): void {
		item.radix = item.radix === 2 ? 10 : item.radix === 10 ? 16 : 2;
		this.fire();
	}

	/** Model.propagationCompleted */
	propagationCompleted(): void {
		if (this.selection.length === 0) return;
		const vals = this.selection.map((item) => item.fetchValue(this.root));
		const changed = this.selection.some((item, i) => {
			const last = this.getValues(item).at(-1);
			return last === undefined || !last.equals(vals[i]);
		});
		if (!changed) return;
		this.selection.forEach((item, i) => {
			let log = this.logs.get(item);
			if (!log) {
				log = [];
				this.logs.set(item, log);
			}
			log.push(vals[i]);
			if (log.length > LOG_SIZE) log.shift();
		});
		if (this.fileEnabled) {
			if (this.headerDirty && this.fileHeader) {
				this.fileLines.push(this.selection.map((i) => i.longName(this.root)).join("\t"));
			}
			this.headerDirty = false;
			this.fileLines.push(this.selection.map((item, i) => formatLogValue(vals[i], item.radix)).join("\t"));
		}
		this.fire();
	}

	setFileEnabled(enabled: boolean): void {
		if (enabled === this.fileEnabled) return;
		this.fileEnabled = enabled;
		if (enabled) {
			this.fileLines = [];
			this.headerDirty = true;
		}
		this.fire();
	}

	setFileHeader(header: boolean): void {
		this.fileHeader = header;
		this.headerDirty = true;
		this.fire();
	}

	/** Drop items whose components left the circuits (Selection's circuit listener). */
	prune(): void {
		const alive = (item: LogItem) => {
			let state: CircuitState = this.root;
			for (const sub of item.path) {
				if (!state.circuit.components.has(sub)) return false;
				state = (sub.factory as SubcircuitFactory).getSubstate(state, sub);
			}
			return state.circuit.components.has(item.comp);
		};
		const dead = this.selection.filter((i) => !alive(i));
		for (const item of dead) this.remove(item);
	}
}
