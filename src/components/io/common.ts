// Shared attributes and label geometry from Logisim 2.7.1 std.io.Io.
import { boolAttr, colorAttr, optionAttr } from "@/engine/attributes";
import type { Instance, TextFieldSpec } from "@/engine/component";
import { H_CENTER, H_LEFT, H_RIGHT, V_BOTTOM, V_CENTER, V_TOP } from "@/engine/graphics";
import { FACING, LABEL, LABEL_FONT } from "../std-attrs";

export const IO_COLOR = colorAttr("color", "io.color");
export const IO_ON = colorAttr("color", "io.onColor");
export const IO_OFF = colorAttr("offcolor", "io.offColor");
export const IO_BACKGROUND = colorAttr("bg", "io.background");
export const IO_ACTIVE = boolAttr("active", "io.active");
export const IO_LABEL_COLOR = colorAttr("labelcolor", "io.labelColor");
export const IO_LABEL_LOC = optionAttr("labelloc", "io.labelLoc", [
	{ value: "center", label: "io.center" },
	...["north", "south", "east", "west"].map((value) => ({ value, label: `direction.${value}` })),
]);
export const IO_FONT = { family: "Monospaced", style: "plain", size: 12 } as const;

export function ioTextField(inst: Instance, depth = 0): TextFieldSpec {
	const b = inst.bounds,
		loc = inst.attrs.get(IO_LABEL_LOC);
	let x = b.x + Math.trunc(b.width / 2),
		y = b.y + Math.trunc(b.height / 2);
	let halign = H_CENTER,
		valign = V_CENTER;
	if (loc === "center") {
		x = b.x + Math.trunc((b.width - depth) / 2);
		y = b.y + Math.trunc((b.height - depth) / 2);
	} else if (loc === "north") {
		y = b.y - 2;
		valign = V_BOTTOM;
	} else if (loc === "south") {
		y = b.y + b.height + 2;
		valign = V_TOP;
	} else if (loc === "east") {
		x = b.x + b.width + 2;
		halign = H_LEFT;
	} else if (loc === "west") {
		x = b.x - 2;
		halign = H_RIGHT;
	}
	if (loc === inst.attrs.get(FACING)) {
		if (loc === "north" || loc === "south") {
			x += 2;
			halign = H_LEFT;
		} else {
			y -= 2;
			valign = V_BOTTOM;
		}
	}
	return { labelAttr: LABEL, fontAttr: LABEL_FONT, x, y, halign, valign };
}

/** java.awt.Color.darker */
export function darker(color: string): string {
	return `#${[1, 3, 5]
		.map((i) =>
			Math.floor(Number.parseInt(color.slice(i, i + 2), 16) * 0.7)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}${color.slice(7)}`;
}
