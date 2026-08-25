<script lang="ts">
  import { onMount } from "svelte";
  import {
    adjustCutToArea,
    adjustCutToDose,
    adjustCutToLength,
    measuredCutPreview,
  } from "./lib/calculator/geometry";
  import {
    addCut,
    appendHistorySnapshot,
    commitHistory,
    deleteCut,
    initialHistoryState,
    replaceCut,
    resetCalculator,
    setSelectedCut,
    undoHistory,
    updateSettings as applySettings,
    updateView,
  } from "./lib/calculator/state";
  import type {
    CalculatorSettings,
    CalculatorState,
    GeometryCut,
    HistoryState,
    MeasurementAdjustmentResult,
    MeasurementSource,
    MeasuredInputs,
    ViewState,
  } from "./lib/calculator/types";
  import { isFormEditingTag } from "./lib/ui/keyboard";
  import Canvas from "./lib/ui/Canvas.svelte";
  import Controls from "./lib/ui/Controls.svelte";
  import MeasuredPanel from "./lib/ui/MeasuredPanel.svelte";
  import Sidebar from "./lib/ui/Sidebar.svelte";

  type MeasurementKind = "dose" | "area" | "length";

  let history = $state<HistoryState>(initialHistoryState());
  let measured = $state<MeasuredInputs>({
    start: "a",
    length: "",
    dose: "",
    direction: "auto",
    source: "length",
  });
  let status = $state("Ready:");
  let instruction = $state(" click empty space twice to draw a cut. Drag a colored handle to move its cut. Hold Space or Shift and drag to pan; use the wheel or trackpad to zoom.");
  let spaceHeld = $state(false);
  let editSnapshot = $state<CalculatorState | undefined>(undefined);
  let canvasInteractionPending = $state(false);
  let interactionResetToken = $state(0);

  let calculator = $derived(history.current);
  let radius = $derived(calculator.settings.diameter / 2);
  let preview = $derived(measuredCutPreview(calculator.cuts, radius, calculator.settings.fullDose, measured));

  const patchStatus = (nextStatus: string, nextInstruction: string): void => {
    status = nextStatus;
    instruction = nextInstruction;
  };

  const updateCurrent = (next: CalculatorState): void => {
    history = { ...history, current: next };
  };

  const commitCurrent = (next: CalculatorState): void => {
    history = commitHistory(history, next);
  };

  const updateSettings = (changes: Partial<CalculatorSettings>): void => {
    commitCurrent(applySettings(history.current, changes));
  };

  const updateMeasuredInputs = (changes: Partial<MeasuredInputs>): void => {
    const next: MeasuredInputs = { ...measured, ...changes };
    const source: MeasurementSource = changes.source ?? next.source;
    const nextWithSource = { ...next, source };
    const nextPreview = measuredCutPreview(calculator.cuts, radius, calculator.settings.fullDose, nextWithSource);
    if (source === "length" && changes.length !== undefined && nextPreview.ok) {
      measured = { ...nextWithSource, dose: nextPreview.dosage.toFixed(3) };
      return;
    }
    if (source === "dose" && changes.dose !== undefined && nextPreview.ok) {
      measured = { ...nextWithSource, length: nextPreview.length.toFixed(3) };
      return;
    }
    measured = nextWithSource;
  };

  const setCanvasInteractionPending = (pending: boolean): void => {
    canvasInteractionPending = pending;
  };

  const requestCanvasInteractionReset = (): void => {
    interactionResetToken += 1;
    canvasInteractionPending = false;
    editSnapshot = undefined;
  };

  const addMeasuredCut = (): void => {
    const measuredCut = preview;
    if (!measuredCut.ok) {
      patchStatus("Measured cut not added:", ` ${measuredCut.message}`);
      return;
    }
    const first = calculator.cuts.length === 0;
    const cutNumber = calculator.cuts.length + 1;
    commitCurrent(addCut(calculator, measuredCut.cut));
    measured = {
      ...measured,
      start: first ? "a" : measured.start,
      length: "",
      dose: "",
      source: "length",
    };
    patchStatus(
      first ? "Cut 1 added from a measured value:" : `Cut ${cutNumber} added from a measured endpoint:`,
      first
        ? ` the ${measuredCut.length.toFixed(3)} cm horizontal cut removes the top area. The next measured cut can start from End A or End B.`
        : ` the cut length is ${measuredCut.length.toFixed(3)} cm. ${measuredCut.direction} direction and angle were calculated automatically.`,
    );
  };

  const roundMeasuredLength = (): void => {
    const length = Number(measured.length);
    if (!Number.isFinite(length) || length <= 0) return;
    const rounded = (Math.round(length * 10) / 10).toFixed(1);
    updateMeasuredInputs({ length: rounded, source: "length" });
  };

  const fitPatch = (): void => {
    updateCurrent(updateView(calculator, { zoom: 1, panX: 0, panY: 0 }));
  };

  const undo = (): void => {
    if (canvasInteractionPending) {
      requestCanvasInteractionReset();
      patchStatus("Cancelled:", " the unfinished canvas interaction was cancelled. History was not changed.");
      return;
    }
    const next = undoHistory(history);
    if (next === history) {
      patchStatus("Nothing to undo:", " there is no earlier edit in the history.");
      return;
    }
    history = next;
    patchStatus("Undone:", " restored the previous edit state.");
  };

  const reset = (): void => {
    requestCanvasInteractionReset();
    commitCurrent(resetCalculator());
    measured = { start: "a", length: "", dose: "", direction: "auto", source: "length" };
    patchStatus("Ready:", " click empty space twice to draw a cut. Drag a colored handle to move its cut. Hold Space or Shift and drag to pan; use the wheel or trackpad to zoom.");
  };

  const selectCut = (index: number): void => {
    updateCurrent(setSelectedCut(calculator, index));
    patchStatus(`Cut ${index + 1} selected:`, " drag its colored circular handle to move it, or click empty space to start a new cut.");
  };

  const addManualCut = (cut: GeometryCut): void => {
    const cutNumber = calculator.cuts.length + 1;
    commitCurrent(addCut(calculator, cut));
    patchStatus(`Cut ${cutNumber} added:`, " its colored handle is already active — drag it whenever you want to adjust the cut.");
  };

  const deleteSelectedCut = (index: number): void => {
    commitCurrent(deleteCut(calculator, index));
    patchStatus("Cut deleted:", " select another colored area or click empty space to draw another cut.");
  };

  const beginEdit = (): void => {
    editSnapshot = calculator;
  };

  const updateEditingCut = (index: number, cut: GeometryCut): void => {
    updateCurrent(replaceCut(calculator, index, cut));
  };

  const endEdit = (): void => {
    if (editSnapshot) {
      history = appendHistorySnapshot(history, editSnapshot);
      editSnapshot = undefined;
    }
  };

  const cancelEdit = (): void => {
    editSnapshot = undefined;
  };

  const changeView = (view: ViewState): void => {
    updateCurrent(updateView(calculator, view));
  };

  const commitMeasurement = (kind: MeasurementKind, value: number): void => {
    const index = calculator.selectedCut;
    if (index < 0) return;
    let result: MeasurementAdjustmentResult;
    if (kind === "dose") {
      result = adjustCutToDose(calculator.cuts, index, value, radius, calculator.settings.fullDose);
    } else if (kind === "area") {
      result = adjustCutToArea(calculator.cuts, index, value, radius);
    } else {
      result = adjustCutToLength(calculator.cuts, index, value, radius);
    }
    if (!result.ok) {
      patchStatus("Measurement not changed:", ` ${result.message}`);
      return;
    }
    commitCurrent(replaceCut(calculator, index, result.cut));
    patchStatus(`Cut ${index + 1} adjusted:`, " its linked measurements were updated.");
  };

  const isFormEditing = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement && isFormEditingTag(target.tagName, target.isContentEditable);

  onMount(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const editing = isFormEditing(event.target);
      if (event.code === "Space" && !editing) {
        event.preventDefault();
        spaceHeld = true;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && !editing && calculator.selectedCut >= 0) {
        event.preventDefault();
        deleteSelectedCut(calculator.selectedCut);
      }
    };
    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.code === "Space") spaceHeld = false;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  });

  const handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    undo();
  };
</script>

<svelte:head>
  <title>Round Patch Cut Calculator</title>
  <meta name="description" content="Plan straight cuts on a round patch with linked area, dosage, and length measurements." />
</svelte:head>

<div class="min-h-screen bg-stone-100 px-3 py-4 text-stone-900 antialiased focus:outline-none sm:px-6 sm:py-6" role="application" oncontextmenu={handleContextMenu}>
  <div class="mx-auto w-full max-w-[1180px]">
    <header class="mb-5">
      <h1 class="text-balance text-2xl font-extrabold tracking-tight sm:text-3xl">Round Patch Cut Calculator</h1>
      <p class="mt-2 max-w-3xl text-pretty text-sm leading-6 text-stone-600 sm:text-base">
        Draw new cuts anywhere on empty canvas space. Each finished cut owns one colored area and has a handle that you can drag at any time.
      </p>
    </header>

    <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(330px,.55fr)]">
      <main class="rounded-2xl bg-white p-4 shadow-[0_2px_6px_rgb(0_0_0_/0.06),0_16px_40px_rgb(0_0_0_/0.07)] ring-1 ring-stone-200 sm:p-5">
        <Controls settings={calculator.settings} onSettingsChange={updateSettings} onFit={fitPatch} onUndo={undo} onReset={reset} />
        <MeasuredPanel hasCuts={calculator.cuts.length > 0} inputs={measured} preview={preview} onInputsChange={updateMeasuredInputs} onAdd={addMeasuredCut} onRound={roundMeasuredLength} />
        <div class="mt-4">
          <Canvas
            calculator={calculator}
            preview={preview}
            measuredStart={measured.start}
            spaceHeld={spaceHeld}
            interactionResetToken={interactionResetToken}
            onAddCut={addManualCut}
            onSelectCut={selectCut}
            onUpdateCut={updateEditingCut}
            onBeginEdit={beginEdit}
            onEndEdit={endEdit}
            onCancelEdit={cancelEdit}
            onInteractionStateChange={setCanvasInteractionPending}
            onViewChange={changeView}
            onMessage={patchStatus}
          />
        </div>
        <div class="mt-3 min-h-11 rounded-xl bg-stone-100 p-3 text-sm leading-6 text-stone-600 [text-wrap:pretty]" role="status" aria-live="polite" aria-atomic="true">
          <span class="font-extrabold text-stone-900">{status}</span>{instruction}
        </div>
      </main>

      <Sidebar state={calculator} radius={radius} onSelect={selectCut} onDelete={deleteSelectedCut} onCommitMeasurement={commitMeasurement} />
    </div>
  </div>
</div>
