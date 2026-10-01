"use client";

// On phones and tablets, typing into a poked component (Keyboard, registers,
// counters, memories) needs an on-screen keyboard, which only appears for a
// focused text field and reports characters through input events rather
// than key events. This hidden field turns what is typed into the same keys
// the desktop sends.

import { Keyboard } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Workspace } from "./workspace";

/** What the field holds between keystrokes, so Backspace always has something to delete. */
const SENTINEL = "  ";

const PRESSED = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Delete", "Home", "End", "Tab"]);

export function TouchKeyInput({ ws }: { ws: Workspace }) {
	const ref = useRef<HTMLInputElement>(null);
	const composing = useRef(false);
	const caret = ws.tool.kind === "poke" ? ws.pokeCaret : null;
	const caretId = caret?.state.instance.id ?? null;

	const reset = () => {
		const el = ref.current;
		if (!el) return;
		el.value = SENTINEL;
		el.setSelectionRange(SENTINEL.length, SENTINEL.length);
	};

	const flush = () => {
		const el = ref.current;
		if (!el || composing.current) return;
		const v = el.value;
		if (v.length < SENTINEL.length) {
			for (let i = v.length; i < SENTINEL.length; i++) ws.pokeKey("\b");
		} else {
			for (const ch of v.slice(SENTINEL.length)) ws.pokeKey(ch);
		}
		reset();
	};

	// a new caret (a tap on a component that takes keys) brings up the keyboard
	// biome-ignore lint/correctness/useExhaustiveDependencies: only when another component is poked
	useEffect(() => {
		if (caretId === null) return;
		const focus = () => {
			reset();
			ref.current?.focus({ preventScroll: true });
		};
		focus();
		// the tap's trailing mousedown/click moves the focus away; take it back
		// during that click, which also counts as the user gesture iOS requires
		window.addEventListener("click", focus, { once: true, capture: true });
		const timer = setTimeout(() => window.removeEventListener("click", focus, { capture: true }), 1000);
		return () => {
			clearTimeout(timer);
			window.removeEventListener("click", focus, { capture: true });
		};
	}, [caretId]);

	if (!caret?.poker.keyTyped) return null;
	return (
		<>
			<input
				ref={ref}
				aria-label="Escribir en el componente"
				defaultValue={SENTINEL}
				autoCapitalize="off"
				autoCorrect="off"
				autoComplete="off"
				spellCheck={false}
				enterKeyHint="enter"
				onInput={flush}
				onCompositionStart={() => {
					composing.current = true;
				}}
				onCompositionEnd={() => {
					composing.current = false;
					flush();
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter") ws.pokeKey("\n");
					else if (e.key === "Escape") ref.current?.blur();
					else if (PRESSED.has(e.key)) {
						if (!ws.pokeKeyPressed(e.key) && e.key === "Tab") ws.pokeKey("\t");
					} else return;
					e.preventDefault();
				}}
				className="pointer-events-none fixed bottom-0 left-1/2 size-px opacity-0"
			/>
			<button
				type="button"
				onClick={() => {
					reset();
					ref.current?.focus({ preventScroll: true });
				}}
				className="fixed bottom-12 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-panel px-4 py-2 text-sm shadow-lg"
			>
				<Keyboard className="size-4" />
				Escribir en {caret.state.instance.factory.name === "Keyboard" ? "el teclado" : "el componente"}
			</button>
		</>
	);
}
