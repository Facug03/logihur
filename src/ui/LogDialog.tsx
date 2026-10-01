"use client";

// Port of gui.log.LogFrame: Selection, Table and File tabs. The file is built
// in memory while enabled and downloaded as text, since a web page cannot
// keep appending to a file on disk.

import { ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { msg, t } from "@/i18n/i18n";
import { type LogItem, type LogModel, type LogTreeNode, logTree } from "@/log/log-model";
import { formatLogValue } from "@/log/loggers";
import { buttonClass, primaryButtonClass } from "./analyzer/VariablesTab";

type Tab = "selection" | "table" | "file";
const TABS: { id: Tab; label: string; help: string }[] = [
	{
		id: "selection",
		label: msg("Selección"),
		help: msg("Seleccionar que valores de los componentes son registrados."),
	},
	{ id: "table", label: msg("Tabla"), help: msg("Ver valores registrados recientemente.") },
	{ id: "file", label: msg("Archivo"), help: msg("Configurar fichero de salida.") },
];

function TreeView({
	node,
	chosen,
	onChoose,
	onAdd,
	depth = 0,
}: {
	node: LogTreeNode;
	chosen: LogTreeNode | null;
	onChoose: (n: LogTreeNode) => void;
	onAdd: (n: LogTreeNode) => void;
	depth?: number;
}) {
	const [open, setOpen] = useState(depth === 0);
	const hasChildren = node.children.length > 0;
	return (
		<li>
			<div className="flex items-center" style={{ paddingLeft: depth * 14 }}>
				{hasChildren ? (
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
					aria-pressed={chosen === node}
					onClick={() => (hasChildren && !node.item ? setOpen(!open) : onChoose(node))}
					onDoubleClick={() => onAdd(node)}
					className={`min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left text-sm ${
						chosen === node
							? "bg-accent text-white"
							: node.item
								? "hover:bg-black/5"
								: "font-medium hover:bg-black/5"
					}`}
				>
					{node.label}
				</button>
			</div>
			{open && hasChildren && (
				<ul>
					{node.children.map((child) => (
						<TreeView
							key={`${child.label}-${child.item?.option ?? ""}`}
							node={child}
							chosen={chosen}
							onChoose={onChoose}
							onAdd={onAdd}
							depth={depth + 1}
						/>
					))}
				</ul>
			)}
		</li>
	);
}

function SelectionTab({ model }: { model: LogModel }) {
	const [tree] = useState(() => logTree(model.root));
	const [chosen, setChosen] = useState<LogTreeNode | null>(null);
	const [selected, setSelected] = useState<LogItem | null>(null);
	const current = selected && model.selection.includes(selected) ? selected : null;
	const index = current ? model.selection.indexOf(current) : -1;
	const add = (node: LogTreeNode | null) => {
		// a multi-valued component adds all its options, like selecting the parent in Logisim
		const items = node?.item ? [node.item] : (node?.children.flatMap((c) => (c.item ? [c.item] : [])) ?? []);
		for (const item of items) model.add(item);
	};
	return (
		<div className="grid gap-3 md:grid-cols-[1fr_auto_1fr]">
			<ul
				aria-label={t("Componentes")}
				className="h-64 overflow-auto rounded-md border border-line bg-panel p-1 md:h-80"
			>
				<TreeView node={tree} chosen={chosen} onChoose={setChosen} onAdd={add} />
			</ul>
			<div className="flex flex-row flex-wrap content-start gap-2 md:w-36 md:flex-col md:justify-center">
				<button type="button" className={buttonClass} disabled={!chosen} onClick={() => add(chosen)}>
					{t("Añadir")} &gt;&gt;
				</button>
				<button
					type="button"
					className={buttonClass}
					disabled={!current}
					onClick={() => current && model.changeRadix(current)}
				>
					{t("Cambiar Base")}
				</button>
				<button
					type="button"
					className={buttonClass}
					disabled={!current || index <= 0}
					onClick={() => current && model.move(current, -1)}
				>
					{t("log.moveUp")}
				</button>
				<button
					type="button"
					className={buttonClass}
					disabled={!current || index >= model.selection.length - 1}
					onClick={() => current && model.move(current, 1)}
				>
					{t("log.moveDown")}
				</button>
				<button
					type="button"
					className={buttonClass}
					disabled={!current}
					onClick={() => current && model.remove(current)}
				>
					&lt;&lt; {t("Eliminar")}
				</button>
			</div>
			<div
				role="listbox"
				aria-label={t("Valores registrados")}
				className="h-48 overflow-auto rounded-md border border-line bg-panel py-1 md:h-80"
			>
				{model.selection.map((item) => (
					<button
						key={item.longName(model.root)}
						type="button"
						role="option"
						aria-selected={item === current}
						onClick={() => setSelected(item)}
						className={`flex w-full gap-2 px-3 py-1.5 text-left text-sm ${item === current ? "bg-accent text-white" : "hover:bg-black/5"}`}
					>
						<span className="min-w-0 flex-1 truncate">{item.longName(model.root)}</span>
						<span className="font-mono text-xs opacity-70">base {item.radix}</span>
					</button>
				))}
			</div>
		</div>
	);
}

function TableTab({ model }: { model: LogModel }) {
	const ref = useRef<HTMLDivElement>(null);
	const rows = model.rowCount;
	// keep the newest row in view, like TablePanel's scroll to the end
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll when rows are added
	useEffect(() => {
		const el = ref.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [rows]);
	if (model.selection.length === 0) {
		return <p className="py-10 text-center text-muted">{t("La selección está vacía.")}</p>;
	}
	const columns = model.selection.map((item) => model.getValues(item));
	return (
		<div ref={ref} className="max-h-[55dvh] overflow-auto rounded-md border border-line">
			<table className="w-full font-mono text-sm">
				<thead className="sticky top-0 bg-panel">
					<tr>
						{model.selection.map((item) => (
							<th
								key={item.longName(model.root)}
								title={item.longName(model.root)}
								className="border-b border-line px-3 py-2 text-left font-sans text-xs font-semibold"
							>
								{item.shortName(model.root)}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{Array.from({ length: rows }, (_, r) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: rows are positional in a ring buffer
						<tr key={r} className="even:bg-black/[0.02]">
							{model.selection.map((item, c) => {
								const v = columns[c][r];
								return (
									<td key={item.longName(model.root)} className="whitespace-nowrap px-3 py-1">
										{v ? formatLogValue(v, item.radix) : ""}
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function FileTab({ model, fileName }: { model: LogModel; fileName: string }) {
	const download = () => {
		const url = URL.createObjectURL(new Blob([`${model.fileLines.join("\n")}\n`], { type: "text/plain" }));
		const a = document.createElement("a");
		a.href = url;
		a.download = `${fileName.replace(/\.circ$/, "")}-registro.txt`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	};
	const lines = model.fileLines.length;
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-3">
				<p className="text-sm">
					{model.fileEnabled ? t("Fichero de salida habilitado.") : t("Fichero de salida deshabilitado.")}
				</p>
				<button
					type="button"
					className={model.fileEnabled ? buttonClass : primaryButtonClass}
					onClick={() => model.setFileEnabled(!model.fileEnabled)}
				>
					{model.fileEnabled ? t("Deshabilitar") : t("Habilitar")}
				</button>
			</div>
			<label className="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					checked={model.fileHeader}
					onChange={(e) => model.setFileHeader(e.target.checked)}
				/>
				{t("Incluir Línea De Cabecera")}
			</label>
			<p className="text-sm text-muted">
				{t(
					"Mientras está habilitado, cada cambio de los valores seleccionados agrega una línea separada por tabuladores (en la base elegida).",
				)}{" "}
				{lines === 1 ? t("1 línea hasta ahora.") : t("{0} líneas hasta ahora.", [lines])}
			</p>
			<div className="flex gap-2">
				<button type="button" className={primaryButtonClass} disabled={lines === 0} onClick={download}>
					{t("Descargar archivo")}
				</button>
				<button
					type="button"
					className={buttonClass}
					disabled={lines === 0}
					onClick={() => {
						model.setFileEnabled(false);
						model.setFileEnabled(true);
					}}
				>
					{t("Empezar de nuevo")}
				</button>
			</div>
		</div>
	);
}

export function LogDialog({
	model,
	circuitName,
	fileName,
	onClose,
}: {
	model: LogModel;
	circuitName: string;
	fileName: string;
	onClose: () => void;
}) {
	useSyncExternalStore(model.subscribe, model.getVersion, model.getVersion);
	const [tab, setTab] = useState<Tab>("selection");
	const ref = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		const dialog = ref.current;
		// not modal: the circuit stays usable while values are logged, as with Logisim's window
		dialog?.show();
		return () => dialog?.close();
	}, []);
	const helpKey = TABS.find((x) => x.id === tab)?.help;
	const help = helpKey ? t(helpKey) : undefined;
	return createPortal(
		<dialog
			ref={ref}
			aria-labelledby="log-title"
			onKeyDown={(e) => {
				e.stopPropagation();
				if (e.key === "Escape") onClose();
			}}
			className="modal-motion fixed inset-auto right-3 bottom-10 left-auto z-30 m-0 h-[min(560px,70dvh)] w-[min(680px,calc(100vw-24px))] overflow-hidden rounded-xl border border-line bg-panel p-0 text-foreground shadow-2xl [&[open]]:flex [&[open]]:flex-col"
		>
			<header className="flex items-start gap-2 border-b border-line px-4 pt-3">
				<div className="min-w-0 flex-1">
					<h2 id="log-title" className="text-lg font-semibold">
						{t("Registro de {0}", [circuitName])}
					</h2>
					<p className="truncate text-xs text-muted">{help}</p>
				</div>
				<button
					type="button"
					aria-label={t("Cerrar")}
					onClick={onClose}
					className="inline-flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-black/5"
				>
					<X className="size-5" />
				</button>
			</header>
			<div
				role="tablist"
				aria-label={t("Registro")}
				className="flex shrink-0 gap-1 border-b border-line px-3"
			>
				{TABS.map((x) => (
					<button
						key={x.id}
						type="button"
						role="tab"
						aria-selected={tab === x.id}
						title={t(x.help)}
						onClick={() => setTab(x.id)}
						className={`-mb-px border-b-2 px-3 py-2 text-sm ${
							tab === x.id
								? "border-accent font-semibold"
								: "border-transparent text-muted hover:text-foreground"
						}`}
					>
						{t(x.label)}
						{x.id === "table" && model.rowCount > 0 ? ` (${model.rowCount})` : ""}
					</button>
				))}
			</div>
			<div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto p-4">
				{tab === "selection" && <SelectionTab model={model} />}
				{tab === "table" && <TableTab model={model} />}
				{tab === "file" && <FileTab model={model} fileName={fileName} />}
			</div>
			<footer className="flex justify-end border-t border-line px-4 py-3">
				<button type="button" className={buttonClass} onClick={onClose}>
					{t("Cerrar Ventana")}
				</button>
			</footer>
		</dialog>,
		document.body,
	);
}
