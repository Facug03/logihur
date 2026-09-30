"use client";

// Port of analyze.gui.Analyzer: the "Análisis Combinacional" window.

import { Info, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { AnalyzerTab } from "@/analyze/analyze";
import { t } from "@/i18n/es";
import type { Workspace } from "../workspace";
import { BuildCircuitDialog } from "./BuildCircuitDialog";
import { ExpressionTab, MinimizedTab } from "./ExpressionTabs";
import { TruthTableTab } from "./TruthTableTab";
import { buttonClass, primaryButtonClass, VariablesTab } from "./VariablesTab";

const TABS: { id: AnalyzerTab; label: string; tip: string }[] = [
	{ id: "inputs", label: "analyze.inputsTab", tip: "analyze.inputsTabTip" },
	{ id: "outputs", label: "analyze.outputsTab", tip: "analyze.outputsTabTip" },
	{ id: "table", label: "analyze.tableTab", tip: "analyze.tableTabTip" },
	{ id: "expression", label: "analyze.expressionTab", tip: "analyze.expressionTabTip" },
	{ id: "minimized", label: "analyze.minimizedTab", tip: "analyze.minimizedTabTip" },
];

export function AnalyzerDialog({
	ws,
	initialTab,
	notice,
	onClose,
	onBuilt,
}: {
	ws: Workspace;
	initialTab: AnalyzerTab;
	notice: string | null;
	onClose: () => void;
	onBuilt: () => void;
}) {
	const model = ws.analyzer;
	useSyncExternalStore(model.subscribe, model.getVersion, model.getVersion);
	const [tab, setTab] = useState(initialTab);
	const [shownNotice, setShownNotice] = useState(notice);
	const [selectedOutput, setSelectedOutput] = useState<string | null>(null);
	const [building, setBuilding] = useState(false);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

	// OutputSelector: keep the choice while it exists, else the first output
	const outputs = model.outputs.getAll();
	const output =
		selectedOutput !== null && outputs.includes(selectedOutput) ? selectedOutput : (outputs[0] ?? null);

	useEffect(() => {
		const previous = document.activeElement;
		const dialog = dialogRef.current;
		dialog?.showModal();
		return () => {
			dialog?.close();
			if (previous instanceof HTMLElement) previous.focus();
		};
	}, []);

	const index = TABS.findIndex((x) => x.id === tab);

	return createPortal(
		<dialog
			ref={dialogRef}
			aria-labelledby="analyzer-title"
			onCancel={(e) => {
				e.preventDefault();
				if (!building) onClose();
			}}
			onKeyDown={(e) => e.stopPropagation()}
			className="modal-motion fixed inset-0 m-auto flex h-[min(720px,96dvh)] w-[min(760px,100vw-16px)] flex-col overflow-hidden rounded-xl border border-line bg-panel p-0 text-foreground shadow-xl backdrop:bg-black/40 [&:not([open])]:hidden"
		>
			<header className="flex items-start gap-2 border-b border-line px-4 pt-3">
				<div className="min-w-0 flex-1">
					<h2 id="analyzer-title" className="text-lg font-semibold">
						{t("analyze.windowTitle")}
					</h2>
					<p className="truncate text-xs text-muted">
						{model.currentCircuit ? `Circuito: ${model.currentCircuit.name}` : "Tabla definida a mano"} ·{" "}
						{model.inputs.size} entradas · {model.outputs.size} salidas
					</p>
				</div>
				<button
					type="button"
					aria-label="Cerrar"
					onClick={onClose}
					className="inline-flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-black/5"
				>
					<X className="size-5" />
				</button>
			</header>
			<div
				role="tablist"
				aria-label={t("analyze.windowTitle")}
				className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-3 [scrollbar-width:none]"
			>
				{TABS.map((x, i) => (
					<button
						key={x.id}
						ref={(el) => {
							tabRefs.current[i] = el;
						}}
						type="button"
						role="tab"
						id={`analyzer-tab-${x.id}`}
						aria-selected={x.id === tab}
						aria-controls="analyzer-panel"
						tabIndex={x.id === tab ? 0 : -1}
						title={t(x.tip)}
						onClick={() => setTab(x.id)}
						onKeyDown={(e) => {
							const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
							if (delta === 0) return;
							e.preventDefault();
							const next = (index + delta + TABS.length) % TABS.length;
							setTab(TABS[next].id);
							tabRefs.current[next]?.focus();
						}}
						className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm ${
							x.id === tab
								? "border-accent font-semibold text-foreground"
								: "border-transparent text-muted hover:text-foreground"
						}`}
					>
						{t(x.label)}
					</button>
				))}
			</div>
			<div
				id="analyzer-panel"
				role="tabpanel"
				aria-labelledby={`analyzer-tab-${tab}`}
				className="min-h-0 flex-1 overflow-y-auto p-4"
			>
				{shownNotice && (
					<div
						role="status"
						className="mb-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm"
					>
						<Info className="mt-0.5 size-4 shrink-0 text-amber-700" />
						<p className="flex-1">
							<strong className="font-semibold">{t("analyze.noExpressionTitle")}.</strong> {shownNotice}
						</p>
						<button
							type="button"
							aria-label="Ocultar aviso"
							onClick={() => setShownNotice(null)}
							className="rounded p-0.5 hover:bg-black/5"
						>
							<X className="size-4" />
						</button>
					</div>
				)}
				{tab === "inputs" && <VariablesTab key="inputs" list={model.inputs} label={t("analyze.inputsTab")} />}
				{tab === "outputs" && (
					<VariablesTab key="outputs" list={model.outputs} label={t("analyze.outputsTab")} />
				)}
				{tab === "table" && <TruthTableTab model={model} />}
				{tab === "expression" && (
					<ExpressionTab model={model} output={output} onOutputChange={setSelectedOutput} />
				)}
				{tab === "minimized" && (
					<MinimizedTab model={model} output={output} onOutputChange={setSelectedOutput} />
				)}
			</div>
			<footer className="flex shrink-0 justify-end gap-2 border-t border-line px-4 py-3">
				<button type="button" className={buttonClass} onClick={onClose}>
					Cerrar
				</button>
				<button type="button" className={primaryButtonClass} onClick={() => setBuilding(true)}>
					{t("analyze.buildCircuitButton")}
				</button>
			</footer>
			{building && (
				<BuildCircuitDialog
					ws={ws}
					onClose={() => setBuilding(false)}
					onBuilt={() => {
						setBuilding(false);
						onBuilt();
					}}
				/>
			)}
		</dialog>,
		document.body,
	);
}
