import { describe, expect, it } from "bun:test";
import {
  adjustCutToArea,
  buildFirstMeasuredCutCandidate,
  circleArea,
  cutAreaForCuts,
  cutDoseForCuts,
  cutSegmentThroughCircle,
  measuredCutPreview,
  roundCutLength,
  translateCut,
} from "./geometry";
import type { Cut, Direction, MeasuredInputs, StartChoice } from "./types";

const radius = 6.18039 / 2;
const fullDose = 21;

const inputs = (changes: Partial<MeasuredInputs>): MeasuredInputs => ({
  start: "a",
  firstPosition: "near-top",
  length: "",
  dose: "",
  direction: "auto",
  source: "length",
  ...changes,
});

interface ConnectedDoseCase {
  readonly start: StartChoice;
  readonly direction: Direction;
  readonly length: number;
}

const connectedDoseCases: readonly ConnectedDoseCase[] = [
  { start: "a", direction: "clockwise", length: 4 },
  { start: "a", direction: "counterclockwise", length: 6 },
  { start: "b", direction: "clockwise", length: 5 },
  { start: "b", direction: "counterclockwise", length: 4 },
];

describe("first measured cut", () => {
  it("calculates approximately 0.551 mg for a 3.0 cm chord", () => {
    const result = buildFirstMeasuredCutCandidate({ length: 3, radius, fullDose });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dosage).toBeCloseTo(0.551, 2);
  });

  it("places the same chord near the top or near the bottom", () => {
    const nearTop = buildFirstMeasuredCutCandidate({
      length: 3,
      radius,
      fullDose,
      position: "near-top",
    });
    const nearBottom = buildFirstMeasuredCutCandidate({
      length: 3,
      radius,
      fullDose,
      position: "near-bottom",
    });

    expect(nearTop.ok).toBe(true);
    expect(nearBottom.ok).toBe(true);
    if (!nearTop.ok || !nearBottom.ok) return;
    expect(nearBottom.cut.a.y).toBeCloseTo(-nearTop.cut.a.y, 8);
    expect(nearBottom.length).toBeCloseTo(nearTop.length, 8);
    expect(nearBottom.dosage + nearTop.dosage).toBeCloseTo(fullDose, 3);
    expect(nearBottom.removedArea).toBeGreaterThan(circleArea(radius) / 2);
  });

  it("calculates approximately 4.076 cm for a 1.5 mg top area", () => {
    const result = measuredCutPreview([], radius, fullDose, inputs({ source: "dose", dose: "1.5" }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.length).toBeCloseTo(4.076, 2);
    expect(result.dosage).toBeCloseTo(1.5, 3);
  });

  it("rounds 4.076 cm to 4.1 cm and recalculates approximately 1.530 mg", () => {
    const length = roundCutLength(4.076, radius * 2);
    const result = buildFirstMeasuredCutCandidate({ length, radius, fullDose });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(length).toBe(4.1);
    expect(result.dosage).toBeCloseTo(1.53, 2);
  });

  it("rounds down to a tenth when rounding up would exceed the diameter", () => {
    const length = roundCutLength(6.18, radius * 2);

    expect(length).toBe(6.1);
    expect(buildFirstMeasuredCutCandidate({ length, radius, fullDose }).ok).toBe(true);
  });

  it("keeps a rounded length equal to an exact tenth diameter", () => {
    expect(roundCutLength(6.18, 6.2)).toBe(6.2);
  });

  it("limits a near-top first area dosage to half of the labeled dose", () => {
    const result = measuredCutPreview([], radius, fullDose, inputs({ source: "dose", dose: "10.501" }));

    expect(result.ok).toBe(false);
  });

  it("solves a large near-bottom top area from dosage", () => {
    const result = measuredCutPreview([], radius, fullDose, inputs({
      firstPosition: "near-bottom",
      source: "dose",
      dose: "19.5",
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.length).toBeCloseTo(4.076, 2);
    expect(result.dosage).toBeCloseTo(19.5, 3);
    expect(result.cut.a.y).toBeGreaterThan(0);
  });

  it("rejects a near-bottom top-area dosage below half of the labeled dose", () => {
    const result = measuredCutPreview([], radius, fullDose, inputs({
      firstPosition: "near-bottom",
      source: "dose",
      dose: "10.499",
    }));

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

describe("connected measured cut dose solver", () => {
  connectedDoseCases.forEach(({ start, direction, length }) => {
    it(`solves the ${start.toUpperCase()} / ${direction} area from a ${length} cm cut`, () => {
      const first = buildFirstMeasuredCutCandidate({ length: 3, radius, fullDose });
      expect(first.ok).toBe(true);
      if (!first.ok) return;

      const previous: Cut = { ...first.cut, color: "#e74c3c" };
      const lengthPreview = measuredCutPreview(
        [previous],
        radius,
        fullDose,
        inputs({
          start,
          direction,
          length: String(length),
          source: "length",
        }),
      );
      expect(lengthPreview.ok).toBe(true);
      if (!lengthPreview.ok) return;
      const targetCuts = [previous, lengthPreview.cut];
      const targetArea = cutAreaForCuts(targetCuts, 1, radius);
      const targetDose = cutDoseForCuts(targetCuts, 1, radius, fullDose);
      expect(lengthPreview.dosage).toBeCloseTo(targetDose, 5);

      const dosePreview = measuredCutPreview(
        [previous],
        radius,
        fullDose,
        inputs({
          start,
          direction,
          dose: String(targetDose),
          source: "dose",
        }),
      );
      expect(dosePreview.ok).toBe(true);
      if (!dosePreview.ok) return;

      const previousSegment = cutSegmentThroughCircle(previous, radius);
      expect(previousSegment.kind).toBe("some");
      if (previousSegment.kind === "none") return;
      const expectedStart = start === "a" ? previousSegment.value.a : previousSegment.value.b;
      const solvedCuts = [previous, dosePreview.cut];
      const solvedLength = Math.hypot(
        dosePreview.cut.b.x - dosePreview.cut.a.x,
        dosePreview.cut.b.y - dosePreview.cut.a.y,
      );
      const solvedEndRadius = Math.hypot(dosePreview.cut.b.x, dosePreview.cut.b.y);

      expect(dosePreview.direction).toBe(direction);
      expect(dosePreview.length).toBeCloseTo(length, 3);
      expect(solvedLength).toBeCloseTo(length, 3);
      expect(solvedEndRadius).toBeCloseTo(radius, 6);
      expect(dosePreview.cut.a.x).toBeCloseTo(expectedStart.x, 6);
      expect(dosePreview.cut.a.y).toBeCloseTo(expectedStart.y, 6);
      expect(cutAreaForCuts(solvedCuts, 1, radius)).toBeCloseTo(targetArea, 5);
      expect(dosePreview.removedArea).toBeCloseTo(targetArea, 5);
      expect(cutDoseForCuts(solvedCuts, 1, radius, fullDose)).toBeCloseTo(lengthPreview.dosage, 5);
    });
  });

  it("rejects a dose outside the connected range for the selected endpoint and direction", () => {
    const first = buildFirstMeasuredCutCandidate({ length: 3, radius, fullDose });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const result = measuredCutPreview(
      [{ ...first.cut, color: "#e74c3c" }],
      radius,
      fullDose,
      inputs({
        start: "a",
        direction: "clockwise",
        dose: "10",
        source: "dose",
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe("This dosage is not reachable from the selected endpoint and direction.");
  });
});
