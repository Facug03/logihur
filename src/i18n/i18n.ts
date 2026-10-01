// The interface language. Spanish is the source: keyed strings ("lib.wiring")
// live in es.ts, and the rest of the UI writes its Spanish text inline and
// passes it through t(), so the Spanish text itself is the key into en.ts.

import { en } from "./en";
import { es } from "./es";

export type Locale = "es" | "en";

export const LOCALES: readonly { value: Locale; label: string }[] = [
	{ value: "es", label: "Español" },
	{ value: "en", label: "English" },
];

const DICTS: Record<Locale, Record<string, string>> = { es, en };

let current: Locale = "es";
const listeners = new Set<() => void>();

export function subscribeLocale(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function getLocale(): Locale {
	return current;
}

export function setLocale(locale: Locale): void {
	const changed = current !== locale;
	current = locale;
	if (typeof document !== "undefined") document.documentElement.lang = locale;
	if (changed) for (const listener of [...listeners]) listener();
}

/** The text for `key` in the current language; `{0}`, `{1}`… take `args`. */
export function t(key: string, args?: readonly (string | number)[]): string {
	let s = DICTS[current][key] ?? es[key] ?? key;
	for (const [i, a] of (args ?? []).entries()) s = s.replaceAll(`{${i}}`, String(a));
	return s;
}

/** Marks Spanish text kept in a table and translated with t() where shown. */
export function msg(text: string): string {
	return text;
}

/** Preserve message arguments now and translate when the notice is rendered. */
export function localized(key: string, args?: readonly (string | number)[]): () => string {
	const values = args?.slice();
	return () => t(key, values);
}

/** Imported diagnostics may also contain literal text from the circuit file. */
export type Message = string | (() => string);

export function renderMessage(message: Message): string {
	return typeof message === "function" ? message() : message;
}

/** Keep Error's string API while translating its explanation when read. */
export class TranslatedError extends Error {
	constructor(render: () => string) {
		super();
		Object.defineProperty(this, "message", { get: render, configurable: true });
	}
}
