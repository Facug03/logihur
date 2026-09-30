import { DONT_CARE, type Entry, ONE, ZERO } from "@/analyze/entry";

/** TruthTableMouseListener: a click cycles 0 → 1 → x → 0 (errors become 0). */
export function nextEntry(e: Entry): Entry {
	if (e === ZERO) return ONE;
	if (e === ONE) return DONT_CARE;
	return ZERO;
}

/** TableTabCaret: keys that type a value into a cell. */
export function entryForKey(key: string): Entry | null {
	if (key === "0") return ZERO;
	if (key === "1") return ONE;
	if (key === "x" || key === "X" || key === "-") return DONT_CARE;
	return null;
}
