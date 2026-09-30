// Port of com.cburch.logisim.circuit.RadixOption.

import { optionAttr } from "@/engine/attributes";
import type { Value } from "@/engine/value";

export type Radix = "2" | "8" | "10signed" | "10unsigned" | "16";

export const RADIX = optionAttr("radix", "radix.attr", [
	{ value: "2", label: "radix.2" },
	{ value: "8", label: "radix.8" },
	{ value: "10signed", label: "radix.10signed" },
	{ value: "10unsigned", label: "radix.10unsigned" },
	{ value: "16", label: "radix.16" },
]);

export function radixToString(radix: string, value: Value): string {
	switch (radix) {
		case "8":
			return value.toDisplayString(8);
		case "10signed":
			return value.toDecimalString(true);
		case "10unsigned":
			return value.toDecimalString(false);
		case "16":
			return value.toDisplayString(16);
		default:
			return value.toDisplayString(2);
	}
}

export function radixMaxLength(radix: string, width: number): number {
	switch (radix) {
		case "8":
			return Math.max(1, Math.trunc((width + 2) / 3));
		case "16":
			return Math.max(1, Math.trunc((width + 3) / 4));
		case "10signed":
			if (width >= 2 && width <= 4) return 2;
			if (width >= 5 && width <= 7) return 3;
			if (width >= 8 && width <= 10) return 4;
			if (width >= 11 && width <= 14) return 5;
			if (width >= 15 && width <= 17) return 6;
			if (width >= 18 && width <= 20) return 7;
			if (width >= 21 && width <= 24) return 8;
			if (width >= 25 && width <= 27) return 9;
			if (width >= 28 && width <= 30) return 10;
			if (width >= 31 && width <= 32) return 11;
			return 1;
		case "10unsigned":
			if (width >= 4 && width <= 6) return 2;
			if (width >= 7 && width <= 9) return 3;
			if (width >= 10 && width <= 13) return 4;
			if (width >= 14 && width <= 16) return 5;
			if (width >= 17 && width <= 19) return 6;
			if (width >= 20 && width <= 23) return 7;
			if (width >= 24 && width <= 26) return 8;
			if (width >= 27 && width <= 29) return 9;
			if (width >= 30 && width <= 32) return 10;
			return 1;
		default:
			if (width <= 1) return 1;
			return width + Math.trunc((width - 1) / 4);
	}
}
