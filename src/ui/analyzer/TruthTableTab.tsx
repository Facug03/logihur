// Port of analyze.gui.TableTab + TableTabCaret: the truth table with a
// keyboard caret. Output cells cycle on click; 0, 1 and x type values and
// advance; space cycles; arrows, Home/End and Page Up/Down move.

import { useRef, useState } from "react";
import { errorMessage, isError } from "@/analyze/entry";
import type { AnalyzerModel } from "@/analyze/model";
import { t } from "@/i18n/es";
import { entryForKey, nextEntry } from "./entries";
import { ERROR_COLOR } from "./KarnaughMap";

const ROW_HEIGHT = 26;
const VIEW_HEIGHT = 380;
const COL_WIDTH = 44;

export function TruthTableTab({ model }: { model: AnalyzerModel }) {
	const table = model.truthTable;
	const inputs = model.inputs.getAll();
	const outputs = model.outputs.getAll();
	const rows = table.rowCount;
	const cols = inputs.length + outputs.length;
	const [cursor, setCursorState] = useState<{ row: number; col: number } | null>(null);
	const [scrollTop, setScrollTop] = useState(0);
	const viewportRef = useRef<HTMLDivElement>(null);

	if (cols === 0) {
		return <p className="py-10 text-center text-muted">{t("analyze.tableEmptyMessage")}</p>;
	}

	const current = cursor && cursor.row < rows && cursor.col < cols ? cursor : null;
	const firstRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 4);
	const lastRow = Math.min(rows, firstRow + Math.ceil(VIEW_HEIGHT / ROW_HEIGHT) + 8);
	const gridTemplate = `repeat(${inputs.length}, ${COL_WIDTH}px) 12px repeat(${outputs.length}, ${COL_WIDTH}px)`;
	const width = cols * COL_WIDTH + 12;

	function setCursor(row: number, col: number): void {
		const r = Math.max(0, Math.min(rows - 1, row));
		const c = Math.max(0, Math.min(cols - 1, col));
		setCursorState({ row: r, col: c });
		const viewport = viewportRef.current;
		if (viewport) {
			const top = r * ROW_HEIGHT;
			if (top < viewport.scrollTop) viewport.scrollTop = top;
			else if (top + ROW_HEIGHT > viewport.scrollTop + viewport.clientHeight) {
				viewport.scrollTop = top + ROW_HEIGHT - viewport.clientHeight;
			}
		}
	}

	function onKeyDown(e: React.KeyboardEvent): void {
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		const at = current ?? { row: 0, col: inputs.length };
		const page = Math.max(1, Math.floor((viewportRef.current?.clientHeight ?? VIEW_HEIGHT) / ROW_HEIGHT) - 1);
		const typed = entryForKey(e.key);
		if (typed !== null) {
			if (at.col >= inputs.length) {
				table.setOutputEntry(at.row, at.col - inputs.length, typed);
				if (at.col >= cols - 1) setCursor(at.row + 1, inputs.length);
				else setCursor(at.row, at.col + 1);
			}
		} else if (e.key === " ") {
			if (at.col >= inputs.length) {
				const column = at.col - inputs.length;
				table.setOutputEntry(at.row, column, nextEntry(table.getOutputEntry(at.row, column)));
			}
			setCursor(at.row, at.col);
		} else if (e.key === "Enter") setCursor(at.row + 1, inputs.length);
		else if (e.key === "Backspace") setCursor(at.row, at.col - 1);
		else if (e.key === "ArrowUp") setCursor(at.row - 1, at.col);
		else if (e.key === "ArrowDown") setCursor(at.row + 1, at.col);
		else if (e.key === "ArrowLeft") setCursor(at.row, at.col - 1);
		else if (e.key === "ArrowRight") setCursor(at.row, at.col + 1);
		else if (e.key === "Home") setCursor(at.col === 0 ? 0 : at.row, 0);
		else if (e.key === "End") setCursor(at.col === cols - 1 ? rows - 1 : at.row, cols - 1);
		else if (e.key === "PageDown") setCursor(at.row + page, at.col);
		else if (e.key === "PageUp") setCursor(at.row - page, at.col);
		else return;
		e.preventDefault();
	}

	const header = (
		<div
			className="grid bg-panel font-serif text-sm font-semibold"
			style={{ gridTemplateColumns: gridTemplate }}
		>
			{inputs.map((name) => (
				<span key={`i-${name}`} className="truncate py-1 text-center" title={name}>
					{name}
				</span>
			))}
			<span className="border-l border-line" />
			{outputs.map((name) => (
				<span key={`o-${name}`} className="truncate py-1 text-center" title={name}>
					{name}
				</span>
			))}
		</div>
	);

	return (
		<div className="flex flex-col gap-2">
			<div className="overflow-x-auto rounded-md border border-line">
				<div style={{ width: Math.max(width, 0), minWidth: "100%" }} className="mx-auto">
					<div style={{ width }} className="mx-auto border-b border-line">
						{header}
					</div>
					<div
						ref={viewportRef}
						role="application"
						aria-label={t("analyze.tableTab")}
						aria-describedby="truth-table-caret"
						// biome-ignore lint/a11y/noNoninteractiveTabindex: the table takes focus to own its keyboard caret, as in Logisim
						tabIndex={0}
						onKeyDown={onKeyDown}
						onFocus={() => {
							if (current === null) setCursorState({ row: 0, col: inputs.length < cols ? inputs.length : 0 });
						}}
						onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
						style={{ height: `min(${Math.min(VIEW_HEIGHT, rows * ROW_HEIGHT + 2)}px, 50dvh)` }}
						className="overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
					>
						<div style={{ height: rows * ROW_HEIGHT, width, position: "relative" }} className="mx-auto">
							{Array.from({ length: lastRow - firstRow }, (_, k) => firstRow + k).map((row) => (
								<div
									key={row}
									style={{
										position: "absolute",
										top: row * ROW_HEIGHT,
										height: ROW_HEIGHT,
										gridTemplateColumns: gridTemplate,
									}}
									className="grid w-full items-center font-mono text-sm"
								>
									{inputs.map((name, col) => (
										<span
											key={name}
											className={`text-center text-muted ${current?.row === row && current.col === col ? "rounded ring-2 ring-accent" : ""}`}
										>
											{table.getInputEntry(row, col).description}
										</span>
									))}
									<span className="h-full border-l border-line" />
									{outputs.map((name, j) => {
										const entry = table.getOutputEntry(row, j);
										const col = inputs.length + j;
										const selected = current?.row === row && current.col === col;
										return (
											<span
												key={name}
												title={errorMessage(entry) ?? undefined}
												onPointerDown={(e) => {
													e.preventDefault();
													viewportRef.current?.focus();
													setCursorState({ row, col });
													table.setOutputEntry(row, j, nextEntry(entry));
												}}
												style={isError(entry) ? { background: ERROR_COLOR } : undefined}
												className={`mx-1 cursor-pointer rounded text-center font-semibold hover:bg-accent/10 ${selected ? "ring-2 ring-accent" : ""}`}
											>
												{entry.description}
											</span>
										);
									})}
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
			<p id="truth-table-caret" aria-live="polite" className="sr-only">
				{current &&
					`Fila ${current.row}, ${current.col < inputs.length ? inputs[current.col] : outputs[current.col - inputs.length]}: ${
						current.col < inputs.length
							? table.getInputEntry(current.row, current.col).description
							: table.getOutputEntry(current.row, current.col - inputs.length).description
					}`}
			</p>
			<p className="text-xs text-muted">
				Clic en una salida para alternar 0 → 1 → x. Con el teclado: 0, 1 o x escriben y avanzan; espacio
				alterna; flechas, Inicio/Fin y RePág/AvPág mueven.
			</p>
		</div>
	);
}
