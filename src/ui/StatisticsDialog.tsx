"use client";

// Port of gui.main.StatisticsDialog.

import { useEffect, useRef } from "react";
import type { Circuit } from "@/engine/circuit";
import { t } from "@/i18n/es";
import { type ComponentCount, computeStatistics } from "@/project/statistics";
import { componentName } from "./panels";
import type { Workspace } from "./workspace";

export function StatisticsDialog({
	ws,
	circuit,
	onClose,
}: {
	ws: Workspace;
	circuit: Circuit;
	onClose: () => void;
}) {
	const ref = useRef<HTMLDialogElement>(null);
	const projectName = ws.fileName.replace(/\.circ$/, "");
	const stats = computeStatistics(ws.project, circuit, projectName);
	useEffect(() => {
		const dialog = ref.current;
		dialog?.showModal();
		return () => dialog?.close();
	}, []);
	const cells = (c: ComponentCount) => (
		<>
			<td className="px-3 py-1.5 text-right tabular-nums">{c.simple}</td>
			<td className="px-3 py-1.5 text-right tabular-nums">{c.unique}</td>
			<td className="px-3 py-1.5 text-right tabular-nums">{c.recursive}</td>
		</>
	);
	return (
		<dialog
			ref={ref}
			aria-labelledby="stats-title"
			onCancel={onClose}
			onKeyDown={(e) => e.stopPropagation()}
			className="modal-motion m-auto max-h-[90dvh] w-[min(640px,calc(100vw-16px))] overflow-hidden rounded-xl border border-line bg-panel p-0 text-foreground shadow-xl backdrop:bg-black/30 [&[open]]:flex [&[open]]:flex-col"
		>
			<h2 id="stats-title" className="border-b border-line px-5 py-3 text-lg font-semibold">
				Estadísticas de {circuit.name}
			</h2>
			<div className="min-h-0 flex-1 overflow-auto">
				<table className="w-full text-sm">
					<thead className="sticky top-0 bg-panel text-left text-xs text-muted">
						<tr>
							<th className="px-3 py-2 font-medium">Componente</th>
							<th className="px-3 py-2 font-medium">Librería</th>
							<th className="px-3 py-2 text-right font-medium" title="Componentes colocados en este circuito">
								Simple
							</th>
							<th
								className="px-3 py-2 text-right font-medium"
								title="Sumando una vez cada circuito distinto que usa"
							>
								Único
							</th>
							<th
								className="px-3 py-2 text-right font-medium"
								title="Expandiendo cada instancia de subcircuito"
							>
								Recursivo
							</th>
						</tr>
					</thead>
					<tbody>
						{stats.counts.map((c) => (
							<tr key={`${c.library}:${c.factory?.name}`} className="border-t border-line">
								<td className="px-3 py-1.5">{c.factory ? componentName({ factory: c.factory }) : ""}</td>
								<td className="px-3 py-1.5 text-muted">
									{c.library.startsWith("lib.") ? t(c.library) : c.library}
								</td>
								{cells(c)}
							</tr>
						))}
						<tr className="border-t-2 border-line font-semibold">
							<td className="px-3 py-1.5" colSpan={2}>
								TOTAL (sin subcircuitos del proyecto)
							</td>
							{cells(stats.totalWithoutSubcircuits)}
						</tr>
						<tr className="border-t border-line font-semibold">
							<td className="px-3 py-1.5" colSpan={2}>
								TOTAL (con subcircuitos)
							</td>
							{cells(stats.totalWithSubcircuits)}
						</tr>
					</tbody>
				</table>
			</div>
			<div className="flex justify-end border-t border-line px-5 py-3">
				<button
					type="button"
					onClick={onClose}
					className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-black/5"
				>
					Cerrar
				</button>
			</div>
		</dialog>
	);
}
