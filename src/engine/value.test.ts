import { describe, expect, it } from "vitest";
import { Value } from "./value";

describe("Value", () => {
	it("keeps one-bit values as singletons", () => {
		expect(Value.createKnown(1, 1)).toBe(Value.TRUE);
		expect(Value.createKnown(1, 0)).toBe(Value.FALSE);
		expect(Value.createUnknown(1)).toBe(Value.UNKNOWN);
		expect(Value.createError(1)).toBe(Value.ERROR);
	});

	it("formats like Logisim", () => {
		expect(Value.createKnown(8, 0xa5).toString()).toBe("1010 0101");
		expect(Value.createKnown(8, 0xa5).toHexString()).toBe("a5");
		expect(Value.createKnown(4, 0xf).toDecimalString(true)).toBe("-1");
		expect(Value.createKnown(4, 0xf).toDecimalString(false)).toBe("15");
		expect(Value.createKnown(32, -1).toDecimalString(false)).toBe("4294967295");
		expect(Value.createUnknown(4).toString()).toBe("xxxx");
		expect(Value.fromBits([Value.TRUE, Value.ERROR, Value.UNKNOWN]).toString()).toBe("xE1");
	});

	it("combines drivers: unknown yields, conflicts are errors", () => {
		expect(Value.UNKNOWN.combine(Value.TRUE)).toBe(Value.TRUE);
		expect(Value.TRUE.combine(Value.FALSE)).toBe(Value.ERROR);
		const a = Value.fromBits([Value.TRUE, Value.UNKNOWN]);
		const b = Value.fromBits([Value.UNKNOWN, Value.FALSE]);
		expect(a.combine(b).toString()).toBe("01");
	});

	it("implements 4-valued logic", () => {
		expect(Value.FALSE.and(Value.UNKNOWN)).toBe(Value.FALSE);
		expect(Value.TRUE.and(Value.UNKNOWN)).toBe(Value.ERROR);
		expect(Value.TRUE.or(Value.ERROR)).toBe(Value.TRUE);
		expect(Value.UNKNOWN.not()).toBe(Value.ERROR);
		const x = Value.createKnown(4, 0b1100);
		const y = Value.createKnown(4, 0b1010);
		expect(x.and(y).toIntValue()).toBe(0b1000);
		expect(x.or(y).toIntValue()).toBe(0b1110);
		expect(x.xor(y).toIntValue()).toBe(0b0110);
		expect(x.not().toIntValue()).toBe(0b0011);
	});

	it("extends width", () => {
		expect(Value.createKnown(4, 0b1010).extendWidth(8, Value.TRUE).toIntValue()).toBe(0xfa);
		expect(Value.createKnown(4, 0b1010).extendWidth(8, Value.FALSE).toIntValue()).toBe(0x0a);
	});
});
