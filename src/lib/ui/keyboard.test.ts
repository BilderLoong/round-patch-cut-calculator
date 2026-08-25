import { describe, expect, it } from "bun:test";
import { isFormEditingTag } from "./keyboard";

describe("form keyboard safety", () => {
  it("keeps Backspace inside a select from reaching cut deletion", () => {
    expect(isFormEditingTag("SELECT", false)).toBe(true);
  });

  it("recognizes text controls and contenteditable elements", () => {
    expect(isFormEditingTag("input", false)).toBe(true);
    expect(isFormEditingTag("textarea", false)).toBe(true);
    expect(isFormEditingTag("div", true)).toBe(true);
    expect(isFormEditingTag("canvas", false)).toBe(false);
  });
});
