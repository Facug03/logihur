"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { prefs } from "@/engine/prefs";
import { localized, t } from "@/i18n/i18n";
import { type ImageFormat, renderCircuitImage } from "@/render/export-image";
import type { Workspace } from "./workspace";

/** ExportImage.OptionsPanel: the slider picks 2^(n/6), from 12.5% to 800%. */
const SLIDER_DIVISIONS = 6;
const FORMATS: { value: ImageFormat; label: string; ext: string }[] = [
	{ value: "png", label: "PNG", ext: "png" },
	{ value: "jpeg", label: "JPEG", ext: "jpg" },
];

function download(blob: Blob, name: string): void {
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function ExportImageDialog({ ws, onClose }: { ws: Workspace; onClose: () => void }) {
	const ref = useRef<HTMLDialogElement>(null);
	const circuits = ws.project.circuits;
	const [selected, setSelected] = useState(() => new Set([ws.viewCircuit]));
	const [format, setFormat] = useState<ImageFormat>("png");
	const [slider, setSlider] = useState(0);
	const [printView, setPrintView] = useState(true);
	const [busy, setBusy] = useState(false);
	const scale = 2 ** (slider / SLIDER_DIVISIONS);
	useEffect(() => {
		const previous = document.activeElement;
		const dialog = ref.current;
		dialog?.showModal();
		return () => {
			dialog?.close();
			if (previous instanceof HTMLElement) previous.focus();
		};
	}, []);
	const toggle = (c: (typeof circuits)[number]) =>
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(c)) next.delete(c);
			else next.add(c);
			return next;
		});
	const onExport = async () => {
		setBusy(true);
		const ext = FORMATS.find((f) => f.value === format)?.ext ?? format;
		const empty: string[] = [];
		let count = 0;
		// keep the project's order, as the list does
		for (const circuit of circuits) {
			if (!selected.has(circuit)) continue;
			const blob = await renderCircuitImage(circuit, ws.circuitStateFor(circuit), {
				scale,
				printView,
				gateShape: prefs.gateShape,
				format,
			});
			if (blob) {
				download(blob, `${circuit.name}.${ext}`);
				count++;
			} else empty.push(circuit.name);
		}
		setBusy(false);
		if (count > 0)
			ws.notify(
				count === 1 ? localized("Se exportó la imagen.") : localized("Se exportaron {0} imágenes.", [count]),
			);
		if (empty.length > 0) ws.notify(localized("No se exportaron circuitos vacíos: {0}.", [empty.join(", ")]));
		onClose();
	};
	return (
		<dialog
			ref={ref}
			aria-labelledby="export-title"
			onCancel={onClose}
			className="m-auto max-h-[85dvh] w-[min(440px,calc(100vw-24px))] overflow-y-auto rounded-xl border border-line bg-panel p-5 text-foreground shadow-xl backdrop:bg-black/30"
		>
			<div className="flex items-center justify-between gap-3">
				<h2 id="export-title" className="text-lg font-semibold">
					{t("Exportar imagen")}
				</h2>
				<button
					type="button"
					aria-label={t("Cerrar exportar imagen")}
					onClick={onClose}
					className="rounded-md p-2 hover:bg-black/5"
				>
					<X className="size-5" />
				</button>
			</div>
			<fieldset className="mt-4">
				<legend className="mb-2 text-sm font-semibold">{t("Circuitos")}</legend>
				<div className="max-h-40 overflow-y-auto rounded-lg border border-line p-1">
					{circuits.map((c) => (
						<label
							key={c.name}
							className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-black/5"
						>
							<input
								type="checkbox"
								checked={selected.has(c)}
								onChange={() => toggle(c)}
								className="accent-accent"
							/>
							<span className="truncate">{c.name}</span>
						</label>
					))}
				</div>
				{selected.size > 1 && (
					<p className="mt-1 text-xs text-muted">{t("Se descarga un archivo por circuito.")}</p>
				)}
			</fieldset>
			<fieldset className="mt-4">
				<legend className="mb-2 text-sm font-semibold">{t("Formato")}</legend>
				<div className="flex gap-4 text-sm">
					{FORMATS.map((f) => (
						<label key={f.value} className="flex items-center gap-2">
							<input
								type="radio"
								name="export-format"
								checked={format === f.value}
								onChange={() => setFormat(f.value)}
								className="accent-accent"
							/>
							{f.label}
						</label>
					))}
				</div>
			</fieldset>
			<label className="mt-4 block text-sm font-semibold" htmlFor="export-scale">
				{t("Tamaño")}
			</label>
			<div className="mt-2 flex items-center gap-3">
				<input
					id="export-scale"
					type="range"
					min={-3 * SLIDER_DIVISIONS}
					max={3 * SLIDER_DIVISIONS}
					value={slider}
					onChange={(e) => setSlider(Number(e.target.value))}
					className="flex-1 accent-accent"
				/>
				<span className="w-12 text-right font-mono text-xs tabular-nums">{Math.round(100 * scale)}%</span>
			</div>
			<label className="mt-4 flex items-start gap-2 text-sm">
				<input
					type="checkbox"
					checked={printView}
					onChange={(e) => setPrintView(e.target.checked)}
					className="mt-0.5 accent-accent"
				/>
				<span>
					{t("Vista de impresión")}
					<span className="block text-xs text-muted">
						{t("En blanco y negro, sin los valores de la simulación.")}
					</span>
				</span>
			</label>
			<div className="mt-5 flex justify-end gap-2">
				<button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm hover:bg-black/5">
					{t("Cancelar")}
				</button>
				<button
					type="button"
					disabled={selected.size === 0 || busy}
					onClick={onExport}
					className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
				>
					{t("Exportar")}
				</button>
			</div>
		</dialog>
	);
}
