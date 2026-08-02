import { describe, expect, it } from "vitest";
import { appendDigit, deleteDigit } from "../keypad";

describe("appendDigit", () => {
  it("builds a number as digits are typed", () => {
    expect(appendDigit(appendDigit("", "4"), "2")).toBe("42");
  });

  it("refuses a leading zero, because 042 is typed as 42", () => {
    expect(appendDigit("", "0")).toBe("");
    expect(appendDigit("4", "0")).toBe("40");
  });

  it("ignores anything that is not a digit", () => {
    expect(appendDigit("4", "x")).toBe("4");
  });

  it("stops at four digits", () => {
    expect(appendDigit("1234", "5")).toBe("1234");
  });
});

describe("deleteDigit", () => {
  it("removes the last digit and survives an empty string", () => {
    expect(deleteDigit("42")).toBe("4");
    expect(deleteDigit("")).toBe("");
  });
});
