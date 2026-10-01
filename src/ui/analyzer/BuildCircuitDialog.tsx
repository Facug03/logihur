// Port of analyze.gui.BuildCircuitButton's dialog.

import { useEffect, useRef, useState } from "react";
import { containsXor } from "@/analyze/expression";
import { t } from "@/i18n/i18n";
import type { Workspace } from "../workspace";
import { buttonClass, primaryButtonClass } from "./VariablesTab";

export function BuildCircuitDialog({
	ws,
	onClose,
	onBuilt,
}: {
	ws: Workspace;
	onClose: () => void;
	onBuilt: () => void;
}) {
	const model = ws.analyzer;
	const ref = useRef<HTMLDialogElement>(null);
	const nameRef = useRef<HTMLInputElement>(null);
	const [name, setName] = useState(() => model.currentCircuit?.name ?? "");
	const [twoInputs, setTwoInputs] = useState(false);
	const [nands, setNands] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [confirmReplace, setConfirmReplace] = useState(false);
	const enableNands = !model.outputs.getAll().some((o) => {
		const e = model.outputExpressions.getExpression(o);
		return e !== null && containsXor(e);
	});

	useEffect(() => {
		const dialog = ref.current;
		dialog?.showModal();
		nameRef.current?.select();
		return () => dialog?.close();
	}, []);

	const build = () => {
		ws.buildAnalyzedCircuit(name.trim(), twoInputs, nands && enableNands);
		onBuilt();
	};

	return (
		<dialog
			ref={ref}
			aria-labelledby="build-title"
			onCancel={(e) => {
				e.preventDefault();
				onClose();
			}}
			className="modal-motion m-auto w-[min(420px,calc(100vw-24px))] rounded-xl border border-line bg-panel p-5 text-foreground shadow-xl backdrop:bg-black/30"
		>
			<h2 id="build-title" className="text-lg font-semibold">
				{confirmReplace ? t("analyze.buildConfirmReplaceTitle") : t("analyze.buildDialogTitle")}
			</h2>
			{confirmReplace ? (
				<>
					<p className="mt-3 text-sm">{t("analyze.buildConfirmReplaceMessage", [name.trim()])}</p>
					<p className="mt-2 text-xs text-muted">{t("Podés deshacerlo con Ctrl+Z.")}</p>
					<div className="mt-5 flex justify-end gap-2">
						<button type="button" className={buttonClass} onClick={() => setConfirmReplace(false)}>
							{t("Cancelar")}
						</button>
						<button
							type="button"
							className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
							onClick={build}
						>
							{t("analyze.replaceCircuitAction")}
						</button>
					</div>
				</>
			) : (
				<form
					className="mt-4 flex flex-col gap-3"
					onSubmit={(e) => {
						e.preventDefault();
						if (name.trim() === "") {
							setError(t("analyze.buildNeedCircuitError"));
							return;
						}
						if (ws.project.getCircuit(name.trim())) setConfirmReplace(true);
						else build();
					}}
				>
					<label className="flex flex-col gap-1 text-sm">
						{t("analyze.buildNameLabel")}
						<input
							ref={nameRef}
							value={name}
							onChange={(e) => {
								setName(e.target.value);
								setError(null);
							}}
							className="rounded-md border border-line bg-panel px-3 py-2 text-sm"
						/>
					</label>
					<label className="flex items-center gap-2 text-sm">
						<input type="checkbox" checked={twoInputs} onChange={(e) => setTwoInputs(e.target.checked)} />
						{t("analyze.buildTwoInputsLabel")}
					</label>
					<label className={`flex items-center gap-2 text-sm ${enableNands ? "" : "opacity-50"}`}>
						<input
							type="checkbox"
							checked={nands && enableNands}
							disabled={!enableNands}
							onChange={(e) => setNands(e.target.checked)}
						/>
						{t("analyze.buildNandsLabel")}
					</label>
					{!enableNands && (
						<p className="text-xs text-muted">{t("No disponible: alguna expresión usa XOR.")}</p>
					)}
					<p role="alert" className="min-h-5 text-sm text-red-600">
						{error}
					</p>
					<div className="flex justify-end gap-2">
						<button type="button" className={buttonClass} onClick={onClose}>
							{t("Cancelar")}
						</button>
						<button type="submit" className={primaryButtonClass}>
							{t("analyze.buildCircuitButton")}
						</button>
					</div>
				</form>
			)}
		</dialog>
	);
}
