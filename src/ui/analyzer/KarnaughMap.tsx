// Port of analyze.gui.KarnaughMapPanel: up to four inputs, Gray-coded rows
// and columns, one colored rounded rectangle per implicant of the minimal
// expression. Clicking a cell cycles its value like the truth table.

import { type Entry, errorMessage, isError } from "@/analyze/entry";
import type { Implicant } from "@/analyze/implicant";
import type { AnalyzerModel } from "@/analyze/model";
import { t } from "@/i18n/es";
import { nextEntry } from "./entries";

const MAX_VARS = 4;
const ROW_VARS = [0, 0, 1, 1, 2];
const COL_VARS = [0, 1, 1, 2, 2];
const IMP_COLORS = ["rgba(255,0,0,.5)", "rgba(0,150,0,.5)", "rgba(0,0,255,.5)", "rgba(255,0,255,.5)"];
const IMP_INSET = 4;
const IMP_RADIUS = 5;
const HEAD = 24;
const CELL_W = 44;
const CELL_H = 34;
export const ERROR_COLOR = "rgb(255,128,128)";

const toRow = (row: number, rows: number) => (rows === 4 && row >= 2 ? 5 - row : row);
const getTableRow = (row: number, col: number, rows: number, cols: number) =>
	toRow(row, rows) * cols + toRow(col, cols);
const swap23 = (v: number) => (v === 2 ? 3 : v === 3 ? 2 : v);

function label(i: number, n: number): string {
	if (n === 2) return String(i);
	if (n === 4) return ["00", "01", "11", "10"][i];
	return "";
}

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** KarnaughMapPanel.paintImplicant, relative to the first cell. */
function implicantRects(imp: Implicant, rows: number, cols: number): Rect[] {
	let rowMax = -1;
	let rowMin = rows;
	let colMax = -1;
	let colMin = cols;
	let oneRowFound = false;
	let count = 0;
	for (const sq of imp.getTerms()) {
		const tableRow = sq.getRow();
		const row = swap23(Math.trunc(tableRow / cols));
		const col = swap23(tableRow % cols);
		if (row === 1) oneRowFound = true;
		rowMax = Math.max(rowMax, row);
		rowMin = Math.min(rowMin, row);
		colMax = Math.max(colMax, col);
		colMin = Math.min(colMin, col);
		++count;
	}
	const numCols = colMax - colMin + 1;
	const numRows = rowMax - rowMin + 1;
	const covered = numCols * numRows;
	if (covered === count) {
		return [
			{
				x: colMin * CELL_W + IMP_INSET,
				y: rowMin * CELL_H + IMP_INSET,
				w: numCols * CELL_W - 2 * IMP_INSET,
				h: numRows * CELL_H - 2 * IMP_INSET,
			},
		];
	}
	const x1 = 3 * CELL_W + IMP_INSET;
	const y1 = 3 * CELL_H + IMP_INSET;
	if (covered === 16) {
		const w = CELL_W - IMP_INSET;
		const h = CELL_H - IMP_INSET;
		if (count === 4) {
			return [
				{ x: 0, y: 0, w, h },
				{ x: x1, y: 0, w, h },
				{ x: 0, y: y1, w, h },
				{ x: x1, y: y1, w, h },
			];
		}
		if (oneRowFound) {
			// first and last columns
			const tall = 4 * CELL_H - 2 * IMP_INSET;
			return [
				{ x: 0, y: IMP_INSET, w, h: tall },
				{ x: x1, y: IMP_INSET, w, h: tall },
			];
		}
		// first and last rows
		const wide = 4 * CELL_W - 2 * IMP_INSET;
		return [
			{ x: IMP_INSET, y: 0, w: wide, h },
			{ x: IMP_INSET, y: y1, w: wide, h },
		];
	}
	if (numCols === 4) {
		// halves going off the left and right edges
		const top = rowMin * CELL_H + IMP_INSET;
		const h = numRows * CELL_H - 2 * IMP_INSET;
		return [
			{ x: 0, y: top, w: CELL_W - IMP_INSET, h },
			{ x: x1, y: top, w: CELL_W - IMP_INSET, h },
		];
	}
	// numRows === 4: halves going off the top and bottom edges
	const left = colMin * CELL_W + IMP_INSET;
	const w = numCols * CELL_W - 2 * IMP_INSET;
	return [
		{ x: left, y: 0, w, h: CELL_H - IMP_INSET },
		{ x: left, y: y1, w, h: CELL_H - IMP_INSET },
	];
}

export function KarnaughMap({ model, output }: { model: AnalyzerModel; output: string | null }) {
	const table = model.truthTable;
	const inputCount = table.inputColumnCount;
	const message =
		output === null
			? t("analyze.karnaughNoOutputError")
			: inputCount > MAX_VARS
				? t("analyze.karnaughTooManyInputsError")
				: null;
	if (message !== null || output === null) {
		return <p className="py-6 text-center font-serif text-muted">{message}</p>;
	}

	const rowVars = ROW_VARS[inputCount];
	const colVars = COL_VARS[inputCount];
	const rows = 1 << rowVars;
	const cols = 1 << colVars;
	const width = HEAD + CELL_W * (cols + 1);
	const height = HEAD + CELL_H * (rows + 1);
	const inputs = model.inputs.getAll();
	const rowHeader = inputs.slice(0, rowVars).join(", ");
	const colHeader = inputs.slice(rowVars, rowVars + colVars).join(", ");
	const outputColumn = model.outputs.indexOf(output);
	const cx = HEAD + CELL_W;
	const cy = HEAD + CELL_H;
	const implicants = model.outputExpressions.getMinimalImplicants(output) ?? [];
	const cells: { i: number; j: number; row: number; entry: Entry }[] = [];
	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			const row = getTableRow(i, j, rows, cols);
			cells.push({ i, j, row, entry: table.getOutputEntry(row, outputColumn) });
		}
	}
	const rowHeaderY = (height + HEAD + CELL_H) / 2;

	return (
		<svg
			role="img"
			aria-label={`Mapa de Karnaugh de ${output}`}
			viewBox={`0 0 ${width} ${height}`}
			width={width * 1.15}
			className="mx-auto block h-auto max-w-full select-none font-serif"
		>
			<text
				x={(width + HEAD + CELL_W) / 2}
				y={HEAD / 2}
				textAnchor="middle"
				dominantBaseline="central"
				fontWeight="bold"
				fontSize="14"
			>
				{colHeader}
			</text>
			<text
				x={HEAD / 2}
				y={rowHeaderY}
				textAnchor="middle"
				dominantBaseline="central"
				fontWeight="bold"
				fontSize="14"
				transform={rowHeader.length > 1 ? `rotate(-90 ${HEAD / 2} ${rowHeaderY})` : undefined}
			>
				{rowHeader}
			</text>
			{Array.from({ length: cols }, (_, i) => (
				<text
					key={`c${label(i, cols)}`}
					x={HEAD + (i + 1) * CELL_W + CELL_W / 2}
					y={HEAD + CELL_H / 2}
					textAnchor="middle"
					dominantBaseline="central"
					fontSize="14"
				>
					{label(i, cols)}
				</text>
			))}
			{Array.from({ length: rows }, (_, i) => (
				<text
					key={`r${label(i, rows)}`}
					x={HEAD + CELL_W / 2}
					y={HEAD + (i + 1) * CELL_H + CELL_H / 2}
					textAnchor="middle"
					dominantBaseline="central"
					fontSize="14"
				>
					{label(i, rows)}
				</text>
			))}
			<g transform={`translate(${cx} ${cy})`}>
				{cells
					.filter((c) => isError(c.entry))
					.map((c) => (
						<rect
							key={`e${c.row}`}
							x={c.j * CELL_W}
							y={c.i * CELL_H}
							width={CELL_W}
							height={CELL_H}
							fill={ERROR_COLOR}
						/>
					))}
				{implicants.map((imp, index) =>
					implicantRects(imp, rows, cols).map((r) => (
						<rect
							key={`${imp.hash}-${r.x}-${r.y}`}
							x={r.x}
							y={r.y}
							width={r.w}
							height={r.h}
							rx={IMP_RADIUS}
							fill={IMP_COLORS[index % IMP_COLORS.length]}
						/>
					)),
				)}
				{cells.map((c) => {
					const tip = errorMessage(c.entry);
					const cycle = () => table.setOutputEntry(c.row, outputColumn, nextEntry(c.entry));
					return (
						// biome-ignore lint/a11y/useSemanticElements: SVG cells cannot be <button>s
						<g
							key={c.row}
							role="button"
							tabIndex={0}
							aria-label={`Fila ${c.row}: ${c.entry.description}`}
							className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-accent"
							onClick={cycle}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									cycle();
								}
							}}
						>
							{tip && <title>{tip}</title>}
							<rect
								x={c.j * CELL_W + 1}
								y={c.i * CELL_H + 1}
								width={CELL_W - 2}
								height={CELL_H - 2}
								fill="transparent"
								strokeWidth="2"
							/>
							<text
								x={c.j * CELL_W + CELL_W / 2}
								y={c.i * CELL_H + CELL_H / 2}
								textAnchor="middle"
								dominantBaseline="central"
								fontSize="14"
							>
								{c.entry.description}
							</text>
						</g>
					);
				})}
			</g>
			{(cols > 1 || inputCount === 0) && <line x1={cx} y1={cy} x2={width} y2={cy} stroke="gray" />}
			{(rows > 1 || inputCount === 0) && <line x1={cx} y1={cy} x2={cx} y2={height} stroke="gray" />}
		</svg>
	);
}
