import { describe, it, expect } from "vitest";
import { enterKeyAction } from "./form-enter";

const base = { key: "Enter", tagName: "INPUT", isLastQuestion: false };

describe("Enter i frågeformuläret", () => {
  it("går vidare i stället för att lämna in mitt i testet", () => {
    expect(enterKeyAction(base)).toBe("next");
  });

  it("lämnar in på sista frågan", () => {
    expect(enterKeyAction({ ...base, isLastQuestion: true })).toBe("submit");
  });

  it("rör inte andra tangenter", () => {
    expect(enterKeyAction({ ...base, key: "a" })).toBe("ignore");
    expect(enterKeyAction({ ...base, key: "Tab" })).toBe("ignore");
  });

  it("låter fritextsvar få sin radbrytning", () => {
    expect(enterKeyAction({ ...base, tagName: "TEXTAREA" })).toBe("ignore");
    expect(enterKeyAction({ ...base, tagName: "TEXTAREA", isLastQuestion: true })).toBe("ignore");
  });

  it("lägger sig inte i knapparnas Enter", () => {
    expect(enterKeyAction({ ...base, tagName: "BUTTON" })).toBe("ignore");
    expect(enterKeyAction({ ...base, tagName: "BUTTON", isLastQuestion: true })).toBe("ignore");
  });

  it("avbryter inte en pågående IME-komposition", () => {
    expect(enterKeyAction({ ...base, isComposing: true })).toBe("ignore");
    expect(enterKeyAction({ ...base, isComposing: true, isLastQuestion: true })).toBe("ignore");
  });
});
