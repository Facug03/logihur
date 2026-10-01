import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ParserError, parseExpression } from "@/analyze/parser";
import { readCirc } from "@/format/circ-reader";
import { writeCirc } from "@/format/circ-writer";
import { en } from "@/i18n/en";
import { es } from "@/i18n/es";
import { getLocale, localized, renderMessage, setLocale, subscribeLocale, t } from "@/i18n/i18n";
import { loadLocale, saveLocale } from "@/ui/preferences";

const SRC = path.join(import.meta.dirname, "../src");

function sources(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const file = path.join(dir, name);
		if (statSync(file).isDirectory()) return name === "i18n" ? [] : sources(file);
		return /\.tsx?$/.test(name) ? [file] : [];
	});
}

/** Include quoted, multiline and single-quoted messages as parsed by TypeScript. */
function usedKeys(): Set<string> {
	const keys = new Set<string>();
	for (const file of sources(SRC)) {
		const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
		const visit = (node: ts.Node) => {
			if (
				ts.isCallExpression(node) &&
				ts.isIdentifier(node.expression) &&
				["t", "msg", "localized"].includes(node.expression.text)
			) {
				const key = node.arguments[0];
				if (key && ts.isStringLiteralLike(key)) keys.add(key.text);
			}
			ts.forEachChild(node, visit);
		};
		visit(source);
	}
	return keys;
}

const placeholders = (s: string) => [...s.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort();

afterEach(() => {
	setLocale("es");
	vi.unstubAllGlobals();
});

describe("translations", () => {
	it("has English for every text shown", () => {
		// key combos and the app's name read the same in both languages
		const missing = [...usedKeys()].filter((k) => !(k in en) && /[a-záéíóúñ]{4,}/.test(k));
		expect(missing).toEqual([]);
	});

	it("routes visible copy through translation", () => {
		const untranslated: string[] = [];
		const neutral = new Set(["base", "· AND", "· XOR", "a &amp; b"]);
		const attributes = new Set(["title", "aria-label", "placeholder", "label", "description", "subtitle"]);
		for (const file of sources(path.join(SRC, "ui"))) {
			const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
			const visit = (node: ts.Node) => {
				let text: string | undefined;
				if (ts.isJsxText(node)) text = node.text.trim();
				if (
					ts.isJsxAttribute(node) &&
					attributes.has(node.name.getText(source)) &&
					node.initializer &&
					ts.isStringLiteral(node.initializer)
				)
					text = node.initializer.text;
				if (text && /[a-záéíóúñ]{3}/i.test(text) && !neutral.has(text)) untranslated.push(text);
				ts.forEachChild(node, visit);
			};
			visit(source);
		}
		expect(untranslated).toEqual([]);
	});

	it("has English for every keyed Spanish string", () => {
		expect(Object.keys(es).filter((k) => !(k in en))).toEqual([]);
	});

	it("keeps the same placeholders in both languages", () => {
		const wrong = Object.entries(en).filter(
			([k, v]) => placeholders(es[k] ?? k).join() !== placeholders(v).join(),
		);
		expect(wrong).toEqual([]);
	});

	it("switches language at runtime", () => {
		expect(t("lib.gates")).toBe("Puertas");
		expect(t("Se abrió {0}.", ["a.circ"])).toBe("Se abrió a.circ.");
		setLocale("en");
		expect(t("lib.gates")).toBe("Gates");
		expect(t("Se abrió {0}.", ["a.circ"])).toBe("Opened a.circ.");
		expect(t("Ctrl/⌘ + O")).toBe("Ctrl/⌘ + O");
	});
});

describe("language persistence and notices", () => {
	it("uses Spanish when storage is missing, invalid or unavailable", () => {
		for (const raw of [null, "fr", "", '"en"']) {
			vi.stubGlobal("localStorage", { getItem: () => raw });
			expect(loadLocale()).toBe("es");
		}
		vi.stubGlobal("localStorage", {
			getItem: () => {
				throw new Error("unavailable");
			},
		});
		expect(loadLocale()).toBe("es");
	});

	it("restores the chosen language", () => {
		const values = new Map<string, string>();
		vi.stubGlobal("localStorage", {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
		});
		saveLocale("en");
		expect(loadLocale()).toBe("en");
		saveLocale("es");
		expect(loadLocale()).toBe("es");
	});

	it("updates existing notices without changing their arguments", () => {
		const args = ["a.circ"];
		const notice = localized("Se abrió {0}.", args);
		args[0] = "b.circ";
		expect(notice()).toBe("Se abrió a.circ.");
		setLocale("en");
		expect(notice()).toBe("Opened a.circ.");
	});

	it("notifies independent views only when the language changes", () => {
		const listener = vi.fn();
		const unsubscribe = subscribeLocale(listener);
		setLocale("es");
		expect(listener).not.toHaveBeenCalled();
		setLocale("en");
		expect(getLocale()).toBe("en");
		expect(listener).toHaveBeenCalledTimes(1);
		unsubscribe();
		setLocale("es");
		expect(listener).toHaveBeenCalledTimes(1);
	});
});

describe("stored diagnostics", () => {
	it("translates import warnings without changing the circuit file", () => {
		const project = readCirc(
			'<project source="2.7.1"><lib name="0" desc="#Wiring"/><circuit name="main"><comp lib="0" name="Pin" loc="bad"/></circuit></project>',
		);
		expect(project.messages).toHaveLength(1);
		expect(renderMessage(project.messages[0])).toContain("ubicación inválida");
		const original = writeCirc(project);
		setLocale("en");
		expect(renderMessage(project.messages[0])).toContain("invalid location");
		expect(writeCirc(project)).toBe(original);
	});

	it("translates parser errors that are already visible", () => {
		let error: ParserError | undefined;
		try {
			parseExpression("a +", ["a"]);
		} catch (caught) {
			if (!(caught instanceof ParserError)) throw caught;
			error = caught;
		}
		expect(error).toBeInstanceOf(ParserError);
		const spanish = error?.message;
		setLocale("en");
		expect(error?.message).not.toBe(spanish);
		expect(error?.offset).toBe(2);
	});
});
