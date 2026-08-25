import type {
  CalculatorSettings,
  CalculatorState,
  Cut,
  GeometryCut,
  HistoryState,
  ViewState,
} from "./types";

export const COLORS: readonly string[] = [
  "#e74c3c",
  "#3498db",
  "#27ae60",
  "#9b59b6",
  "#f39c12",
  "#16a085",
  "#d35400",
  "#2c3e50",
];

export const HISTORY_LIMIT = 100;

export const defaultSettings = (): CalculatorSettings => ({
  diameter: 6.18039,
  patchArea: 30,
  fullDose: 21,
  snapEnabled: true,
});

export const defaultView = (): ViewState => ({
  zoom: 1,
  panX: 0,
  panY: 0,
});

export const initialCalculatorState = (): CalculatorState => ({
  cuts: [],
  nextColor: 0,
  selectedCut: -1,
  settings: defaultSettings(),
  view: defaultView(),
});

export const initialHistoryState = (): HistoryState => ({
  current: initialCalculatorState(),
  past: [],
});

export const commitHistory = (
  history: HistoryState,
  next: CalculatorState,
): HistoryState => ({
  current: next,
  past: [...history.past, history.current].slice(-HISTORY_LIMIT),
});

export const appendHistorySnapshot = (
  history: HistoryState,
  snapshot: CalculatorState,
): HistoryState => ({
  current: history.current,
  past: [...history.past, snapshot].slice(-HISTORY_LIMIT),
});

export const undoHistory = (history: HistoryState): HistoryState => {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    current: previous,
    past: history.past.slice(0, -1),
  };
};

export const updateSettings = (
  state: CalculatorState,
  changes: Partial<CalculatorSettings>,
): CalculatorState => ({
  ...state,
  settings: { ...state.settings, ...changes },
});

export const updateView = (
  state: CalculatorState,
  view: ViewState,
): CalculatorState => ({ ...state, view });

export const setSelectedCut = (
  state: CalculatorState,
  selectedCut: number,
): CalculatorState => ({
  ...state,
  selectedCut:
    selectedCut >= 0 && selectedCut < state.cuts.length ? selectedCut : -1,
});

export const makeOwnedCut = (
  cut: GeometryCut,
  colorIndex: number,
): Cut => ({
  ...cut,
  color: COLORS[colorIndex % COLORS.length],
});

export const addCut = (
  state: CalculatorState,
  cut: GeometryCut,
): CalculatorState => ({
  ...state,
  cuts: [...state.cuts, makeOwnedCut(cut, state.nextColor)],
  nextColor: state.nextColor + 1,
  selectedCut: state.cuts.length,
});

export const replaceCut = (
  state: CalculatorState,
  index: number,
  cut: GeometryCut,
): CalculatorState => {
  const selected = state.cuts[index];
  if (!selected) return state;
  return {
    ...state,
    cuts: state.cuts.map((current, currentIndex) =>
      currentIndex === index ? { ...cut, color: selected.color } : current,
    ),
    selectedCut: index,
  };
};

export const deleteCut = (
  state: CalculatorState,
  index: number,
): CalculatorState => {
  if (!state.cuts[index]) return state;
  const cuts = state.cuts.filter((_, currentIndex) => currentIndex !== index);
  let selectedCut = state.selectedCut;
  if (state.selectedCut === index) {
    selectedCut = -1;
  } else if (state.selectedCut > index) {
    selectedCut = state.selectedCut - 1;
  }
  return { ...state, cuts, selectedCut };
};

export const resetCalculator = (): CalculatorState => initialCalculatorState();
