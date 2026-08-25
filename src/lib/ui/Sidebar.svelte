<script lang="ts">
  import {
    angleDifferenceDeg,
    centerOffset,
    cutAreaForCuts,
    cutSegmentThroughCircle,
    cutSegmentThroughPiece,
    currentDoseForCuts,
    distancePointToLine,
    perpendicularDistanceBetweenLines,
    polygonArea,
    remainingPolygon,
    segmentLength,
    sideRimDepths,
    cutHandle,
  } from "../calculator/geometry";
  import type { CalculatorState, Cut } from "../calculator/types";
  import { PARALLEL_TOLERANCE_DEG } from "../calculator/geometry";

  type MeasurementKind = "dose" | "area" | "length";

  interface Props {
    readonly state: CalculatorState;
    readonly radius: number;
    readonly onSelect: (index: number) => void;
    readonly onDelete: (index: number) => void;
    readonly onCommitMeasurement: (kind: MeasurementKind, value: number) => void;
  }

  let { state, radius, onSelect, onDelete, onCommitMeasurement }: Props = $props();

  let selected = $derived(state.cuts[state.selectedCut]);
  let hasSelected = $derived(Boolean(selected));
  let remainingArea = $derived(polygonArea(remainingPolygon(state.cuts, radius)));
  let selectedArea = $derived(
    selected ? cutAreaForCuts(state.cuts, state.selectedCut, radius) : remainingArea,
  );
  let selectedDose = $derived(
    selected
      ? (state.settings.fullDose * selectedArea) / (Math.PI * radius * radius)
      : currentDoseForCuts(state.cuts, radius, state.settings.fullDose),
  );
  let selectedLength = $derived(
    selected
      ? segmentLength(cutSegmentThroughPiece(selected, state.cuts.slice(0, state.selectedCut), radius))
      : 0,
  );

  const format = (value: number, digits: number): string =>
    Number.isFinite(value) ? value.toFixed(digits) : "—";

  const inputValue = (event: Event): number => {
    const input = event.currentTarget;
    return input instanceof HTMLInputElement ? Number(input.value) : Number.NaN;
  };

  const commit = (kind: MeasurementKind, event: Event): void => {
    const value = inputValue(event);
    if (Number.isFinite(value)) onCommitMeasurement(kind, value);
  };

  const commitOnEnter = (kind: MeasurementKind, event: KeyboardEvent): void => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commit(kind, event);
  };

  const spacingFromPrevious = (
    previous: Cut,
    selectedCut: Cut,
    angle: number,
    handle: ReturnType<typeof cutHandle>,
  ): number => {
    if (angle <= PARALLEL_TOLERANCE_DEG) {
      return perpendicularDistanceBetweenLines(previous, selectedCut);
    }
    if (handle.kind === "some") {
      return distancePointToLine(handle.value, previous);
    }
    return Number.NaN;
  };

  const reference = (): {
    readonly chord: string;
    readonly offset: string;
    readonly keptRim: string;
    readonly removedRim: string;
    readonly previousSpacing: string;
    readonly previousAngle: string;
  } => {
    if (!selected) {
      return {
        chord: "—",
        offset: "—",
        keptRim: "—",
        removedRim: "—",
        previousSpacing: "—",
        previousAngle: "—",
      };
    }

    const chord = segmentLength(cutSegmentThroughCircle(selected, radius));
    const rim = sideRimDepths(selected, radius);
    if (state.selectedCut === 0) {
      return {
        chord: `${format(chord, 3)} cm`,
        offset: `${format(centerOffset(selected), 3)} cm`,
        keptRim: `${format(rim.kept, 3)} cm`,
        removedRim: `${format(rim.removed, 3)} cm`,
        previousSpacing: "No previous cut",
        previousAngle: "—",
      };
    }

    const previous = state.cuts[state.selectedCut - 1];
    if (!previous) return { chord: "—", offset: "—", keptRim: "—", removedRim: "—", previousSpacing: "—", previousAngle: "—" };
    const angle = angleDifferenceDeg(selected, previous);
    const handle = cutHandle(selected, state.selectedCut, state.cuts, radius);
    const spacing = spacingFromPrevious(previous, selected, angle, handle);
    return {
      chord: `${format(chord, 3)} cm`,
      offset: `${format(centerOffset(selected), 3)} cm`,
      keptRim: `${format(rim.kept, 3)} cm`,
      removedRim: `${format(rim.removed, 3)} cm`,
      previousSpacing: `${format(spacing, 3)} cm${angle > PARALLEL_TOLERANCE_DEG ? "*" : ""}`,
      previousAngle: `${format(angle, 1)}°`,
    };
  };

  const refs = $derived(reference());
</script>

<aside class="grid gap-4">
  <section class="rounded-2xl bg-white p-5 shadow-[0_2px_6px_rgb(0_0_0_/0.06),0_16px_40px_rgb(0_0_0_/0.07)] ring-1 ring-stone-200">
    <div class="rounded-xl bg-stone-100 p-4">
      <div class="text-sm text-stone-500">{hasSelected ? `Area ${state.selectedCut + 1} dosage` : "Uncut remaining dosage"}</div>
      <div class="mt-1 text-3xl font-extrabold tracking-tight text-stone-900 tabular-nums">{format(selectedDose, 3)} mg</div>
    </div>

    <div class="mt-5 border-t border-stone-200 pt-5">
      <h2 class="text-base font-extrabold tracking-tight text-stone-900">Selected cut area</h2>
      <div class="mt-2 divide-y divide-stone-200">
        <label class="grid min-h-14 grid-cols-[minmax(0,1fr)_106px_34px] items-center gap-2 text-sm">
          <span class="font-semibold text-stone-600">Area dosage</span>
          <input
            class="min-h-10 w-full rounded-lg border border-stone-300 bg-white px-2 py-1 text-right font-bold tabular-nums outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-stone-900 focus:ring-4 focus:ring-stone-900/10 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
            type="number"
            min="0"
            step="0.001"
            value={hasSelected ? format(selectedDose, 3) : ""}
            disabled={!hasSelected}
            onkeydown={(event) => commitOnEnter("dose", event)}
            onchange={(event) => commit("dose", event)}
            aria-label="Selected area dosage in milligrams"
          />
          <span class="text-xs text-stone-500">mg</span>
        </label>
        <label class="grid min-h-14 grid-cols-[minmax(0,1fr)_106px_34px] items-center gap-2 text-sm">
          <span class="font-semibold text-stone-600">Area size</span>
          <input
            class="min-h-10 w-full rounded-lg border border-stone-300 bg-white px-2 py-1 text-right font-bold tabular-nums outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-stone-900 focus:ring-4 focus:ring-stone-900/10 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
            type="number"
            min="0"
            step="0.0001"
            value={hasSelected ? format(selectedArea, 4) : ""}
            disabled={!hasSelected}
            onkeydown={(event) => commitOnEnter("area", event)}
            onchange={(event) => commit("area", event)}
            aria-label="Selected area size in square centimetres"
          />
          <span class="text-xs text-stone-500">cm²</span>
        </label>
        <label class="grid min-h-14 grid-cols-[minmax(0,1fr)_106px_34px] items-center gap-2 text-sm">
          <span class="font-semibold text-stone-600">Selected cut length</span>
          <input
            class="min-h-10 w-full rounded-lg border border-stone-300 bg-white px-2 py-1 text-right font-bold tabular-nums outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-stone-900 focus:ring-4 focus:ring-stone-900/10 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
            type="number"
            min="0"
            step="0.001"
            value={hasSelected ? format(selectedLength, 3) : ""}
            disabled={!hasSelected}
            onkeydown={(event) => commitOnEnter("length", event)}
            onchange={(event) => commit("length", event)}
            aria-label="Selected cut length in centimetres"
          />
          <span class="text-xs text-stone-500">cm</span>
        </label>
      </div>
      <p class="mt-3 text-sm leading-6 text-stone-500 [text-wrap:pretty]">
        Select a colored area, edit any one value, then press Enter. The cut slides without changing its angle, and the other linked measurements update automatically.
      </p>
    </div>

    <div class="mt-5 border-t border-stone-200 pt-5">
      <h2 class="text-base font-extrabold tracking-tight text-stone-900">Selected cut reference</h2>
      <div class="mt-2 divide-y divide-stone-200 text-sm">
        <div class="flex min-h-10 items-center justify-between gap-3"><span class="text-stone-500">Full-circle chord length</span><strong class="text-right tabular-nums">{refs.chord}</strong></div>
        <div class="flex min-h-10 items-center justify-between gap-3"><span class="text-stone-500">Offset from circle center</span><strong class="text-right tabular-nums">{refs.offset}</strong></div>
        <div class="flex min-h-10 items-center justify-between gap-3"><span class="text-stone-500">Kept-side rim depth</span><strong class="text-right tabular-nums">{refs.keptRim}</strong></div>
        <div class="flex min-h-10 items-center justify-between gap-3"><span class="text-stone-500">Removed-side rim depth</span><strong class="text-right tabular-nums">{refs.removedRim}</strong></div>
        <div class="flex min-h-10 items-center justify-between gap-3"><span class="text-stone-500">Previous cut spacing</span><strong class="text-right tabular-nums">{refs.previousSpacing}</strong></div>
        <div class="flex min-h-10 items-center justify-between gap-3"><span class="text-stone-500">Angle vs previous cut</span><strong class="text-right tabular-nums">{refs.previousAngle}</strong></div>
      </div>
    </div>

    <div class="mt-5 border-t border-stone-200 pt-5">
      <h2 class="text-base font-extrabold tracking-tight text-stone-900">Patch</h2>
      <div class="mt-2 divide-y divide-stone-200 text-sm">
        <div class="flex min-h-10 items-center justify-between gap-3"><span class="text-stone-500">Patch total area</span><strong class="text-right tabular-nums">{format(Math.PI * radius * radius, 4)} cm²</strong></div>
        <div class="flex min-h-10 items-center justify-between gap-3"><span class="text-stone-500">Uncut remaining area</span><strong class="text-right tabular-nums">{format(remainingArea, 4)} cm²</strong></div>
      </div>
    </div>

    <div class="mt-5 border-t border-stone-200 pt-5">
      <h2 class="text-base font-extrabold tracking-tight text-stone-900">Cut areas</h2>
      {#if !state.cuts.length}
        <p class="mt-2 text-sm text-stone-500">No cuts yet.</p>
      {:else}
        <div class="mt-2 divide-y divide-stone-200">
          {#each state.cuts as cut, index (index)}
            <div class:rounded-xl={index === state.selectedCut} class:bg-stone-100={index === state.selectedCut} class="grid min-h-14 grid-cols-[12px_minmax(0,1fr)_auto_auto] items-center gap-2 py-2 text-sm">
              <span class="h-3 w-3 rounded-full" style={`background:${cut.color}`} aria-hidden="true"></span>
              <span class="font-semibold text-stone-800 tabular-nums">Area {index + 1} · {format(cutAreaForCuts(state.cuts, index, radius), 3)} cm² · cut {format(segmentLength(cutSegmentThroughPiece(cut, state.cuts.slice(0, index), radius)), 3)} cm</span>
              <button
                class="min-h-11 rounded-lg px-3 py-2 text-xs font-bold text-stone-900 ring-1 ring-stone-300 transition-[background-color,transform] duration-150 ease-out hover:bg-white active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
                type="button"
                aria-pressed={index === state.selectedCut}
                onclick={() => onSelect(index)}
              >
                Select
              </button>
              <button
                class="min-h-11 rounded-lg px-3 py-2 text-xs font-bold text-stone-900 ring-1 ring-stone-300 transition-[background-color,transform] duration-150 ease-out hover:bg-white active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
                type="button"
                onclick={() => onDelete(index)}
              >
                Delete
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <p class="mt-5 rounded-xl bg-stone-100 p-3 text-sm leading-6 text-stone-500 [text-wrap:pretty]">
      Right-click anywhere inside this calculator to undo the most recent edit.
    </p>

    <div class="mt-4 rounded-xl border-l-4 border-amber-600 bg-amber-50 p-3 text-sm leading-6 text-amber-950 [text-wrap:pretty]">
      Nicotine note: this page performs geometry and an area-proportional dosage calculation only. It does not determine a medically appropriate nicotine dose, and some nicotine patches are labeled not to be cut.
    </div>
  </section>
</aside>
