export interface Point {
  readonly x: number;
  readonly y: number;
}

export type RemoveSign = -1 | 1;

export interface GeometryCut {
  readonly a: Point;
  readonly b: Point;
  readonly removeSign: RemoveSign;
}

export interface Cut extends GeometryCut {
  readonly color: string;
}

export interface Segment {
  readonly a: Point;
  readonly b: Point;
}

export type Direction = "clockwise" | "counterclockwise";
export type StartChoice = "a" | "b";
export type FirstCutPosition = "near-top" | "near-bottom";
export type DirectionSetting = "auto" | Direction;
export type MeasurementSource = "length" | "dose";

export interface CalculatorSettings {
  readonly diameter: number;
  readonly patchArea: number;
  readonly fullDose: number;
  readonly snapEnabled: boolean;
}

export interface ViewState {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export interface CalculatorState {
  readonly cuts: readonly Cut[];
  readonly nextColor: number;
  readonly selectedCut: number;
  readonly settings: CalculatorSettings;
  readonly view: ViewState;
}

export interface HistoryState {
  readonly current: CalculatorState;
  readonly past: readonly CalculatorState[];
}

export interface MeasuredInputs {
  readonly start: StartChoice;
  readonly firstPosition: FirstCutPosition;
  readonly length: string;
  readonly dose: string;
  readonly direction: DirectionSetting;
  readonly source: MeasurementSource;
}

export interface CandidateSuccess {
  readonly ok: true;
  readonly cut: GeometryCut;
  readonly direction: Direction | "horizontal";
  readonly length: number;
  readonly lineAngle: number;
  readonly removedArea: number;
  readonly dosage: number;
  readonly message: string;
}

export interface CandidateFailure {
  readonly ok: false;
  readonly message: string;
}

export type CandidateResult = CandidateSuccess | CandidateFailure;

export type Option<T> =
  | { readonly kind: "some"; readonly value: T }
  | { readonly kind: "none" };

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export interface MeasurementAdjustment {
  readonly ok: true;
  readonly cut: GeometryCut;
}

export interface MeasurementAdjustmentFailure {
  readonly ok: false;
  readonly message: string;
}

export type MeasurementAdjustmentResult =
  | MeasurementAdjustment
  | MeasurementAdjustmentFailure;

export const some = <T>(value: T): Option<T> => ({ kind: "some", value });

export const none = <T>(): Option<T> => ({ kind: "none" });
