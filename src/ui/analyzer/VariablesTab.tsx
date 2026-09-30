// Port of analyze.gui.VariableTab: the list of input or output variables.

import { useState } from "react";
import type { VariableList } from "@/analyze/model";
import { t } from "@/i18n/es";
import { isIdentPart, isIdentStart } from "@/sim/pin-labels";

const baseButton =
	"rounded-md border px-3 py-1.5 text-sm press disabled:pointer-events-none disabled:opacity-40";
export const buttonClass = `${baseButton} border-line bg-panel hover:bg-black/5`;
export const primaryButtonClass = `${baseButton} border-accent bg-accent font-medium text-white hover:bg-accent/90`;

/** VariableTab.validateInput: [ok, message to show]. */
function validate(text: string, list: VariableList): [boolean, string] {
	let ok = true;
	let message = "";
	if (text.length === 0) ok = false;
	else if (!isIdentStart(text[0])) {
		message = t("analyze.variableStartError");
		ok = false;
	} else {
		const bad = Array.from(text.slice(1)).find((c) => !isIdentPart(c));
		if (bad !== undefined) {
			message = t("analyze.variablePartError", [bad]);
			ok = false;
		} else if (list.contains(text)) {
			message = t("analyze.variableDuplicateError");
			ok = false;
		}
	}
	if ((ok || text.length === 0) && list.isFull()) message = t("analyze.variableMaximumError", [list.maxSize]);
	return [ok, message];
}

export function VariablesTab({ list, label }: { list: VariableList; label: string }) {
	const [selected, setSelected] = useState<string | null>(() => list.getAll()[0] ?? null);
	const [field, setField] = useState("");
	const names = list.getAll();
	const current = selected !== null && list.contains(selected) ? selected : null;
	const index = current === null ? -1 : list.indexOf(current);
	const text = field.trim();
	const [ok, message] = validate(text, list);

	const add = () => {
		if (!ok || list.isFull()) return;
		list.add(text);
		setSelected(text);
		setField("");
	};

	return (
		<div className="grid gap-3 sm:grid-cols-[1fr_auto]">
			<div
				role="listbox"
				aria-label={label}
				className="h-48 overflow-y-auto rounded-md border border-line bg-panel py-1 sm:h-56"
			>
				{names.length === 0 && <p className="px-3 py-2 text-sm text-muted">Sin variables todavía.</p>}
				{names.map((name) => (
					<button
						key={name}
						type="button"
						role="option"
						aria-selected={name === current}
						onClick={() => setSelected(name)}
						className={`block w-full px-3 py-1.5 text-left font-mono text-sm ${
							name === current ? "bg-accent text-white" : "hover:bg-black/5"
						}`}
					>
						{name}
					</button>
				))}
			</div>
			<div className="flex flex-row flex-wrap gap-2 sm:w-36 sm:flex-col">
				<button
					type="button"
					className={buttonClass}
					disabled={current === null}
					onClick={() => {
						if (current === null) return;
						list.remove(current);
						const next = list.getAll();
						setSelected(next.length === 0 ? null : next[Math.min(index, next.length - 1)]);
					}}
				>
					{t("analyze.variableRemoveButton")}
				</button>
				<button
					type="button"
					className={buttonClass}
					disabled={current === null || index <= 0}
					onClick={() => current !== null && list.move(current, -1)}
				>
					{t("analyze.variableMoveUpButton")}
				</button>
				<button
					type="button"
					className={buttonClass}
					disabled={current === null || index >= names.length - 1}
					onClick={() => current !== null && list.move(current, 1)}
				>
					{t("analyze.variableMoveDownButton")}
				</button>
			</div>
			<form
				className="flex flex-col gap-2 sm:col-span-2"
				onSubmit={(e) => {
					e.preventDefault();
					add();
				}}
			>
				<input
					aria-label="Nombre de variable"
					value={field}
					onChange={(e) => setField(e.target.value)}
					autoCapitalize="off"
					autoCorrect="off"
					spellCheck={false}
					className="rounded-md border border-line bg-panel px-3 py-2 font-mono text-sm"
				/>
				<div className="flex flex-wrap items-center justify-end gap-2">
					<p
						role="status"
						className={`mr-auto min-h-5 text-sm ${ok || text.length === 0 ? "text-muted" : "text-red-600"}`}
					>
						{message}
					</p>
					<button
						type="button"
						className={buttonClass}
						disabled={!ok || current === null}
						onClick={() => {
							if (current === null) return;
							list.replace(current, text);
							setSelected(text);
							setField("");
						}}
					>
						{t("analyze.variableRenameButton")}
					</button>
					<button type="submit" className={buttonClass} disabled={!ok || list.isFull()}>
						{t("analyze.variableAddButton")}
					</button>
				</div>
			</form>
		</div>
	);
}
