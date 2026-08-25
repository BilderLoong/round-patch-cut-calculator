import { describe, expect, it } from "bun:test";
import {
  addCut,
  appendHistorySnapshot,
  commitHistory,
  initialCalculatorState,
  initialHistoryState,
  replaceCut,
  undoHistory,
} from "./state";
import { buildFirstMeasuredCutCandidate, translateCut } from "./geometry";

const radius = 6.18039 / 2;
const fullDose = 21;

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
