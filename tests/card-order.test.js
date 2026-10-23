import { describe, expect, it } from "vitest";
import {
	fellowshipSlot,
	fellowshipSlotAfterDrop,
} from "../modules/sheets/card-order.js";

describe("fellowshipSlot", () => {
	it("defaults to last when unset", () => {
		expect(fellowshipSlot(undefined, 4)).toBe(4);
	});

	it("clamps a stale slot to the theme count", () => {
		expect(fellowshipSlot(4, 2)).toBe(2);
		expect(fellowshipSlot(-1, 2)).toBe(0);
	});
});

describe("fellowshipSlotAfterDrop", () => {
	// Themes A B C D, Fellowship before C (slot 2).
	it("lands before a theme to its left", () => {
		expect(fellowshipSlotAfterDrop(2, 0)).toBe(0);
	});

	it("lands after a theme to its right", () => {
		expect(fellowshipSlotAfterDrop(2, 2)).toBe(3);
		expect(fellowshipSlotAfterDrop(2, 3)).toBe(4);
	});
});
