// Port of com.cburch.logisim.instance.StdAttr and a few shared helpers.

import { bitWidthAttr, directionAttr, fontAttr, optionAttr, stringAttr } from "@/engine/attributes";

export const FACING = directionAttr("facing", "std.facing");
export const WIDTH = bitWidthAttr("width", "std.dataWidth");
export const LABEL = stringAttr("label", "std.label");
export const LABEL_FONT = fontAttr("labelfont", "std.labelFont");

export const TRIGGER = optionAttr("trigger", "std.trigger", [
	{ value: "rising", label: "std.triggerRising" },
	{ value: "falling", label: "std.triggerFalling" },
	{ value: "high", label: "std.triggerHigh" },
	{ value: "low", label: "std.triggerLow" },
]);

export const EDGE_TRIGGER = optionAttr("trigger", "std.trigger", [
	{ value: "rising", label: "std.triggerRising" },
	{ value: "falling", label: "std.triggerFalling" },
]);

/** Pin.ATTR_LABEL_LOC, shared by pins, probes and clocks. */
export const LABEL_LOC = directionAttr("labelloc", "pin.labelLoc");
