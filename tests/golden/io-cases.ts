/** Input traces shared by the TypeScript tests and the real Java reference. */
export interface IoTrace {
	name: string;
	factory: string;
	javaClass: string;
	attrs?: Record<string, string | number | boolean>;
	steps: { ports: (number | string)[]; tick?: number; extra?: string }[];
}
const step = (ports: (number | string)[], extra?: string, tick = 0) => ({ ports, extra, tick });
export const IO_TRACES: IoTrace[] = [
	{ name: "led", factory: "LED", javaClass: "Led", steps: [0, 1, "x", "e"].map((v) => step([v])) },
	{
		name: "segments",
		factory: "7-Segment Display",
		javaClass: "SevenSegment",
		steps: Array.from({ length: 256 }, (_, mask) =>
			step(Array.from({ length: 8 }, (_, bit) => (mask >> bit) & 1)),
		),
	},
	{
		name: "hex",
		factory: "Hex Digit Display",
		javaClass: "HexDigit",
		steps: [...Array.from({ length: 16 }, (_, n) => n), "x", "e"].flatMap((v) => [
			step([v, 0]),
			step([v, 1]),
		]),
	},
	{
		name: "button",
		factory: "Button",
		javaClass: "Button",
		steps: [step([]), step([], "button=1"), step([], "button=0")],
	},
	...[2, 3, 4, 5].map((bits) => ({
		name: `joystick-${bits}`,
		factory: "Joystick",
		javaClass: "Joystick",
		attrs: { bits },
		steps: [step([]), step([], "joystick=-14,14"), step([], "joystick=14,-14")],
	})),
	...["rising", "falling"].map((trigger) => ({
		name: `keyboard-${trigger}`,
		factory: "Keyboard",
		javaClass: "Keyboard",
		attrs: { trigger, buflen: 4 },
		steps: [
			step([0, 0, 0]),
			step([0, 0, 0], "type=65,8,10,12,90"),
			step([0, 1, 1]),
			step([0, 0, 1]),
			step([0, 1, 0]),
			step([0, 0, 0]),
			step([1, 0, 1]),
		],
	})),
	...["rising", "falling"].map((trigger) => ({
		name: `tty-${trigger}`,
		factory: "TTY",
		javaClass: "Tty",
		attrs: { trigger, rows: 2, cols: 3 },
		steps: [
			step([0, 0, 1, 0]),
			...[65, 66, 67, 68, 69, 70, 71, 8, 10, 12, "x", 90].flatMap((v) => [
				step([0, 1, 1, v]),
				step([0, 0, 1, v]),
			]),
			step([1, 0, 1, 0]),
		],
	})),
	...["column", "row", "select"].map((inputtype) => ({
		name: `matrix-${inputtype}`,
		factory: "DotMatrix",
		javaClass: "DotMatrix",
		attrs: { inputtype, matrixrows: 2, matrixcols: 2, persist: 3 },
		steps: [
			step([0, 0]),
			step([1, 2]),
			step([0, 0], undefined, 1),
			step([0, 0], undefined, 3),
			step(["x", "e"], undefined, 4),
		],
	})),
];
