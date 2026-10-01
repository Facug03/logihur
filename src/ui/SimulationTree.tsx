"use client";

// Port of gui.main.SimulationTreeModel: the hierarchy of subcircuit instances
// of the simulated circuit; choosing one shows that instance's state.

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { LABEL } from "@/components/std-attrs";
import { SubcircuitFactory } from "@/components/subcircuit";
import type { Instance } from "@/engine/component";
import { formatLoc } from "@/engine/geom";
import type { CircuitState } from "@/engine/simulation";
import { Disclosure } from "./PanelControls";
import { LogisimIcon } from "./panels";
import type { Workspace } from "./workspace";

/** SimulationTreeCircuitNode.toString */
function nodeLabel(state: CircuitState, via: Instance | null): string {
	const label = via?.attrs.get(LABEL);
	if (label) return label;
	return via ? `${state.circuit.name}${formatLoc(via.loc)}` : state.circuit.name;
}

/** Sorted by circuit name, then by location, like SimulationTreeCircuitNode.compare. */
function subcircuits(state: CircuitState): Instance[] {
	return Array.from(state.circuit.components)
		.filter((c) => c.factory instanceof SubcircuitFactory)
		.sort(
			(a, b) =>
				a.factory.name.toLowerCase().localeCompare(b.factory.name.toLowerCase()) ||
				formatLoc(a.loc).localeCompare(formatLoc(b.loc)),
		);
}

function Node({
	ws,
	state,
	path,
	depth,
}: {
	ws: Workspace;
	state: CircuitState;
	path: Instance[];
	depth: number;
}) {
	const viewing = ws.viewStack.map((v) => v.via).slice(1);
	const onPath = path.every((p, i) => viewing[i] === p);
	const current = onPath && path.length === viewing.length;
	const [open, setOpen] = useState(depth === 0 || onPath);
	const children = subcircuits(state);
	return (
		<li>
			<div className="flex items-center" style={{ paddingLeft: depth * 12 }}>
				{children.length > 0 ? (
					<button
						type="button"
						aria-label={open ? "Contraer" : "Expandir"}
						aria-expanded={open}
						onClick={() => setOpen(!open)}
						className="rounded p-0.5 hover:bg-black/5"
					>
						<ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
					</button>
				) : (
					<span className="w-[18px]" />
				)}
				<button
					type="button"
					aria-current={current ? "true" : undefined}
					onClick={() => ws.viewPath(path)}
					className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm ${
						current ? "bg-accent/10 font-medium text-accent" : "hover:bg-black/5"
					}`}
				>
					<LogisimIcon name="subcirc.gif" />
					<span className="truncate">{nodeLabel(state, path.at(-1) ?? null)}</span>
				</button>
			</div>
			{open && children.length > 0 && (
				<ul>
					{children.map((inst) => (
						<Node
							key={inst.id}
							ws={ws}
							state={(inst.factory as SubcircuitFactory).getSubstate(state, inst)}
							path={[...path, inst]}
							depth={depth + 1}
						/>
					))}
				</ul>
			)}
		</li>
	);
}

export function SimulationTree({ ws }: { ws: Workspace }) {
	const root = ws.viewStack[0]?.state;
	if (!root || subcircuits(root).length === 0) return null;
	return (
		<section className="flex flex-col gap-0.5 p-3">
			<Disclosure id="simulation" title="Simulación">
				<ul aria-label="Árbol de simulación">
					<Node ws={ws} state={root} path={[]} depth={0} />
				</ul>
			</Disclosure>
		</section>
	);
}
