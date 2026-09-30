// Port of std.io.DotMatrix: direct row/column buses or multiplexed selection.
import { type AnyAttribute, AttributeSet, intRangeAttr, optionAttr } from "@/engine/attributes";
import {
	ComponentFactory,
	type Instance,
	type InstancePainter,
	type InstanceState,
	port,
} from "@/engine/component";
import { Bounds } from "@/engine/geom";
import { Value } from "@/engine/value";
import { IO_OFF, IO_ON } from "./common";

export const MATRIX_INPUT = optionAttr(
	"inputtype",
	"io.matrixInput",
	["column", "row", "select"].map((value) => ({ value, label: `io.input.${value}` })),
);
export const MATRIX_COLS = intRangeAttr("matrixcols", "io.matrixCols", 1, 32);
export const MATRIX_ROWS = intRangeAttr("matrixrows", "io.matrixRows", 1, 32);
export const MATRIX_SHAPE = optionAttr(
	"dotshape",
	"io.matrixShape",
	["circle", "square"].map((value) => ({ value, label: `io.shape.${value}` })),
);
export const MATRIX_PERSIST = intRangeAttr("persist", "io.matrixPersistence", 0, 0x7fffffff);
export class MatrixData {
	grid: Value[] = [];
	persistTo: number[] = [];
	constructor(
		public rows: number,
		public columns: number,
		ticks: number,
	) {
		this.reset(ticks);
	}
	private reset(ticks: number): void {
		this.grid = new Array(this.rows * this.columns).fill(Value.UNKNOWN);
		this.persistTo = new Array(this.grid.length).fill(ticks - 1);
	}
	resize(rows: number, cols: number, ticks: number): void {
		if (rows !== this.rows || cols !== this.columns) {
			this.rows = rows;
			this.columns = cols;
			this.reset(ticks);
		}
	}
	set(index: number, value: Value, persist: number): void {
		if (this.grid[index] === Value.TRUE) this.persistTo[index] = persist - 1;
		this.grid[index] = value;
		if (value === Value.TRUE) this.persistTo[index] = persist;
	}
	get(row: number, col: number, tick: number): Value {
		const i = row * this.columns + col,
			v = this.grid[i];
		return v === Value.FALSE && this.persistTo[i] >= tick ? Value.TRUE : v;
	}
}
class DotMatrix extends ComponentFactory {
	readonly name = "DotMatrix";
	readonly library = "#I/O";
	readonly displayKey = "io.dotMatrix";
	override readonly iconName = "dotmat.gif";
	createAttributeSet() {
		const a = new AttributeSet();
		a.set(MATRIX_INPUT, "column");
		a.set(MATRIX_COLS, 5);
		a.set(MATRIX_ROWS, 7);
		a.set(IO_ON, "#00ff00");
		a.set(IO_OFF, "#404040");
		a.set(MATRIX_PERSIST, 0);
		a.set(MATRIX_SHAPE, "square");
		return a;
	}
	getAttributes(): AnyAttribute[] {
		return [MATRIX_INPUT, MATRIX_COLS, MATRIX_ROWS, IO_ON, IO_OFF, MATRIX_PERSIST, MATRIX_SHAPE];
	}
	getOffsetBounds(a: AttributeSet) {
		const type = a.get(MATRIX_INPUT),
			cols = a.get(MATRIX_COLS),
			rows = a.get(MATRIX_ROWS);
		return Bounds.create(
			type === "column" ? -5 : 0,
			type === "column" ? -10 * rows : type === "row" || rows === 1 ? -5 : -5 * rows + 5,
			10 * cols,
			10 * rows,
		);
	}
	override getPorts(i: Instance) {
		const a = i.attrs,
			type = a.get(MATRIX_INPUT),
			rows = a.get(MATRIX_ROWS),
			cols = a.get(MATRIX_COLS);
		if (type === "column") return Array.from({ length: cols }, (_, j) => port(10 * j, 0, "input", rows));
		if (type === "row") return Array.from({ length: rows }, (_, j) => port(0, 10 * j, "input", cols));
		if (rows === 1) return [port(0, 0, "input", cols)];
		if (cols === 1) return [port(0, 0, "input", rows)];
		return [port(0, 0, "input", cols), port(0, 10, "input", rows)];
	}
	getState(s: InstanceState): MatrixData {
		let d = s.getData<MatrixData>();
		const rows = s.getAttr(MATRIX_ROWS),
			cols = s.getAttr(MATRIX_COLS),
			tick = s.getTickCount();
		if (!d) {
			d = new MatrixData(rows, cols, tick);
			s.setData(d);
		} else d.resize(rows, cols, tick);
		return d;
	}
	propagate(s: InstanceState): void {
		const d = this.getState(s),
			rows = d.rows,
			cols = d.columns,
			persist = s.getTickCount() + s.getAttr(MATRIX_PERSIST),
			type = s.getAttr(MATRIX_INPUT);
		if (type === "row")
			for (let r = 0; r < rows; r++)
				for (let c = 0; c < cols; c++) d.set(r * cols + c, s.getPort(r).get(cols - 1 - c), persist);
		else if (type === "column")
			for (let c = 0; c < cols; c++)
				for (let r = 0; r < rows; r++) d.set(r * cols + c, s.getPort(c).get(rows - 1 - r), persist);
		else {
			// The single-port variants encode the whole vector directly.
			if (rows === 1) {
				for (let c = 0; c < cols; c++) d.set(c, s.getPort(0).get(c), persist);
				return;
			}
			if (cols === 1) {
				for (let r = 0; r < rows; r++) d.set(r, s.getPort(0).get(rows - 1 - r), persist);
				return;
			}
			const row = s.getPort(1),
				column = s.getPort(0);
			for (let r = 0; r < rows; r++)
				for (let c = 0; c < cols; c++) {
					const select = row.get(rows - 1 - r);
					d.set(
						r * cols + c,
						select === Value.TRUE ? column.get(c) : select === Value.FALSE ? Value.FALSE : Value.ERROR,
						persist,
					);
				}
		}
	}
	paintInstance(p: InstancePainter): void {
		const g = p.g,
			b = p.getBounds(),
			rows = p.getAttr(MATRIX_ROWS),
			cols = p.getAttr(MATRIX_COLS),
			d = p.getData<MatrixData>(),
			tick = p.getTickCount();
		d?.resize(rows, cols, tick);
		for (let r = 0; r < rows; r++)
			for (let c = 0; c < cols; c++) {
				const v = d?.get(r, c, tick) ?? Value.UNKNOWN;
				g.setColor(
					!p.showState
						? "#808080"
						: v === Value.TRUE
							? p.getAttr(IO_ON)
							: v === Value.FALSE
								? p.getAttr(IO_OFF)
								: Value.ERROR_COLOR,
				);
				const x = b.x + 10 * c,
					y = b.y + 10 * r;
				if (p.showState && p.getAttr(MATRIX_SHAPE) === "square") g.fillRect(x, y, 10, 10);
				else g.fillOval(x + 1, y + 1, 8, 8);
			}
		g.setColor("#000000");
		g.setLineWidth(2);
		g.drawRect(b.x, b.y, b.width, b.height);
		g.setLineWidth(1);
		p.drawPorts();
	}
}
export const DOT_MATRIX = new DotMatrix();
