// Port of com.cburch.logisim.analyze.model.Entry: the value of a truth table
// cell. Entries are compared by identity.

import { t } from "@/i18n/i18n";

export interface Entry {
	readonly description: string;
	/** i18n key of the error explanation, for error entries ("!!"). */
	readonly errorKey: string | null;
}

export const ZERO: Entry = { description: "0", errorKey: null };
export const ONE: Entry = { description: "1", errorKey: null };
export const DONT_CARE: Entry = { description: "x", errorKey: null };
export const BUS_ERROR: Entry = { description: "!!", errorKey: "analyze.busError" };
export const OSCILLATE_ERROR: Entry = { description: "!!", errorKey: "analyze.oscillateError" };

export function isError(e: Entry): boolean {
	return e.errorKey !== null;
}

export function errorMessage(e: Entry): string | null {
	return e.errorKey === null ? null : t(e.errorKey);
}

/** Entry.parse */
export function parseEntry(description: string): Entry | null {
	for (const e of [ZERO, ONE, DONT_CARE, BUS_ERROR]) if (e.description === description) return e;
	return null;
}
