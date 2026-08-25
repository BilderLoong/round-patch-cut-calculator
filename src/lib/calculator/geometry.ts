import type {
  CandidateResult,
  CandidateSuccess,
  Cut,
  Direction,
  DirectionSetting,
  GeometryCut,
  MeasurementAdjustmentResult,
  MeasuredInputs,
  Option,
  Point,
  Segment,
  StartChoice,
} from "./types";
import { none, some } from "./types";

export const CIRCLE_SEGMENTS = 2048;
export const PARALLEL_TOLERANCE_DEG = 1;
const MINIMUM_AREA_RATIO = 1e-6;

const closeEnough = (a: number, b: number, tolerance: number): boolean =>
  Math.abs(a - b) <= tolerance;

export const circleArea = (radius: number): number => Math.PI * radius * radius;

export const circlePolygon = (
  radius: number,
  segments: number = CIRCLE_SEGMENTS,
): readonly Point[] =>
  Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });

export const cross = (a: Point, b: Point, point: Point): number =>
  (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);

export const insideHalfPlane = (
  point: Point,
  cut: GeometryCut,
): boolean => cross(cut.a, cut.b, point) * cut.removeSign <= 1e-9;

export const polygonArea = (polygon: readonly Point[]): number => {
  if (polygon.length < 3) return 0;

  const signedArea = polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);

  return Math.abs(signedArea) / 2;
};

const segmentLineIntersection = (
  start: Point,
  end: Point,
  cut: GeometryCut,
): Point => {
  const startCross = cross(cut.a, cut.b, start);
  const endCross = cross(cut.a, cut.b, end);
  const denominator = startCross - endCross;

  if (Math.abs(denominator) < 1e-12) return { ...start };

  const ratio = startCross / denominator;
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
  };
};

export const clipPolygon = (
  polygon: readonly Point[],
  cut: GeometryCut,
): readonly Point[] => {
  if (!polygon.length) return [];

  return polygon.reduce<readonly Point[]>((output, start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    const startInside = insideHalfPlane(start, cut);
    const endInside = insideHalfPlane(end, cut);

    if (startInside && endInside) return [...output, end];
    if (startInside && !endInside) {
      return [...output, segmentLineIntersection(start, end, cut)];
    }
    if (!startInside && endInside) {
      return [...output, segmentLineIntersection(start, end, cut), end];
    }
    return output;
  }, []);
};

export const remainingPolygonForCuts = (
  cuts: readonly GeometryCut[],
  radius: number,
  count: number = cuts.length,
): readonly Point[] =>
  cuts.slice(0, count).reduce<readonly Point[]>(
    (piece, cut) => (piece.length ? clipPolygon(piece, cut) : piece),
    circlePolygon(radius),
  );

export const remainingPolygon = (
  cuts: readonly GeometryCut[],
  radius: number,
): readonly Point[] => remainingPolygonForCuts(cuts, radius);

export const cutAreaPolygonForCuts = (
  cuts: readonly GeometryCut[],
  index: number,
  radius: number,
): readonly Point[] => {
  const cut = cuts[index];
  if (!cut) return [];

  const pieceBeforeCut = remainingPolygonForCuts(cuts, radius, index);
  return clipPolygon(pieceBeforeCut, {
    ...cut,
    removeSign: cut.removeSign === 1 ? -1 : 1,
  });
};

export const cutAreaForCuts = (
  cuts: readonly GeometryCut[],
  index: number,
  radius: number,
): number => polygonArea(cutAreaPolygonForCuts(cuts, index, radius));

export const cutDoseForCuts = (
  cuts: readonly GeometryCut[],
  index: number,
  radius: number,
  fullDose: number,
): number => {
  const fullArea = circleArea(radius);
  if (!(fullArea > 0)) return 0;
  return (fullDose * cutAreaForCuts(cuts, index, radius)) / fullArea;
};

export const currentDoseForCuts = (
  cuts: readonly GeometryCut[],
  radius: number,
  fullDose: number,
): number => {
  const fullArea = circleArea(radius);
  if (!(fullArea > 0)) return 0;
  return (fullDose * polygonArea(remainingPolygon(cuts, radius))) / fullArea;
};

export const pointInPolygon = (
  point: Point,
  polygon: readonly Point[],
): boolean => {
  if (polygon.length < 3) return false;

  return polygon.reduce(
    (inside, vertex, index) => {
      const previous = polygon[(index + polygon.length - 1) % polygon.length];
      const crossesRay =
        (vertex.y > point.y) !== (previous.y > point.y) &&
        point.x <
          ((previous.x - vertex.x) * (point.y - vertex.y)) /
            (previous.y - vertex.y) +
            vertex.x;
      return crossesRay ? !inside : inside;
    },
    false,
  );
};

export const findAreaIndex = (
  cuts: readonly GeometryCut[],
  point: Point,
  radius: number,
): number => {
  const indexes = cuts.map((_, index) => index).toReversed();
  const found = indexes.find((index) =>
    pointInPolygon(point, cutAreaPolygonForCuts(cuts, index, radius)),
  );
  return found ?? -1;
};

interface LineIntersection extends Point {
  readonly t: number;
}

export const linePolygonIntersections = (
  start: Point,
  end: Point,
  polygon: readonly Point[],
): readonly Point[] => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx * dx + dy * dy < 1e-12) return [];

  const hits = polygon.reduce<readonly LineIntersection[]>(
    (output, point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      const edgeX = next.x - point.x;
      const edgeY = next.y - point.y;
      const denominator = dx * edgeY - dy * edgeX;

      if (Math.abs(denominator) < 1e-12) return output;

      const pointX = point.x - start.x;
      const pointY = point.y - start.y;
      const t = (pointX * edgeY - pointY * edgeX) / denominator;
      const u = (pointX * dy - pointY * dx) / denominator;

      if (u < -1e-9 || u > 1 + 1e-9) return output;

      const hit = {
        x: start.x + t * dx,
        y: start.y + t * dy,
        t,
      };

      return output.some((existing) =>
        Math.hypot(existing.x - hit.x, existing.y - hit.y) < 1e-7,
      )
        ? output
        : [...output, hit];
    },
    [],
  );

  return hits.toSorted((a, b) => a.t - b.t);
};

export const lineCircleIntersections = (
  start: Point,
  end: Point,
  radius: number,
): readonly Point[] =>
  linePolygonIntersections(start, end, circlePolygon(radius));

export const cutSegmentThroughPiece = (
  cut: GeometryCut,
  cutsBefore: readonly GeometryCut[],
  radius: number,
): Option<Segment> => {
  const before = remainingPolygon(cutsBefore, radius);
  const hits = linePolygonIntersections(cut.a, cut.b, before);
  const first = hits.at(0);
  const last = hits.at(-1);

  return first && last && hits.length >= 2
    ? some({ a: first, b: last })
    : none();
};

export const cutSegmentThroughCircle = (
  cut: GeometryCut,
  radius: number,
): Option<Segment> => {
  const hits = lineCircleIntersections(cut.a, cut.b, radius);
  const first = hits.at(0);
  const last = hits.at(-1);

  return first && last && hits.length >= 2
    ? some({ a: first, b: last })
    : none();
};

export const segmentLength = (segment: Option<Segment>): number =>
  segment.kind === "some"
    ? Math.hypot(segment.value.b.x - segment.value.a.x, segment.value.b.y - segment.value.a.y)
    : 0;

export const cutHandle = (
  cut: GeometryCut,
  index: number,
  cuts: readonly GeometryCut[],
  radius: number,
): Option<Point> => {
  const segment = cutSegmentThroughPiece(cut, cuts.slice(0, index), radius);
  const circleSegment =
    segment.kind === "some" ? segment : cutSegmentThroughCircle(cut, radius);
  if (circleSegment.kind === "none") return none();

  return some({
    x: (circleSegment.value.a.x + circleSegment.value.b.x) / 2,
    y: (circleSegment.value.a.y + circleSegment.value.b.y) / 2,
  });
};

interface FirstCandidateOptions {
  readonly radius: number;
  readonly fullDose: number;
}

export const buildFirstMeasuredCutCandidate = ({
  length,
  radius,
  fullDose,
}: FirstCandidateOptions & { readonly length: number }): CandidateResult => {
  if (!Number.isFinite(length) || length <= 0) {
    return { ok: false, message: "Enter the first cut length." };
  }

  const diameter = radius * 2;
  if (length > diameter) {
    return {
      ok: false,
      message: `The maximum chord length is ${diameter.toFixed(3)} cm.`,
    };
  }

  const halfLength = length / 2;
  const offset = Math.sqrt(Math.max(0, radius * radius - halfLength * halfLength));
  const cut: GeometryCut = {
    a: { x: -halfLength, y: -offset },
    b: { x: halfLength, y: -offset },
    removeSign: -1,
  };
  const removedArea = polygonArea(
    clipPolygon(circlePolygon(radius), { ...cut, removeSign: 1 }),
  );
  const dosage = circleArea(radius) > 0 ? (fullDose * removedArea) / circleArea(radius) : 0;

  if (removedArea <= circleArea(radius) * MINIMUM_AREA_RATIO) {
    return {
      ok: false,
      message: "This first cut is too small to create a measurable area.",
    };
  }

  return {
    ok: true,
    cut,
    direction: "horizontal",
    length,
    lineAngle: 0,
    removedArea,
    dosage,
    message:
      `First-cut preview: ${length.toFixed(3)} cm horizontal cut, ` +
      `${removedArea.toFixed(3)} cm² top area, ${dosage.toFixed(3)} mg.`,
  };
};

export const solveFirstMeasuredCutForArea = (
  options: FirstCandidateOptions,
  targetArea: number,
): CandidateResult => {
  const halfCircleArea = circleArea(options.radius) / 2;
  if (!Number.isFinite(targetArea) || targetArea <= 0) {
    return { ok: false, message: "Enter the dosage for the first area." };
  }
  if (targetArea > halfCircleArea + 1e-9) {
    return { ok: false, message: "The first top area cannot be larger than half of the patch." };
  }

  const bounds = Array.from({ length: 60 }).reduce<{ readonly lower: number; readonly upper: number }>(
    (state) => {
      const length = (state.lower + state.upper) / 2;
      const candidate = buildFirstMeasuredCutCandidate({ ...options, length });
      return !candidate.ok || candidate.removedArea < targetArea
        ? { lower: length, upper: state.upper }
        : { lower: state.lower, upper: length };
    },
    { lower: 0, upper: options.radius * 2 },
  );

  return buildFirstMeasuredCutCandidate({
    ...options,
    length: (bounds.lower + bounds.upper) / 2,
  });
};

interface ConnectedCandidateOptions {
  readonly previousSegment: Segment;
  readonly previousCuts: readonly GeometryCut[];
  readonly currentPiece: readonly Point[];
  readonly startChoice: StartChoice;
  readonly direction: Direction;
  readonly radius: number;
  readonly fullDose: number;
}

export const buildMeasuredCutCandidate = ({
  previousSegment,
  previousCuts,
  currentPiece,
  startChoice,
  length,
  direction,
  radius,
  fullDose,
}: ConnectedCandidateOptions & { readonly length: number }): CandidateResult => {
  if (!Number.isFinite(length) || length <= 0) {
    return { ok: false, message: "Enter the new cut length." };
  }

  const diameter = radius * 2;
  if (length > diameter) {
    return {
      ok: false,
      message: `The maximum chord length is ${diameter.toFixed(3)} cm.`,
    };
  }

  const start = startChoice === "a" ? previousSegment.a : previousSegment.b;
  const otherEnd = startChoice === "a" ? previousSegment.b : previousSegment.a;
  const startAngle = Math.atan2(start.y, start.x);
  const centralAngle = 2 * Math.asin(Math.min(1, length / diameter));
  const directionSign = direction === "clockwise" ? 1 : -1;
  const endAngle = startAngle + directionSign * centralAngle;
  const end = { x: Math.cos(endAngle) * radius, y: Math.sin(endAngle) * radius };
  const side = cross(start, end, otherEnd);

  if (Math.abs(side) < 1e-9) {
    return {
      ok: false,
      message: "This cut overlaps the previous cut. Change the length or direction.",
    };
  }

  if (
    !previousCuts.every((cut) => insideHalfPlane(start, cut)) ||
    !previousCuts.every((cut) => insideHalfPlane(end, cut))
  ) {
    return {
      ok: false,
      message: "This direction does not end on the remaining piece. Try the other direction or endpoint.",
    };
  }

  const cut: GeometryCut = {
    a: { ...start },
    b: end,
    removeSign: side > 0 ? 1 : -1,
  };
  const removedArea = polygonArea(
    clipPolygon(currentPiece, { ...cut, removeSign: cut.removeSign === 1 ? -1 : 1 }),
  );
  if (removedArea <= circleArea(radius) * MINIMUM_AREA_RATIO) {
    return {
      ok: false,
      message: "This cut does not create a new area. Change the length, endpoint, or direction.",
    };
  }

  const lineAngle = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
  const dosage = circleArea(radius) > 0 ? (fullDose * removedArea) / circleArea(radius) : 0;
  return {
    ok: true,
    cut,
    direction,
    length,
    lineAngle,
    removedArea,
    dosage,
    message:
      `${length.toFixed(3)} cm cut, ${removedArea.toFixed(3)} cm² area. ` +
      `Calculated line angle ${lineAngle.toFixed(1)}°.`,
  };
};

const isCandidateSuccess = (
  candidate: CandidateResult,
): candidate is CandidateSuccess => candidate.ok;

const bisectMeasuredCutArea = (
  options: ConnectedCandidateOptions,
  targetArea: number,
  lower: number,
  upper: number,
): CandidateResult => {
  const initial = buildMeasuredCutCandidate({ ...options, length: lower });
  if (!initial.ok) return initial;

  const bounds = Array.from({ length: 60 }).reduce<{
    readonly lower: number;
    readonly upper: number;
    readonly lowerCandidate: CandidateSuccess;
  }>(
    (state) => {
      const middle = (state.lower + state.upper) / 2;
      const candidate = buildMeasuredCutCandidate({ ...options, length: middle });
      if (!candidate.ok) return state;

      const lowerDifference = state.lowerCandidate.removedArea - targetArea;
      const middleDifference = candidate.removedArea - targetArea;
      if (Math.abs(middleDifference) < 1e-9) {
        return {
          lower: middle,
          upper: middle,
          lowerCandidate: candidate,
        };
      }
      if (lowerDifference * middleDifference <= 0) {
        return { ...state, upper: middle };
      }
      return { lower: middle, upper: state.upper, lowerCandidate: candidate };
    },
    { lower, upper, lowerCandidate: initial },
  );

  return buildMeasuredCutCandidate({
    ...options,
    length: (bounds.lower + bounds.upper) / 2,
  });
};

const solveMeasuredCutForArea = (
  options: ConnectedCandidateOptions,
  targetArea: number,
  preferredLength: number,
): CandidateResult => {
  const diameter = options.radius * 2;
  const samples = Array.from({ length: 720 }, (_, index) => {
    const length = (diameter * (index + 1)) / 720;
    return {
      length,
      candidate: buildMeasuredCutCandidate({ ...options, length }),
    };
  });
  const validSamples = samples.filter(
    (sample): sample is { readonly length: number; readonly candidate: CandidateSuccess } =>
      isCandidateSuccess(sample.candidate),
  );
  const firstValid = validSamples.at(0);
  if (!firstValid) {
    return { ok: false, message: "No connected cut is available for this endpoint and direction." };
  }

  const bestSample = validSamples.reduce(
    (best, sample) => {
      const error = Math.abs(sample.candidate.removedArea - targetArea);
      return error < best.error ? { sample, error } : best;
    },
    {
      sample: firstValid,
      error: Math.abs(firstValid.candidate.removedArea - targetArea),
    },
  );

  const brackets = samples.slice(1).flatMap((sample, index) => {
    const previous = samples[index];
    if (!previous || !previous.candidate.ok || !sample.candidate.ok) return [];

    const previousDifference = previous.candidate.removedArea - targetArea;
    const difference = sample.candidate.removedArea - targetArea;
    return previousDifference * difference <= 0
      ? [{ lower: previous.length, upper: sample.length }]
      : [];
  });

  const roots = brackets.map((bracket) =>
    bisectMeasuredCutArea(options, targetArea, bracket.lower, bracket.upper),
  ).filter(isCandidateSuccess);

  const closestRoot = roots.at(0);
  if (closestRoot && !Number.isFinite(preferredLength)) return closestRoot;
  if (closestRoot) {
    return roots.reduce((closest, candidate) => {
      const candidateDistance = Math.abs(candidate.length - preferredLength);
      const closestDistance = Math.abs(closest.length - preferredLength);
      return candidateDistance < closestDistance ? candidate : closest;
    });
  }

  const tolerance = Math.max(1e-5, targetArea * 0.00001);
  return bestSample.error <= tolerance
    ? bestSample.sample.candidate
    : { ok: false, message: "This dosage is not reachable from the selected endpoint and direction." };
};

const firstMeasuredCutPreview = (
  radius: number,
  fullDose: number,
  inputs: MeasuredInputs,
): CandidateResult => {
  if (inputs.source === "dose") {
    const dose = Number(inputs.dose);
    if (!Number.isFinite(dose) || dose <= 0) {
      return { ok: false, message: "Enter the dosage for the first top area." };
    }
    if (!(fullDose > 0) || dose > fullDose / 2) {
      return {
        ok: false,
        message: `The first top-area dosage cannot exceed ${(fullDose / 2).toFixed(3)} mg.`,
      };
    }

    const targetArea = (circleArea(radius) * dose) / fullDose;
    const solved = solveFirstMeasuredCutForArea({ radius, fullDose }, targetArea);
    if (!solved.ok) return solved;
    return { ...solved, dosage: dose };
  }

  return buildFirstMeasuredCutCandidate({
    radius,
    fullDose,
    length: Number(inputs.length),
  });
};

export const measuredCutPreview = (
  cuts: readonly Cut[],
  radius: number,
  fullDose: number,
  inputs: MeasuredInputs,
): CandidateResult => {
  if (!cuts.length) return firstMeasuredCutPreview(radius, fullDose, inputs);

  const previousCut = cuts.at(-1);
  if (!previousCut) return { ok: false, message: "The previous cut is not available." };

  const previousSegment = cutSegmentThroughCircle(previousCut, radius);
  if (previousSegment.kind === "none") {
    return { ok: false, message: "The previous cut has no usable circle endpoints." };
  }

  const options = {
    previousSegment: previousSegment.value,
    previousCuts: cuts,
    currentPiece: remainingPolygon(cuts, radius),
    startChoice: inputs.start,
    radius,
    fullDose,
  };
  if (inputs.source === "length") {
    const length = Number(inputs.length);
    if (!Number.isFinite(length) || length <= 0) {
      return { ok: false, message: "Enter the new cut length." };
    }
  }
  const directions: readonly Direction[] =
    inputs.direction === "auto"
      ? ["clockwise", "counterclockwise"]
      : [inputs.direction];

  if (inputs.source === "dose") {
    const dose = Number(inputs.dose);
    if (!Number.isFinite(dose) || dose <= 0) {
      return { ok: false, message: "Enter the dosage for the new area." };
    }
    if (!(fullDose > 0) || dose > fullDose) {
      return { ok: false, message: `Enter a dosage no greater than ${fullDose.toFixed(3)} mg.` };
    }

    const solutions = directions.map((direction) =>
      solveMeasuredCutForArea(
        { ...options, direction },
        (circleArea(radius) * dose) / fullDose,
        Number(inputs.length),
      ),
    );
    const validSolutions = solutions.filter(isCandidateSuccess);
    const firstSolution = validSolutions.at(0);
    if (!firstSolution) {
      if (inputs.direction === "auto") {
        return { ok: false, message: "This dosage is not reachable from this endpoint in either direction." };
      }
      return solutions.at(0) ?? { ok: false, message: "This dosage is not reachable from this endpoint." };
    }

    const chosen = inputs.direction === "auto"
      ? validSolutions.reduce((shortest, solution) =>
          solution.length < shortest.length ? solution : shortest,
        )
      : firstSolution;
    const autoMessage = inputs.direction === "auto" ? ` Auto chose ${chosen.direction}.` : "";
    return {
      ...chosen,
      dosage: dose,
      message:
        `Preview: ${chosen.length.toFixed(3)} cm cut, ${chosen.removedArea.toFixed(3)} cm² area, ` +
        `${dose.toFixed(3)} mg.${autoMessage}`,
    };
  }

  const candidates = directions.map((direction) =>
    buildMeasuredCutCandidate({ ...options, direction, length: Number(inputs.length) }),
  );
  const validCandidates = candidates.filter(isCandidateSuccess);
  const firstCandidate = validCandidates.at(0);
  if (!firstCandidate) {
    if (inputs.direction === "auto") {
      return { ok: false, message: "This cut length does not reach the remaining piece in either direction." };
    }
    return candidates.at(0) ?? { ok: false, message: "This cut length is not reachable." };
  }

  const chosen = inputs.direction === "auto"
    ? validCandidates.reduce((smallestArea, candidate) =>
        candidate.removedArea < smallestArea.removedArea ? candidate : smallestArea,
      )
    : firstCandidate;
  const autoMessage = inputs.direction === "auto" ? ` Auto chose ${chosen.direction}.` : "";
  return {
    ...chosen,
    message:
      `Preview: ${chosen.length.toFixed(3)} cm cut, ${chosen.removedArea.toFixed(3)} cm² area, ` +
      `${chosen.dosage.toFixed(3)} mg.${autoMessage}`,
  };
};

export const translateCut = (
  base: GeometryCut,
  distance: number,
): Option<GeometryCut> => {
  const dx = base.b.x - base.a.x;
  const dy = base.b.y - base.a.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-12) return none();

  const normal = { x: -dy / length, y: dx / length };
  return some({
    a: { x: base.a.x + normal.x * distance, y: base.a.y + normal.y * distance },
    b: { x: base.b.x + normal.x * distance, y: base.b.y + normal.y * distance },
    removeSign: base.removeSign,
  });
};

const segmentParameter = (point: Point, start: Point, end: Point): number => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-12) return Number.NaN;
  return ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
};

const hasFiniteIntersections = (
  start: Point,
  end: Point,
  polygon: readonly Point[],
): boolean =>
  linePolygonIntersections(start, end, polygon).filter((point) => {
    const parameter = segmentParameter(point, start, end);
    return parameter >= -1e-9 && parameter <= 1 + 1e-9;
  }).length >= 2;

const hasUsableTranslatedCut = (
  cuts: readonly GeometryCut[],
  index: number,
  radius: number,
  cut: GeometryCut,
): boolean => {
  const circleSegment = cutSegmentThroughCircle(cut, radius);
  if (circleSegment.kind === "none" || segmentLength(circleSegment) <= 1e-7) return false;
  if (!hasFiniteIntersections(cut.a, cut.b, circlePolygon(radius))) return false;

  const currentPieceSegment = cutSegmentThroughPiece(cut, cuts.slice(0, index), radius);
  if (currentPieceSegment.kind === "none" || segmentLength(currentPieceSegment) <= 1e-7) return false;
  if (!hasFiniteIntersections(cut.a, cut.b, remainingPolygon(cuts.slice(0, index), radius))) return false;

  return cutAreaForCuts(cuts, index, radius) > circleArea(radius) * MINIMUM_AREA_RATIO;
};

const translatedCutArea = (
  cuts: readonly GeometryCut[],
  index: number,
  radius: number,
  base: GeometryCut,
  distance: number,
): number => {
  const moved = translateCut(base, distance);
  if (moved.kind === "none") return Number.NaN;
  const movedCuts = cuts.map((cut, cutIndex) => (cutIndex === index ? moved.value : cut));
  if (!hasUsableTranslatedCut(movedCuts, index, radius, moved.value)) return Number.NaN;
  return cutAreaForCuts(movedCuts, index, radius);
};

const translatedCutLength = (
  cuts: readonly GeometryCut[],
  index: number,
  radius: number,
  base: GeometryCut,
  distance: number,
): number => {
  const moved = translateCut(base, distance);
  if (moved.kind === "none") return Number.NaN;
  const movedCuts = cuts.map((cut, cutIndex) => (cutIndex === index ? moved.value : cut));
  if (!hasUsableTranslatedCut(movedCuts, index, radius, moved.value)) return Number.NaN;
  return segmentLength(cutSegmentThroughPiece(moved.value, movedCuts.slice(0, index), radius));
};

interface Bracket {
  readonly lower: number;
  readonly upper: number;
}

const bisectionRoot = (
  valueAt: (value: number) => number,
  bracket: Bracket,
): number => {
  const initialLowerValue = valueAt(bracket.lower);
  const bounds = Array.from({ length: 70 }).reduce<{
    readonly lower: number;
    readonly upper: number;
    readonly lowerValue: number;
  }>(
    (state) => {
      const middle = (state.lower + state.upper) / 2;
      const middleValue = valueAt(middle);
      if (Math.abs(middleValue) < 1e-8) {
        return { lower: middle, upper: middle, lowerValue: middleValue };
      }
      if (state.lowerValue * middleValue <= 0) {
        return { ...state, upper: middle };
      }
      return { lower: middle, upper: state.upper, lowerValue: middleValue };
    },
    { lower: bracket.lower, upper: bracket.upper, lowerValue: initialLowerValue },
  );
  return (bounds.lower + bounds.upper) / 2;
};

const solveTranslation = (
  valueAt: (value: number) => number,
  target: number,
  span: number,
  sampleCount: number,
  tolerance: number,
): Option<number> => {
  const samples = Array.from({ length: sampleCount + 1 }, (_, index) => {
    const distance = -span + (2 * span * index) / sampleCount;
    const difference = valueAt(distance) - target;
    return { distance, difference };
  });
  const validSamples = samples.filter((sample) => Number.isFinite(sample.difference));
  const firstValidSample = validSamples.at(0);
  if (!firstValidSample) return none();
  const best = validSamples.reduce((current, sample) => {
    const error = Math.abs(sample.difference);
    if (error < current.error) return { distance: sample.distance, error };
    return current;
  }, { distance: firstValidSample.distance, error: Math.abs(firstValidSample.difference) });
  const brackets = samples.slice(1).flatMap((sample, index) => {
    const previous = samples[index];
    if (!previous || !Number.isFinite(previous.difference) || !Number.isFinite(sample.difference)) return [];
    if (previous.difference * sample.difference > 0) return [];
    return [{ lower: previous.distance, upper: sample.distance }];
  });

  const roots = brackets.map((bracket) => bisectionRoot((distance) => valueAt(distance) - target, bracket));
  if (roots.length) {
    return some(roots.reduce((closest, root) =>
      Math.abs(root) < Math.abs(closest) ? root : closest,
    ));
  }
  return best.error <= tolerance ? some(best.distance) : none();
};

export const adjustCutToArea = (
  cuts: readonly Cut[],
  index: number,
  targetArea: number,
  radius: number,
): MeasurementAdjustmentResult => {
  const selected = cuts[index];
  if (!selected || !Number.isFinite(targetArea)) {
    return { ok: false, message: "The selected cut is not available." };
  }
  if (!hasUsableTranslatedCut(cuts, index, radius, selected)) {
    return { ok: false, message: "The selected cut is not a usable chord through the current piece." };
  }
  const maxArea = polygonArea(remainingPolygonForCuts(cuts, radius, index));
  if (targetArea < 0 || targetArea > maxArea) {
    return { ok: false, message: `Enter an area between 0 and ${maxArea.toFixed(2)} cm² for this cut.` };
  }

  const distance = solveTranslation(
    (value) => translatedCutArea(cuts, index, radius, selected, value),
    targetArea,
    cuts.length ? cuts.length * radius * 2.5 : radius * 2.5,
    360,
    Math.max(0.02, maxArea * 0.00002),
  );
  if (distance.kind === "none") {
    return { ok: false, message: "Earlier cuts limit this cut area while its angle stays fixed." };
  }

  const moved = translateCut(selected, distance.value);
  if (moved.kind === "none") return { ok: false, message: "The cut cannot be moved." };
  const movedCuts = cuts.map((cut, cutIndex) => (cutIndex === index ? moved.value : cut));
  if (!hasUsableTranslatedCut(movedCuts, index, radius, moved.value)) {
    return { ok: false, message: "The translated cut is not a usable chord through the current piece." };
  }
  return { ok: true, cut: moved.value };
};

export const adjustCutToDose = (
  cuts: readonly Cut[],
  index: number,
  targetDose: number,
  radius: number,
  fullDose: number,
): MeasurementAdjustmentResult => {
  if (!(fullDose > 0) || !Number.isFinite(targetDose)) {
    return { ok: false, message: "Enter a full-patch dosage greater than 0 first." };
  }
  const maxDose = (fullDose * polygonArea(remainingPolygonForCuts(cuts, radius, index))) / circleArea(radius);
  if (targetDose < 0 || targetDose > maxDose) {
    return { ok: false, message: `Enter a dosage between 0 and ${maxDose.toFixed(3)} mg for this cut.` };
  }
  return adjustCutToArea(cuts, index, (circleArea(radius) * targetDose) / fullDose, radius);
};

export const adjustCutToLength = (
  cuts: readonly Cut[],
  index: number,
  targetLength: number,
  radius: number,
): MeasurementAdjustmentResult => {
  const selected = cuts[index];
  if (!selected || !Number.isFinite(targetLength) || targetLength < 0) {
    return { ok: false, message: "Enter a valid cut length." };
  }
  if (!hasUsableTranslatedCut(cuts, index, radius, selected)) {
    return { ok: false, message: "The selected cut is not a usable chord through the current piece." };
  }
  if (targetLength > radius * 2 * 1.05) {
    return { ok: false, message: `Enter a value no greater than about ${(radius * 2).toFixed(2)} cm for this circle.` };
  }

  const currentLength = translatedCutLength(cuts, index, radius, selected, 0);
  if (closeEnough(currentLength, targetLength, 0.005)) {
    return { ok: true, cut: selected };
  }

  const span = radius * 2 * 1.6;
  const distance = solveTranslation(
    (value) => translatedCutLength(cuts, index, radius, selected, value),
    targetLength,
    span,
    320,
    0.03,
  );
  if (distance.kind === "none") {
    return { ok: false, message: "That cut length cannot be produced while keeping its angle and earlier cuts fixed." };
  }

  const moved = translateCut(selected, distance.value);
  if (moved.kind === "none") return { ok: false, message: "The cut cannot be moved." };
  const movedCuts = cuts.map((cut, cutIndex) => (cutIndex === index ? moved.value : cut));
  if (!hasUsableTranslatedCut(movedCuts, index, radius, moved.value)) {
    return { ok: false, message: "The translated cut is not a usable chord through the current piece." };
  }
  return { ok: true, cut: moved.value };
};

export const signedCenterDistance = (cut: GeometryCut): number => {
  const dx = cut.b.x - cut.a.x;
  const dy = cut.b.y - cut.a.y;
  const length = Math.hypot(dx, dy);
  return length < 1e-12 ? 0 : cross(cut.a, cut.b, { x: 0, y: 0 }) / length;
};

export const centerOffset = (cut: GeometryCut): number =>
  Math.abs(signedCenterDistance(cut));

export const sideRimDepths = (
  cut: GeometryCut,
  radius: number,
): { readonly removed: number; readonly kept: number } => {
  const signedDistance = signedCenterDistance(cut);
  const positiveSide = Math.max(0, signedDistance + radius);
  const negativeSide = Math.max(0, radius - signedDistance);
  return cut.removeSign > 0
    ? { removed: positiveSide, kept: negativeSide }
    : { removed: negativeSide, kept: positiveSide };
};

export const angleDifferenceDeg = (a: GeometryCut, b: GeometryCut): number => {
  const first = Math.atan2(a.b.y - a.a.y, a.b.x - a.a.x);
  const second = Math.atan2(b.b.y - b.a.y, b.b.x - b.a.x);
  const raw = (Math.abs((first - second) * 180) / Math.PI) % 180;
  return raw > 90 ? 180 - raw : raw;
};

export const distancePointToLine = (point: Point, line: GeometryCut): number => {
  const dx = line.b.x - line.a.x;
  const dy = line.b.y - line.a.y;
  const length = Math.hypot(dx, dy);
  return length < 1e-12 ? Number.NaN : Math.abs(cross(line.a, line.b, point)) / length;
};

export const perpendicularDistanceBetweenLines = (
  first: GeometryCut,
  second: GeometryCut,
): number => distancePointToLine(second.a, first);

export const projectPointToLine = (point: Point, line: GeometryCut): Point => {
  const dx = line.b.x - line.a.x;
  const dy = line.b.y - line.a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-12) return { ...line.a };
  const ratio = ((point.x - line.a.x) * dx + (point.y - line.a.y) * dy) / lengthSquared;
  return { x: line.a.x + ratio * dx, y: line.a.y + ratio * dy };
};
