// Port of analyze.gui.TableTabClip: copy a region of the truth table as
// tab-separated text with a header row, and paste such text (or bare rows of
// 0/1/x) into output columns.

import { type Entry, parseEntry } from "./entry";
import type { AnalyzerModel } from "./model";

export interface Region {
	r0: number;
	c0: number;
	r1: number;
	c1: number;
}

function normalize({ r0, c0, r1, c1 }: Region): Region {
	return { r0: Math.min(r0, r1), c0: Math.min(c0, c1), r1: Math.max(r0, r1), c1: Math.max(c0, c1) };
}

export function copyRegion(model: AnalyzerModel, region: Region): string {
	const { r0, c0, r1, c1 } = normalize(region);
	const table = model.truthTable;
	const inputs = table.inputColumnCount;
	const header: string[] = [];
	for (let c = c0; c <= c1; c++)
		header.push(c < inputs ? model.inputs.get(c) : model.outputs.get(c - inputs));
	const lines = [header.join("\t")];
	for (let r = r0; r <= r1; r++) {
		const row: string[] = [];
		for (let c = c0; c <= c1; c++) {
			row.push((c < inputs ? table.getInputEntry(r, c) : table.getOutputEntry(r, c - inputs)).description);
		}
		lines.push(row.join("\t"));
	}
	return `${lines.join("\n")}\n`;
}

/** The pasted rows; the first line counts as data only if every token is an entry. */
export function parsePaste(text: string): (Entry | null)[][] {
	const lines = text.split(/[\r\n]+/).filter((l) => l !== "");
	if (lines.length === 0) return [];
	const first = lines[0].split(/[\t,]+/).filter((t) => t !== "");
	const firstEntries = first.map(parseEntry);
	const rows = lines.slice(1).map((l) =>
		l
			.split("\t")
			.filter((t) => t !== "")
			.map(parseEntry),
	);
	return firstEntries.every((e) => e !== null) ? [firstEntries, ...rows] : rows;
}

/**
 * Paste at the caret (a single cell: the clipboard's size from there) or into
 * a selected region of the same size. Returns an i18n error key, or null.
 */
export function pasteRegion(
	model: AnalyzerModel,
	region: Region,
	entries: (Entry | null)[][],
): string | null {
	if (entries.length === 0 || entries[0].length === 0) return "analyze.clipPasteSupportedError";
	const table = model.truthTable;
	const inputs = table.inputColumnCount;
	const cols = inputs + table.outputColumnCount;
	let { r0, c0 } = region;
	if (region.r0 === region.r1 && region.c0 === region.c1) {
		if (r0 + entries.length > table.rowCount || c0 + entries[0].length > cols)
			return "analyze.clipPasteEndError";
	} else {
		const n = normalize(region);
		if (n.r1 - n.r0 + 1 !== entries.length || n.c1 - n.c0 + 1 !== entries[0].length) {
			return "analyze.clipPasteSizeError";
		}
		r0 = n.r0;
		c0 = n.c0;
	}
	entries.forEach((row, r) => {
		row.forEach((entry, c) => {
			// only outputs change; unreadable cells are left alone
			if (c0 + c >= inputs && entry !== null && c < entries[0].length) {
				table.setOutputEntry(r0 + r, c0 + c - inputs, entry);
			}
		});
	});
	return null;
}
