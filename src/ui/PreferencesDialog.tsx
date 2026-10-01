"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { GateShape } from "@/engine/component";
import { prefs } from "@/engine/prefs";
import { LogisimIcon } from "./panels";
import { saveGateShape } from "./preferences";
import type { Workspace } from "./workspace";

/** IntlOptions' gate shape choices, with the icons each one uses. */
const SHAPES: { value: GateShape; label: string; icons: string[] }[] = [
	{
		value: "shaped",
		label: "Con forma",
		icons: ["andGate.gif", "orGate.gif", "xorGate.gif", "notGate.gif"],
	},
	{
		value: "rectangular",
		label: "Rectangular",
		icons: ["andGateRect.gif", "orGateRect.gif", "xorGateRect.gif", "notGateRect.gif"],
	},
	{
		value: "din40700",
		label: "DIN 40700",
		icons: ["dinAndGate.gif", "dinOrGate.gif", "dinXorGate.gif", "dinNotGate.gif"],
	},
];

export function PreferencesDialog({ ws, onClose }: { ws: Workspace; onClose: () => void }) {
	const ref = useRef<HTMLDialogElement>(null);
	const [gateShape, setGateShape] = useState(prefs.gateShape);
	useEffect(() => {
		const previous = document.activeElement;
		const dialog = ref.current;
		dialog?.showModal();
		return () => {
			dialog?.close();
			if (previous instanceof HTMLElement) previous.focus();
		};
	}, []);
	const chooseShape = (shape: GateShape) => {
		setGateShape(shape);
		saveGateShape(shape);
		ws.setGateShape(shape);
	};
	return (
		<dialog
			ref={ref}
			aria-labelledby="preferences-title"
			onCancel={onClose}
			className="m-auto max-h-[85dvh] w-[min(480px,calc(100vw-24px))] overflow-y-auto rounded-xl border border-line bg-panel p-5 text-foreground shadow-xl backdrop:bg-black/30"
		>
			<div className="flex items-center justify-between gap-3">
				<h2 id="preferences-title" className="text-lg font-semibold">
					{"Preferencias"}
				</h2>
				<button
					type="button"
					aria-label={"Cerrar preferencias"}
					onClick={onClose}
					className="rounded-md p-2 hover:bg-black/5"
				>
					<X className="size-5" />
				</button>
			</div>
			<p className="mt-1 text-xs text-muted">
				{"Se guardan en este navegador y no cambian los archivos .circ."}
			</p>
			<fieldset className="mt-5">
				<legend className="mb-2 text-sm font-semibold">{"Forma de las puertas"}</legend>
				<div className="grid gap-2">
					{SHAPES.map((shape) => (
						<label
							key={shape.value}
							className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm hover:bg-black/5 ${gateShape === shape.value ? "border-accent bg-accent/10" : "border-line"}`}
						>
							<input
								type="radio"
								name="gate-shape"
								value={shape.value}
								checked={gateShape === shape.value}
								onChange={() => chooseShape(shape.value)}
								className="accent-accent"
							/>
							<span className="flex-1">{shape.label}</span>
							<span className="flex gap-1" aria-hidden="true">
								{shape.icons.map((icon) => (
									<LogisimIcon key={icon} name={icon} size={24} />
								))}
							</span>
						</label>
					))}
				</div>
			</fieldset>
		</dialog>
	);
}
