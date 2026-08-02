import { describe, expect, it } from "vitest";
import { labelInstruction } from "../label";

describe("labelInstruction", () => {
  it("shows the number alone before a room is chosen", () => {
    expect(labelInstruction("042")).toBe("042");
  });

  it("adds the color name once there is one", () => {
    expect(labelInstruction("042", "BLUE")).toBe("042  BLUE");
  });
});
