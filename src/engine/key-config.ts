// Port of com.cburch.logisim.tools.key: keys typed while a component is
// selected (or while its add tool is active) change its attributes, e.g.
// "3" sets a gate's inputs and Alt+"8" its data width.

import type { AnyAttribute, Attribute, AttributeSet } from "./attributes";
import type { Direction } from "./geom";

/** InputEvent modifier masks, as compared by Logisim (exact match). */
export const MOD_SHIFT = 1;
export const MOD_CTRL = 2;
export const MOD_ALT = 4;
export const MOD_META = 8;

/** KeyConfigurationEvent.KEY_PRESSED / KEY_TYPED (KEY_RELEASED is unused). */
export type KeyConfigurationType = "pressed" | "typed";

export class KeyConfigurationEvent {
	consumed = false;

	constructor(
		readonly type: KeyConfigurationType,
		/** For "pressed", the DOM key name ("ArrowUp"); for "typed", the character. */
		readonly key: string,
		readonly mods: number,
		readonly attrs: AttributeSet,
		/** Event time in ms (System.currentTimeMillis()). */
		readonly when: number,
	) {}

	consume(): void {
		this.consumed = true;
	}
}

/** KeyConfigurationResult: the attribute values to set. */
export type KeyConfigurationResult = Map<AnyAttribute, unknown>;

/**
 * KeyConfigurator. Instances keep state between keys (multi-digit numbers),
 * so the editor creates one per selected component or add tool.
 */
export interface KeyConfigurator {
	keyEventReceived(event: KeyConfigurationEvent): KeyConfigurationResult | null;
}

/** NumericConfigurator.MAX_TIME_KEY_LASTS: digits typed closer than this accumulate. */
const MAX_TIME_KEY_LASTS = 800;

/** NumericConfigurator, also IntegerConfigurator and BitWidthConfigurator. */
export class NumericConfigurator implements KeyConfigurator {
	private curValue = 0;
	private whenTyped = 0;

	constructor(
		private readonly attr: Attribute<number>,
		private readonly minValue: number,
		private readonly maxValue: number,
		private readonly modsEx: number,
		private readonly radix = 10,
	) {}

	protected getMinimumValue(_attrs: AttributeSet): number {
		return this.minValue;
	}

	protected getMaximumValue(_attrs: AttributeSet): number {
		return this.maxValue;
	}

	keyEventReceived(event: KeyConfigurationEvent): KeyConfigurationResult | null {
		if (event.type !== "typed" || event.key.length !== 1) return null;
		const digit = Number.parseInt(event.key, this.radix);
		if (Number.isNaN(digit) || event.mods !== this.modsEx) return null;
		const sinceLast = event.when - this.whenTyped;
		const min = this.getMinimumValue(event.attrs);
		const max = this.getMaximumValue(event.attrs);
		let val = 0;
		if (sinceLast < MAX_TIME_KEY_LASTS) {
			val = Math.imul(this.radix, this.curValue);
			if (val > max) val = 0;
		}
		val = (val + digit) | 0;
		if (val > max) {
			val = digit;
			if (val > max) return null;
		}
		event.consume();
		this.whenTyped = event.when;
		this.curValue = val;
		if (val < min) return null;
		return new Map([[this.attr, val]]);
	}
}

/** IntegerConfigurator(attr, min, max, modifiersEx[, radix]). */
export function integerConfigurator(
	attr: Attribute<number>,
	min: number,
	max: number,
	modifiersEx: number,
	radix = 10,
): KeyConfigurator {
	return new NumericConfigurator(attr, min, max, modifiersEx, radix);
}

/** BitWidthConfigurator: by default 1–32 with Alt held. */
export function bitWidthConfigurator(
	attr: Attribute<number>,
	min = 1,
	max = 32,
	modifiersEx = MOD_ALT,
): KeyConfigurator {
	return new NumericConfigurator(attr, min, max, modifiersEx);
}

/** std.wiring.ConstantConfigurator: hex digits typed without modifiers, bounded by the width. */
export class ConstantConfigurator extends NumericConfigurator {
	constructor(
		value: Attribute<number>,
		private readonly width: Attribute<number>,
	) {
		super(value, 0, 0, 0, 16);
	}

	protected override getMaximumValue(attrs: AttributeSet): number {
		const w = attrs.get(this.width);
		// BitWidth.getMask() is negative for 32 bits
		return w < 31 ? (1 << w) - 1 : 0x7fffffff;
	}

	protected override getMinimumValue(attrs: AttributeSet): number {
		return attrs.get(this.width) < 32 ? 0 : -0x80000000;
	}
}

const DIRECTION_KEYS: Record<string, Direction> = {
	ArrowUp: "north",
	ArrowDown: "south",
	ArrowLeft: "west",
	ArrowRight: "east",
};

/** DirectionConfigurator: arrow keys with the given modifiers set a direction. */
export class DirectionConfigurator implements KeyConfigurator {
	constructor(
		private readonly attr: Attribute<Direction>,
		private readonly modsEx: number,
	) {}

	keyEventReceived(event: KeyConfigurationEvent): KeyConfigurationResult | null {
		if (event.type !== "pressed" || event.mods !== this.modsEx) return null;
		const value = DIRECTION_KEYS[event.key];
		if (!value) return null;
		event.consume();
		return new Map([[this.attr, value]]);
	}
}

/** JoinedConfigurator: the first handler that answers or consumes wins. */
export class JoinedConfigurator implements KeyConfigurator {
	private readonly handlers: KeyConfigurator[];

	constructor(...handlers: KeyConfigurator[]) {
		this.handlers = handlers;
	}

	keyEventReceived(event: KeyConfigurationEvent): KeyConfigurationResult | null {
		if (event.consumed) return null;
		for (const h of this.handlers) {
			const result = h.keyEventReceived(event);
			if (result !== null || event.consumed) return result;
		}
		return null;
	}
}

/** ParallelConfigurator: every handler sees the key; results are merged. */
export class ParallelConfigurator implements KeyConfigurator {
	private readonly handlers: KeyConfigurator[];

	constructor(...handlers: KeyConfigurator[]) {
		this.handlers = handlers;
	}

	keyEventReceived(event: KeyConfigurationEvent): KeyConfigurationResult | null {
		if (event.consumed) return null;
		let merged: KeyConfigurationResult | null = null;
		for (const h of this.handlers) {
			const result = h.keyEventReceived(event);
			if (result === null) continue;
			if (merged === null) merged = new Map(result);
			else for (const [a, v] of result) merged.set(a, v);
		}
		return merged;
	}
}
