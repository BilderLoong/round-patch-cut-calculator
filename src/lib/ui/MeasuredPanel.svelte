<script lang="ts">
  import type {
    CandidateResult,
    DirectionSetting,
    MeasuredInputs,
    StartChoice,
  } from "../calculator/types";

  interface Props {
    readonly hasCuts: boolean;
    readonly inputs: MeasuredInputs;
    readonly preview: CandidateResult;
    readonly onInputsChange: (changes: Partial<MeasuredInputs>) => void;
    readonly onAdd: () => void;
    readonly onRound: () => void;
  }

  let { hasCuts, inputs, preview, onInputsChange, onAdd, onRound }: Props = $props();

  const valueFromEvent = (event: Event): string => {
    const input = event.currentTarget;
    return input instanceof HTMLInputElement ? input.value : "";
  };

  const startFromEvent = (event: Event): void => {
    const select = event.currentTarget;
    if (!(select instanceof HTMLSelectElement) || select.value === "first") return;
    if (select.value === "a" || select.value === "b") {
      const start: StartChoice = select.value;
      onInputsChange({ start });
    }
  };

  const directionFromEvent = (event: Event): void => {
    const select = event.currentTarget;
    if (!(select instanceof HTMLSelectElement)) return;
    if (select.value === "auto" || select.value === "clockwise" || select.value === "counterclockwise") {
      const direction: DirectionSetting = select.value;
      onInputsChange({ direction });
    }
  };

  const updateLength = (event: Event): void => {
    onInputsChange({ length: valueFromEvent(event), source: "length" });
  };

  const updateDose = (event: Event): void => {
    onInputsChange({ dose: valueFromEvent(event), source: "dose" });
  };
</script>

<section class="mt-4 rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200">
  <div class="flex flex-wrap items-baseline justify-between gap-3">
    <h2 class="text-base font-extrabold tracking-tight text-stone-900">Measured endpoint cut</h2>
    <span class="text-xs font-bold text-stone-500">Angle calculated automatically</span>
  </div>
  <p class="mt-1 text-sm leading-6 text-stone-600 [text-wrap:pretty]">
    For Cut 1, enter either its chord length or dosage for the top area. Later cuts start from End A or End B of the previous cut, and the calculator chooses a reachable direction.
  </p>

  <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <label class="grid gap-2 text-sm font-semibold text-stone-700">
      <span>Cut start</span>
      <select
        class="min-h-10 rounded-xl border border-stone-300 bg-white px-3 py-2 font-[inherit] outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-stone-900 focus:ring-4 focus:ring-stone-900/10 disabled:cursor-not-allowed disabled:opacity-55"
        value={hasCuts ? inputs.start : "first"}
        onchange={startFromEvent}
        disabled={!hasCuts}
        aria-label="Measured cut start"
      >
        <option value="first">First cut (horizontal)</option>
        <option value="a">End A</option>
        <option value="b">End B</option>
      </select>
    </label>

    <label class="grid gap-2 text-sm font-semibold text-stone-700">
      <span>New cut length (cm)</span>
      <input
        class="min-h-10 rounded-xl border border-stone-300 bg-white px-3 py-2 font-[inherit] tabular-nums outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-stone-900 focus:ring-4 focus:ring-stone-900/10"
        type="number"
        min="0.001"
        step="0.001"
        placeholder="Example: 3.000"
        value={inputs.length}
        oninput={updateLength}
        aria-label="New measured cut length in centimetres"
      />
    </label>

    <label class="grid gap-2 text-sm font-semibold text-stone-700">
      <span>New area dosage (mg)</span>
      <input
        class="min-h-10 rounded-xl border border-stone-300 bg-white px-3 py-2 font-[inherit] tabular-nums outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-stone-900 focus:ring-4 focus:ring-stone-900/10"
        type="number"
        min="0.001"
        step="0.001"
        placeholder="Example: 1.500"
        value={inputs.dose}
        oninput={updateDose}
        aria-label="New area dosage in milligrams"
      />
    </label>

    <label class="grid gap-2 text-sm font-semibold text-stone-700">
      <span>Direction around circle</span>
      <select
        class="min-h-10 rounded-xl border border-stone-300 bg-white px-3 py-2 font-[inherit] outline-none transition-[border-color,box-shadow] duration-150 ease-out focus:border-stone-900 focus:ring-4 focus:ring-stone-900/10 disabled:cursor-not-allowed disabled:opacity-55"
        value={inputs.direction}
        onchange={directionFromEvent}
        disabled={!hasCuts}
        aria-label="Direction around circle"
      >
        <option value="auto">Auto (recommended)</option>
        <option value="clockwise">Clockwise</option>
        <option value="counterclockwise">Counterclockwise</option>
      </select>
    </label>
  </div>

  <div class="mt-3 flex flex-wrap items-center gap-2">
    <button
      class="min-h-11 rounded-xl bg-stone-900 px-4 py-2 text-sm font-bold text-white shadow-[0_2px_6px_rgb(0_0_0_/0.12),0_8px_20px_rgb(0_0_0_/0.08)] transition-transform duration-150 ease-out hover:bg-stone-700 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
      type="button"
      onclick={onAdd}
      disabled={!preview.ok}
    >
      Add measured cut
    </button>
    <button
      class="min-h-11 rounded-xl bg-white px-4 py-2 text-sm font-bold text-stone-900 shadow-[0_1px_3px_rgb(0_0_0_/0.08),0_4px_12px_rgb(0_0_0_/0.05)] ring-1 ring-stone-300 transition-[background-color,transform] duration-150 ease-out hover:bg-stone-100 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
      type="button"
      onclick={onRound}
      disabled={!Number.isFinite(Number(inputs.length)) || Number(inputs.length) <= 0}
    >
      Round length to 0.1 cm
    </button>
    <span class="text-sm leading-5 text-stone-600" class:font-semibold={preview.ok}>
      {preview.message}
    </span>
  </div>
</section>
