import { describe, expect, it } from "bun:test";
import {
  adjustCutToArea,
  buildFirstMeasuredCutCandidate,
  circleArea,
  cutAreaForCuts,
  translateCut,
  measuredCutPreview,
} from "./geometry";
import type { Cut } from "./types";
import type { MeasuredInputs } from "./types";

const radius = 6.18039 / 2;
const fullDose = 21;

const inputs = (changes: Partial<MeasuredInputs>): MeasuredInputs => ({
  start: "a",
  length: "",
  dose: "",
  direction: "auto",
  source: "length",
  ...changes,
});

describe("first measured cut", () => {
  it("calculates approximately 0.551 mg for a 3.0 cm chord", () => {
    const result = buildFirstMeasuredCutCandidate({ length: 3, radius, fullDose });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dosage).toBeCloseTo(0.551, 2);
  });

  it("calculates approximately 4.076 cm for a 1.5 mg top area", () => {
    const result = measuredCutPreview([], radius, fullDose, inputs({ source: "dose", dose: "1.5" }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.length).toBeCloseTo(4.076, 2);
    expect(result.dosage).toBeCloseTo(1.5, 3);
  });

  it("rounds 4.076 cm to 4.1 cm and recalculates approximately 1.530 mg", () => {
    const result = buildFirstMeasuredCutCandidate({ length: 4.1, radius, fullDose });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Math.round(4.076 * 10) / 10).toBe(4.1);
    expect(result.dosage).toBeCloseTo(1.53, 2);
  });

  it("limits the first area dosage to half of the labeled dose", () => {
    const result = measuredCutPreview([], radius, fullDose, inputs({ source: "dose", dose: "10.501" }));

    expect(result.ok).toBe(false);
  });

  it("rejects a first cut that creates no meaningful area", () => {
    const result = buildFirstMeasuredCutCandidate({ length: 0.000001, radius, fullDose });

    expect(result.ok).toBe(false);
  });

  it("reports the new cut length when a later length input is empty", () => {
    const first = buildFirstMeasuredCutCandidate({ length: 3, radius, fullDose });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const previous = { ...first.cut, color: "#e74c3c" };
    const result = measuredCutPreview([previous], radius, fullDose, inputs({ length: "", source: "length" }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe("Enter the new cut length.");
  });

  it("rejects an invalid translated measurement cut", () => {
    const cut: Cut = {
      a: { x: -1, y: 0 },
      b: { x: 1, y: 0 },
      removeSign: -1,
      color: "#e74c3c",
    };
    expect(cutAreaForCuts([cut], 0, radius)).toBeCloseTo(circleArea(radius) / 2, 4);
    const result = adjustCutToArea([cut], 0, 5, radius);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("usable chord");
  });

  it("moves a cut along its normal and changes its owned area", () => {
    const candidate = buildFirstMeasuredCutCandidate({ length: 3, radius, fullDose });
    expect(candidate.ok).toBe(true);
    if (!candidate.ok) return;

    const original = cutAreaForCuts([candidate.cut], 0, radius);
    const moved = translateCut(candidate.cut, 0.2);
    expect(moved.kind).toBe("some");
    if (moved.kind === "none") return;

    const next = cutAreaForCuts([moved.value], 0, radius);
    expect(next).not.toBeCloseTo(original, 6);
  });
});
