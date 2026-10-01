"use client";

import { useEffect, useState } from "react";
import type { GateShape } from "@/engine/component";

/** UI preferences are separate from circuit files and tolerate unavailable storage. */
export function usePreference<T extends boolean | number>(key: string, fallback: T) {
	const [value, setValue] = useState<T>(() => {
		try {
			const raw: unknown = JSON.parse(localStorage.getItem(`logihur.ui.${key}`) ?? "null");
			if (typeof raw === typeof fallback && (typeof raw !== "number" || Number.isFinite(raw)))
				return raw as T;
		} catch {
			/* Use defaults when storage is unavailable or corrupt. */
		}
		return fallback;
	});
	useEffect(() => {
		try {
			localStorage.setItem(`logihur.ui.${key}`, JSON.stringify(value));
		} catch {
			/* Optional persistence. */
		}
	}, [key, value]);
	return [value, setValue] as const;
}

export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
	useEffect(() => {
		const media = window.matchMedia(query);
		const update = () => setMatches(media.matches);
		update();
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, [query]);
	return matches;
}

const GATE_SHAPES: readonly GateShape[] = ["shaped", "rectangular", "din40700"];

/** AppPreferences.GATE_SHAPE, kept in this browser. */
export function loadGateShape(): GateShape {
	try {
		const raw = localStorage.getItem("logihur.ui.gateShape");
		if (GATE_SHAPES.includes(raw as GateShape)) return raw as GateShape;
	} catch {
		/* Use the default when storage is unavailable. */
	}
	return "shaped";
}

export function saveGateShape(shape: GateShape): void {
	try {
		localStorage.setItem("logihur.ui.gateShape", shape);
	} catch {
		/* Optional persistence. */
	}
}
