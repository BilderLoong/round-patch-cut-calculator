import { describe, expect, it } from "bun:test";
import {
  addCut,
  appendHistorySnapshot,
  changeLengthMeasurement,
  commitHistory,
  initialCalculatorState,
  initialHistoryState,
  replaceCut,
  undoHistory,
} from "./state";
import { buildFirstMeasuredCutCandidate, measuredCutPreview, translateCut } from "./geometry";
import type { MeasuredInputs } from "./types";

const radius = 6.18039 / 2;
const fullDose = 21;

describe("length measurement selection", () => {
  it("keeps the same endpoint when switching to the gap and back", () => {
    const first = buildFirstMeasuredCutCandidate({ length: 6.1, radius, fullDose });
    if (!first.ok) throw new Error(first.message);
    const state = addCut(initialCalculatorState(), first.cut);
    const inputs: MeasuredInputs = {
      start: "a", firstPosition: "near-top", length: "6.15", dose: "", direction: "auto", source: "length", lengthMeasurement: "cut",
    };
    const original = measuredCutPreview(state.cuts, radius, fullDose, inputs);
    expect(original.ok).toBe(true);
    if (!original.ok) return;

    const gapInputs = changeLengthMeasurement(state, inputs, original, "other-endpoint");
    const gap = measuredCutPreview(state.cuts, radius, fullDose, gapInputs);
    expect(gap.ok).toBe(true);
    if (!gap.ok) return;
    expect(Number(gapInputs.length)).toBeCloseTo(0.384522, 4);
    expect(gap.cut.b.x).toBeCloseTo(original.cut.b.x, 4);
    expect(gap.cut.b.y).toBeCloseTo(original.cut.b.y, 4);
    const restoredInputs = changeLengthMeasurement(state, gapInputs, gap, "cut");
    const restored = measuredCutPreview(state.cuts, radius, fullDose, restoredInputs);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.cut.b.x).toBeCloseTo(original.cut.b.x, 4);
    expect(restored.cut.b.y).toBeCloseTo(original.cut.b.y, 4);
    expect(inputs.lengthMeasurement).toBe("cut");
    expect(inputs.length).toBe("6.15");
  });
});

describe("calculator history", () => {
  it("keeps the final dragged cut current and records the pre-drag snapshot", () => {
    const candidate = buildFirstMeasuredCutCandidate({ length: 3, radius, fullDose });
    expect(candidate.ok).toBe(true);
    if (!candidate.ok) return;

    const base = initialCalculatorState();
    const withCut = addCut(base, candidate.cut);
    const started = commitHistory(initialHistoryState(), withCut);
    const moved = translateCut(candidate.cut, 0.2);
    expect(moved.kind).toBe("some");
    if (moved.kind === "none") return;

    const finalState = replaceCut(started.current, 0, moved.value);
    const inProgress = { ...started, current: finalState };
    const completed = appendHistorySnapshot(inProgress, withCut);

    expect(completed.current.cuts[0]).toEqual(finalState.cuts[0]);
    expect(completed.past.at(-1)).toEqual(withCut);
    expect(undoHistory(completed).current).toEqual(withCut);
  });
});
