<script lang="ts">
  import type { CalculatorSettings } from "../calculator/types";

  interface Props {
    readonly settings: CalculatorSettings;
    readonly onSettingsChange: (changes: Partial<CalculatorSettings>) => void;
    readonly onFit: () => void;
    readonly onUndo: () => void;
    readonly onReset: () => void;
  }

  let { settings, onSettingsChange, onFit, onUndo, onReset }: Props = $props();

  let diameterDraft = $state("");
  let patchAreaDraft = $state("");
  let fullDoseDraft = $state("");

  $effect(() => {
    diameterDraft = String(settings.diameter);
    patchAreaDraft = String(settings.patchArea);
    fullDoseDraft = String(settings.fullDose);
  });

  const valueFromEvent = (event: Event): string => {
    const input = event.currentTarget;
    return input instanceof HTMLInputElement ? input.value : "";
  };

  const updateDiameterDraft = (event: Event): void => {
    diameterDraft = valueFromEvent(event);
  };

  const commitDiameter = (event: Event): void => {
    const diameter = Number(valueFromEvent(event));
    if (!Number.isFinite(diameter) || diameter <= 0) {
      diameterDraft = String(settings.diameter);
      return;
    }
    onSettingsChange({
      diameter,
      patchArea: Math.PI * (diameter / 2) ** 2,
    });
  };

  const updatePatchAreaDraft = (event: Event): void => {
    patchAreaDraft = valueFromEvent(event);
  };

  const commitPatchArea = (event: Event): void => {
    const patchArea = Number(valueFromEvent(event));
    if (!Number.isFinite(patchArea) || patchArea <= 0) {
      patchAreaDraft = String(settings.patchArea);
      return;
    }
    onSettingsChange({
      patchArea,
      diameter: 2 * Math.sqrt(patchArea / Math.PI),
    });
  };

  const updateFullDoseDraft = (event: Event): void => {
    fullDoseDraft = valueFromEvent(event);
  };

  const commitFullDose = (event: Event): void => {
    const fullDose = Number(valueFromEvent(event));
    if (!Number.isFinite(fullDose) || fullDose <= 0) {
      fullDoseDraft = String(settings.fullDose);
      return;
    }
    onSettingsChange({ fullDose });
  };

  const updateSnap = (event: Event): void => {
    const input = event.currentTarget;
    if (input instanceof HTMLInputElement) onSettingsChange({ snapEnabled: input.checked });
  };
</script>

<div class="grid gap-3 @min-[620px]:grid-cols-3">
  <label class="grid gap-2 text-sm font-semibold text-stone-700">
    <span>Patch diameter (cm)</span>
    <input
      class="min-h-10 rounded-xl border border-stone-300 bg-white px-3 py-2 font-[inherit] tabular-nums outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-stone-900 focus:ring-4 focus:ring-stone-900/10"
      type="number"
      min="0.1"
      step="0.01"
      value={diameterDraft}
      oninput={updateDiameterDraft}
      onchange={commitDiameter}
      aria-label="Patch diameter in centimetres"
    />
  </label>

  <label class="grid gap-2 text-sm font-semibold text-stone-700">
    <span>Patch total area (cm²)</span>
    <input
      class="min-h-10 rounded-xl border border-stone-300 bg-white px-3 py-2 font-[inherit] tabular-nums outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-stone-900 focus:ring-4 focus:ring-stone-900/10"
      type="number"
      min="0.01"
      step="0.01"
      value={patchAreaDraft}
      oninput={updatePatchAreaDraft}
      onchange={commitPatchArea}
      aria-label="Patch total area in square centimetres"
    />
  </label>

  <label class="grid gap-2 text-sm font-semibold text-stone-700">
    <span>Full-patch labeled dosage (mg)</span>
    <input
      class="min-h-10 rounded-xl border border-stone-300 bg-white px-3 py-2 font-[inherit] tabular-nums outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-stone-900 focus:ring-4 focus:ring-stone-900/10"
      type="number"
      min="0.001"
      step="0.1"
      value={fullDoseDraft}
      oninput={updateFullDoseDraft}
      onchange={commitFullDose}
      aria-label="Full patch labeled dosage in milligrams"
    />
  </label>
</div>

<div class="mt-3 flex flex-wrap gap-2">
  <button
    class="min-h-11 rounded-xl bg-stone-900 px-4 py-2 text-sm font-bold text-white shadow-[0_2px_6px_rgb(0_0_0_/0.12),0_8px_20px_rgb(0_0_0_/0.08)] transition-transform duration-150 ease-out hover:bg-stone-700 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
    type="button"
    onclick={onFit}
  >
    Fit patch
  </button>
  <button
    class="min-h-11 rounded-xl bg-white px-4 py-2 text-sm font-bold text-stone-900 shadow-[0_1px_3px_rgb(0_0_0_/0.08),0_4px_12px_rgb(0_0_0_/0.05)] ring-1 ring-stone-300 transition-[background-color,transform] duration-150 ease-out hover:bg-stone-100 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
    type="button"
    onclick={onUndo}
  >
    Undo
  </button>
  <button
    class="min-h-11 rounded-xl bg-white px-4 py-2 text-sm font-bold text-stone-900 shadow-[0_1px_3px_rgb(0_0_0_/0.08),0_4px_12px_rgb(0_0_0_/0.05)] ring-1 ring-stone-300 transition-[background-color,transform] duration-150 ease-out hover:bg-stone-100 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
    type="button"
    onclick={onReset}
  >
    Reset
  </button>
</div>

<label class="mt-3 flex min-h-10 items-center gap-3 text-sm text-stone-600">
  <input
    class="h-5 w-5 accent-stone-900"
    type="checkbox"
    checked={settings.snapEnabled}
    onchange={updateSnap}
  />
  <span>Magnetic horizontal / vertical snapping</span>
</label>
