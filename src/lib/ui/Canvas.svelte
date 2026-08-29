<script lang="ts">
  import { onMount } from "svelte";
  import {
    angleDifferenceDeg,
    cutAreaPolygonForCuts,
    cutHandle,
    cutSegmentThroughCircle,
    cutSegmentThroughPiece,
    findAreaIndex,
    linePolygonIntersections,
    projectPointToLine,
    remainingPolygon,
    segmentLength,
    translateCut,
  } from "../calculator/geometry";
  import { COLORS } from "../calculator/state";
  import type {
    CalculatorState,
    CandidateResult,
    GeometryCut,
    Point,
    StartChoice,
    ViewState,
  } from "../calculator/types";

  const SNAP_DEGREES = 8;
  const HANDLE_RADIUS_PX = 11;
  const HANDLE_HIT_PX = 30;
  const MEASURED_ENDPOINT_HIT_PX = 22;
  const LINE_HIT_PX = 10;
  const PARALLEL_TOLERANCE = 1;

  type DrawStage = "idle" | "secondPoint" | "chooseSide";

  interface Props {
    readonly calculator: CalculatorState;
    readonly preview: CandidateResult;
    readonly measuredStart: StartChoice;
    readonly spaceHeld: boolean;
    readonly interactionResetToken: number;
    readonly onAddCut: (cut: GeometryCut) => void;
    readonly onSelectCut: (index: number) => void;
    readonly onUpdateCut: (index: number, cut: GeometryCut) => void;
    readonly onBeginEdit: () => void;
    readonly onEndEdit: () => void;
    readonly onCancelEdit: () => void;
    readonly onInteractionStateChange: (pending: boolean) => void;
    readonly onViewChange: (view: ViewState) => void;
    readonly onMessage: (status: string, instruction: string) => void;
    readonly onMeasuredStartChange: (start: StartChoice) => void;
  }

  let {
    calculator,
    preview,
    measuredStart,
    spaceHeld,
    interactionResetToken,
    onAddCut,
    onSelectCut,
    onUpdateCut,
    onBeginEdit,
    onEndEdit,
    onCancelEdit,
    onInteractionStateChange,
    onViewChange,
    onMessage,
    onMeasuredStartChange,
  }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let wrap = $state<HTMLDivElement | null>(null);
  let drawStage = $state<DrawStage>("idle");
  let firstPoint = $state<Point | undefined>(undefined);
  let previewPoint = $state<Point | undefined>(undefined);
  let pendingLine = $state<GeometryCut | undefined>(undefined);
  let hoveredHandle = $state(-1);
  let hoveredLine = $state(-1);
  let hoveredArea = $state(-1);
  let hoveredMeasuredStart = $state<StartChoice | undefined>(undefined);
  let draggingHandle = $state(false);
  let dragIndex = $state(-1);
  let dragStart = $state<Point | undefined>(undefined);
  let dragOriginal = $state<GeometryCut | undefined>(undefined);
  let isPanning = $state(false);
  let panStartCanvas = $state<Point | undefined>(undefined);
  let resizeObserver: ResizeObserver | undefined;
  let appliedInteractionResetToken = $state(0);

  interface CanvasView {
    readonly width: number;
    readonly height: number;
    readonly cx: number;
    readonly cy: number;
    readonly rPx: number;
    readonly scale: number;
  }

  const currentView = (): CanvasView => {
    const rect = canvas?.getBoundingClientRect();
    const width = rect?.width ?? 0;
    const height = rect?.height ?? 0;
    const size = Math.min(width, height);
    const padding = Math.max(30, size * 0.075);
    const baseRadiusPx = (size - padding * 2) / 2;
    const radius = calculator.settings.diameter / 2 || 1;
    return {
      width,
      height,
      cx: width / 2 + calculator.view.panX,
      cy: height / 2 + calculator.view.panY,
      rPx: baseRadiusPx * calculator.view.zoom,
      scale: (baseRadiusPx / radius) * calculator.view.zoom,
    };
  };

  const toCanvas = (point: Point, view: CanvasView): Point => ({
    x: view.cx + point.x * view.scale,
    y: view.cy + point.y * view.scale,
  });

  const toPhysical = (point: Point, view: CanvasView): Point => ({
    x: (point.x - view.cx) / view.scale,
    y: (point.y - view.cy) / view.scale,
  });

  const pointerCanvas = (event: PointerEvent | WheelEvent): Point => {
    const rect = canvas?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  };

  const snapSecondPoint = (start: Point, end: Point): Point => {
    if (!calculator.settings.snapEnabled) return end;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return end;

    const degrees = (Math.atan2(dy, dx) * 180) / Math.PI;
    const horizontalDistance = Math.min(Math.abs(degrees), Math.abs(180 - degrees));
    const verticalDistance = Math.abs(90 - Math.abs(degrees));
    if (horizontalDistance <= SNAP_DEGREES) return { x: end.x, y: start.y };
    if (verticalDistance <= SNAP_DEGREES) return { x: start.x, y: end.y };
    return end;
  };

  const handlePoint = (index: number): Point | undefined => {
    const cut = calculator.cuts[index];
    if (!cut) return undefined;
    const handle = cutHandle(cut, index, calculator.cuts, calculator.settings.diameter / 2);
    return handle.kind === "some" ? handle.value : undefined;
  };

  const findHandle = (point: Point, view: CanvasView): number => {
    const indexes = calculator.cuts.map((_, index) => index).toReversed();
    const found = indexes.find((index) => {
      const handle = handlePoint(index);
      if (!handle) return false;
      const screen = toCanvas(handle, view);
      return Math.hypot(point.x - screen.x, point.y - screen.y) <= HANDLE_HIT_PX;
    });
    return found ?? -1;
  };

  const lineDistance = (point: Point, cut: GeometryCut, view: CanvasView): number => {
    const start = toCanvas(cut.a, view);
    const end = toCanvas(cut.b, view);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    return length < 1e-9
      ? Number.POSITIVE_INFINITY
      : Math.abs((point.x - start.x) * dy - (point.y - start.y) * dx) / length;
  };

  const findLine = (point: Point, view: CanvasView): number => {
    const best = calculator.cuts.reduce(
      (current, cut, index) => {
        const distance = lineDistance(point, cut, view);
        return distance < current.distance ? { index, distance } : current;
      },
      { index: -1, distance: Number.POSITIVE_INFINITY },
    );
    return best.distance <= LINE_HIT_PX ? best.index : -1;
  };

  interface MeasuredEndpoint {
    readonly key: StartChoice;
    readonly point: Point;
  }

  const measuredEndpoints = (): readonly MeasuredEndpoint[] => {
    const last = calculator.cuts.at(-1);
    if (!last) return [];
    const segment = cutSegmentThroughCircle(last, calculator.settings.diameter / 2);
    if (segment.kind === "none") return [];
    return [
      { key: "a", point: segment.value.a },
      { key: "b", point: segment.value.b },
    ];
  };

  const findMeasuredStart = (point: Point, view: CanvasView): StartChoice | undefined => {
    const nearby = measuredEndpoints()
      .map((endpoint) => ({
        key: endpoint.key,
        distance: Math.hypot(
          point.x - toCanvas(endpoint.point, view).x,
          point.y - toCanvas(endpoint.point, view).y,
        ),
      }))
      .filter((endpoint) => endpoint.distance <= MEASURED_ENDPOINT_HIT_PX)
      .toSorted((first, second) => first.distance - second.distance);
    return nearby.at(0)?.key;
  };

  const fillPolygon = (
    context: CanvasRenderingContext2D,
    polygon: readonly Point[],
    view: CanvasView,
    fill: string,
    alpha: number,
    stroke: string | undefined,
  ): void => {
    const first = polygon.at(0);
    if (!first) return;
    const firstScreen = toCanvas(first, view);
    context.save();
    context.beginPath();
    context.moveTo(firstScreen.x, firstScreen.y);
    polygon.slice(1).forEach((point) => {
      const screen = toCanvas(point, view);
      context.lineTo(screen.x, screen.y);
    });
    context.closePath();
    context.globalAlpha = alpha;
    context.fillStyle = fill;
    context.fill();
    if (stroke) {
      context.globalAlpha = 0.9;
      context.lineWidth = 2;
      context.strokeStyle = stroke;
      context.stroke();
    }
    context.restore();
  };

  const drawRemainingShape = (context: CanvasRenderingContext2D, view: CanvasView): void => {
    context.save();
    context.beginPath();
    context.arc(view.cx, view.cy, view.rPx, 0, Math.PI * 2);
    context.fillStyle = "#e8e8e3";
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = "#8a8a83";
    context.stroke();
    context.restore();

    calculator.cuts.forEach((cut, index) => {
      const polygon = cutAreaPolygonForCuts(calculator.cuts, index, calculator.settings.diameter / 2);
      const selected = index === calculator.selectedCut;
      const alpha = selected ? 0.32 : 0.16;
      const stroke = selected ? cut.color : undefined;
      fillPolygon(context, polygon, view, cut.color, alpha, stroke);
    });

    fillPolygon(context, remainingPolygon(calculator.cuts, calculator.settings.diameter / 2), view, "#ffffff", 1, "#171717");
  };

  const drawCut = (context: CanvasRenderingContext2D, index: number, view: CanvasView): void => {
    const cut = calculator.cuts[index];
    if (!cut) return;
    const segment = cutSegmentThroughCircle(cut, calculator.settings.diameter / 2);
    if (segment.kind === "none") return;
    const start = toCanvas(segment.value.a, view);
    const end = toCanvas(segment.value.b, view);
    const selected = index === calculator.selectedCut;
    const hovered = index === hoveredLine || index === hoveredHandle || index === hoveredArea;

    context.save();
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.lineWidth = cutLineWidth(selected, hovered);
    context.lineCap = "round";
    context.strokeStyle = cut.color;
    context.stroke();
    context.restore();

    const handle = handlePoint(index);
    if (!handle) return;
    const screen = toCanvas(handle, view);
    context.save();
    context.beginPath();
    context.arc(screen.x, screen.y, HANDLE_RADIUS_PX, 0, Math.PI * 2);
    context.fillStyle = cut.color;
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = "#ffffff";
    context.stroke();
    if (index === hoveredHandle || selected) {
      context.beginPath();
      context.arc(screen.x, screen.y, index === hoveredHandle ? HANDLE_HIT_PX : HANDLE_RADIUS_PX + 4, 0, Math.PI * 2);
      context.lineWidth = 2;
      context.strokeStyle = cut.color;
      context.globalAlpha = index === hoveredHandle ? 0.35 : 1;
      context.stroke();
    }
    context.globalAlpha = 1;
    context.fillStyle = "#ffffff";
    context.font = "700 11px system-ui";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(index + 1), screen.x, screen.y + 0.5);
    context.restore();
  };

  const cutLineWidth = (selected: boolean, hovered: boolean): number => {
    if (selected) return 5;
    if (hovered) return 4;
    return 3;
  };

  const drawPreviewLine = (
    context: CanvasRenderingContext2D,
    startPoint: Point,
    endPoint: Point,
    view: CanvasView,
    color: string,
  ): void => {
    const start = toCanvas(startPoint, view);
    const end = toCanvas(endPoint, view);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) return;
    const ux = dx / length;
    const uy = dy / length;
    const lineLength = Math.max(view.width, view.height) * 2;
    context.save();
    context.beginPath();
    context.moveTo(start.x - ux * lineLength, start.y - uy * lineLength);
    context.lineTo(start.x + ux * lineLength, start.y + uy * lineLength);
    context.lineWidth = 2;
    context.setLineDash([7, 7]);
    context.strokeStyle = color;
    context.stroke();
    context.restore();
  };

  const drawDimension = (
    context: CanvasRenderingContext2D,
    startPoint: Point,
    endPoint: Point,
    label: string,
    view: CanvasView,
    color: string,
    dashed = false,
  ): void => {
    const start = toCanvas(startPoint, view);
    const end = toCanvas(endPoint, view);
    const middleX = (start.x + end.x) / 2;
    const middleY = (start.y + end.y) / 2;
    context.save();
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.lineWidth = 1.6;
    context.strokeStyle = color;
    context.setLineDash(dashed ? [5, 4] : []);
    context.stroke();
    context.setLineDash([]);
    context.font = "700 11px system-ui";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 4;
    context.lineJoin = "round";
    context.strokeStyle = "#ffffff";
    context.strokeText(label, middleX, middleY - 9);
    context.fillStyle = "#222222";
    context.fillText(label, middleX, middleY - 9);
    context.restore();
  };

  const lineNormal = (cut: GeometryCut): Point | undefined => {
    const dx = cut.b.x - cut.a.x;
    const dy = cut.b.y - cut.a.y;
    const length = Math.hypot(dx, dy);
    return length < 1e-12 ? undefined : { x: -dy / length, y: dx / length };
  };

  const add = (first: Point, second: Point): Point => ({ x: first.x + second.x, y: first.y + second.y });
  const scale = (point: Point, amount: number): Point => ({ x: point.x * amount, y: point.y * amount });

  const drawSelectedMeasurements = (context: CanvasRenderingContext2D, view: CanvasView): void => {
    const selectedIndex = calculator.selectedCut;
    if (selectedIndex < 0) return;
    const isActive =
      hoveredHandle === selectedIndex ||
      hoveredLine === selectedIndex ||
      (draggingHandle && dragIndex === selectedIndex);
    if (!isActive) return;

    const cut = calculator.cuts[selectedIndex];
    if (!cut) return;
    const normal = lineNormal(cut);
    const segment = cutSegmentThroughPiece(cut, calculator.cuts.slice(0, selectedIndex), calculator.settings.diameter / 2);
    if (!normal || segment.kind === "none") return;

    const keptDirection = cut.removeSign > 0 ? scale(normal, -1) : normal;
    const offset = 20 / view.scale;
    const first = add(segment.value.a, scale(keptDirection, offset));
    const second = add(segment.value.b, scale(keptDirection, offset));
    drawDimension(context, first, second, `Cut ${segmentLength(segment).toFixed(2)} cm`, view, cut.color);

    const removedDirection = cut.removeSign > 0 ? normal : scale(normal, -1);
    const rimPoint = scale(removedDirection, calculator.settings.diameter / 2);
    const foot = projectPointToLine(rimPoint, cut);
    drawDimension(context, foot, rimPoint, `Rim ${Math.hypot(rimPoint.x - foot.x, rimPoint.y - foot.y).toFixed(2)} cm`, view, cut.color);

    const previous = calculator.cuts[selectedIndex - 1];
    const handle = handlePoint(selectedIndex);
    if (!previous || !handle) return;
    const projection = projectPointToLine(handle, previous);
    const angle = angleDifferenceDeg(cut, previous);
    drawDimension(context, handle, projection, `Prev ${Math.hypot(handle.x - projection.x, handle.y - projection.y).toFixed(2)} cm`, view, previous.color, angle > PARALLEL_TOLERANCE);
  };

  const drawMeasuredGuides = (context: CanvasRenderingContext2D, view: CanvasView): void => {
    const last = calculator.cuts.at(-1);
    if (last) {
      measuredEndpoints().forEach((endpoint) => {
        const point = toCanvas(endpoint.point, view);
        const selected = endpoint.key === measuredStart;
        const hovered = endpoint.key === hoveredMeasuredStart;
        context.save();
        if (hovered) {
          context.beginPath();
          context.arc(point.x, point.y, MEASURED_ENDPOINT_HIT_PX, 0, Math.PI * 2);
          context.lineWidth = 2;
          context.strokeStyle = last.color;
          context.globalAlpha = 0.35;
          context.stroke();
          context.globalAlpha = 1;
        }
        context.beginPath();
        context.arc(point.x, point.y, selected || hovered ? 12 : 10, 0, Math.PI * 2);
        context.fillStyle = selected ? last.color : "#ffffff";
        context.fill();
        context.lineWidth = selected || hovered ? 3 : 2;
        context.strokeStyle = last.color;
        context.stroke();
        context.fillStyle = selected ? "#ffffff" : last.color;
        context.font = "800 11px system-ui";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(endpoint.key === "a" ? "A" : "B", point.x, point.y + 0.5);
        context.restore();
      });
    }

    if (!preview.ok) return;
    const start = toCanvas(preview.cut.a, view);
    const end = toCanvas(preview.cut.b, view);
    const color = COLORS[calculator.nextColor % COLORS.length];
    context.save();
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.setLineDash([9, 7]);
    context.lineWidth = 3;
    context.lineCap = "round";
    context.strokeStyle = color;
    context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.arc(end.x, end.y, 7, 0, Math.PI * 2);
    context.fillStyle = "#ffffff";
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = color;
    context.stroke();
    context.font = "750 12px system-ui";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.lineWidth = 4;
    context.strokeStyle = "#ffffff";
    context.strokeText(`${preview.length.toFixed(3)} cm`, (start.x + end.x) / 2, (start.y + end.y) / 2 - 7);
    context.fillStyle = color;
    context.fillText(`${preview.length.toFixed(3)} cm`, (start.x + end.x) / 2, (start.y + end.y) / 2 - 7);
    context.restore();
  };

  const draw = (): void => {
    const element = canvas;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const view = currentView();
    context.clearRect(0, 0, view.width, view.height);
    drawRemainingShape(context, view);
    drawSelectedMeasurements(context, view);
    calculator.cuts.forEach((_, index) => drawCut(context, index, view));
    drawMeasuredGuides(context, view);

    if (drawStage === "secondPoint" && firstPoint && previewPoint) {
      drawPreviewLine(context, firstPoint, snapSecondPoint(firstPoint, previewPoint), view, COLORS[calculator.nextColor % COLORS.length]);
      const first = toCanvas(firstPoint, view);
      context.beginPath();
      context.arc(first.x, first.y, 5, 0, Math.PI * 2);
      context.fillStyle = COLORS[calculator.nextColor % COLORS.length];
      context.fill();
    }
    if (drawStage === "chooseSide" && pendingLine) {
      drawPreviewLine(context, pendingLine.a, pendingLine.b, view, COLORS[calculator.nextColor % COLORS.length]);
    }
  };

  const resizeCanvas = (): void => {
    const element = canvas;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    element.width = Math.round(rect.width * dpr);
    element.height = Math.round(rect.height * dpr);
    const context = element.getContext("2d");
    context?.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  };

  const clearDrawingState = (): void => {
    drawStage = "idle";
    firstPoint = undefined;
    previewPoint = undefined;
    pendingLine = undefined;
    onInteractionStateChange(false);
    draw();
  };

  const cancelCanvasInteraction = (): void => {
    if (draggingHandle) onCancelEdit();
    drawStage = "idle";
    firstPoint = undefined;
    previewPoint = undefined;
    pendingLine = undefined;
    draggingHandle = false;
    dragIndex = -1;
    dragStart = undefined;
    dragOriginal = undefined;
    isPanning = false;
    panStartCanvas = undefined;
    onInteractionStateChange(false);
    elementCursor(spaceHeld ? "grab" : "crosshair");
    draw();
  };

  const handlePointerMove = (event: PointerEvent): void => {
    const view = currentView();
    const screenPoint = pointerCanvas(event);
    if (isPanning && panStartCanvas) {
      onViewChange({
        ...calculator.view,
        panX: calculator.view.panX + screenPoint.x - panStartCanvas.x,
        panY: calculator.view.panY + screenPoint.y - panStartCanvas.y,
      });
      panStartCanvas = screenPoint;
      return;
    }

    const physical = toPhysical(screenPoint, view);
    previewPoint = physical;
    if (draggingHandle && dragStart && dragOriginal) {
      const normal = lineNormal(dragOriginal);
      if (!normal) return;
      const amount = (physical.x - dragStart.x) * normal.x + (physical.y - dragStart.y) * normal.y;
      const moved = translateCut(dragOriginal, amount);
      if (moved.kind === "some" && dragIndex >= 0) onUpdateCut(dragIndex, moved.value);
      return;
    }

    hoveredMeasuredStart = findMeasuredStart(screenPoint, view);
    hoveredHandle = findHandle(screenPoint, view);
    hoveredLine = hoveredHandle >= 0 ? hoveredHandle : findLine(screenPoint, view);
    hoveredArea = hoveredHandle >= 0 || hoveredLine >= 0 ? -1 : findAreaIndex(calculator.cuts, physical, calculator.settings.diameter / 2);
    if (hoveredMeasuredStart) elementCursor("pointer");
    else if (hoveredHandle >= 0) elementCursor("grab");
    else if (hoveredLine >= 0 || hoveredArea >= 0) elementCursor("pointer");
    else elementCursor("crosshair");
    draw();
  };

  const elementCursor = (cursor: string): void => {
    if (canvas) canvas.style.cursor = cursor;
  };

  const handlePointerLeave = (): void => {
    if (draggingHandle) return;
    hoveredHandle = -1;
    hoveredLine = -1;
    hoveredArea = -1;
    hoveredMeasuredStart = undefined;
    previewPoint = undefined;
    elementCursor("crosshair");
    draw();
  };

  const handlePointerDown = (event: PointerEvent): void => {
    const view = currentView();
    const screenPoint = pointerCanvas(event);
    if (spaceHeld || event.shiftKey || event.button === 1) {
      event.preventDefault();
      isPanning = true;
      panStartCanvas = screenPoint;
      onInteractionStateChange(true);
      canvas?.setPointerCapture(event.pointerId);
      elementCursor("grabbing");
      return;
    }

    const physical = toPhysical(screenPoint, view);
    const measuredStartChoice = findMeasuredStart(screenPoint, view);
    if (measuredStartChoice) {
      onMeasuredStartChange(measuredStartChoice);
      clearDrawingState();
      return;
    }
    const handleIndex = findHandle(screenPoint, view);
    if (handleIndex >= 0) {
      onSelectCut(handleIndex);
      onBeginEdit();
      draggingHandle = true;
      dragIndex = handleIndex;
      dragStart = physical;
      const cut = calculator.cuts[handleIndex];
      dragOriginal = cut ? { a: { ...cut.a }, b: { ...cut.b }, removeSign: cut.removeSign } : undefined;
      drawStage = "idle";
      firstPoint = undefined;
      pendingLine = undefined;
      onInteractionStateChange(true);
      canvas?.setPointerCapture(event.pointerId);
      elementCursor("grabbing");
      onMessage(`Moving cut ${handleIndex + 1}:`, " drag the handle perpendicular to the cut. Measurements and current dosage update live.");
      return;
    }

    const lineIndex = findLine(screenPoint, view);
    if (lineIndex >= 0) {
      onSelectCut(lineIndex);
      clearDrawingState();
      onMessage(`Cut ${lineIndex + 1} selected:`, " drag its colored circular handle to move it, or click empty space to start a new cut.");
      return;
    }

    const areaIndex = findAreaIndex(calculator.cuts, physical, calculator.settings.diameter / 2);
    if (areaIndex >= 0) {
      onSelectCut(areaIndex);
      clearDrawingState();
      onMessage(`Area ${areaIndex + 1} selected:`, " edit its measurements on the right, or drag its numbered cut handle.");
      return;
    }

    if (drawStage === "idle") {
      firstPoint = physical;
      previewPoint = physical;
      drawStage = "secondPoint";
      onInteractionStateChange(true);
      onMessage("New cut:", " click a second point. Near-horizontal and near-vertical cuts snap magnetically.");
      return;
    }

    if (drawStage === "secondPoint" && firstPoint) {
      const snapped = snapSecondPoint(firstPoint, physical);
      if (Math.hypot(snapped.x - firstPoint.x, snapped.y - firstPoint.y) < calculator.settings.diameter * 0.01) return;
      pendingLine = { a: { ...firstPoint }, b: { ...snapped }, removeSign: 1 };
      firstPoint = undefined;
      drawStage = "chooseSide";
      onInteractionStateChange(true);
      onMessage("Choose removed side:", " click anywhere on the side of the dashed line you want removed.");
      return;
    }

    if (drawStage === "chooseSide" && pendingLine) {
      const side = crossProduct(pendingLine.a, pendingLine.b, physical);
      if (Math.abs(side) < 1e-9) return;
      const removeSign = side > 0 ? 1 : -1;
      const before = remainingPolygon(calculator.cuts, calculator.settings.diameter / 2);
      const hits = linePolygonIntersections(pendingLine.a, pendingLine.b, before);
      if (hits.length < 2) {
        clearDrawingState();
        onMessage("Cut misses the current piece:", " click empty space to start another cut.");
        return;
      }
      onAddCut({ ...pendingLine, removeSign });
      clearDrawingState();
    }
  };

  const crossProduct = (a: Point, b: Point, point: Point): number =>
    (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);

  const handlePointerUp = (event: PointerEvent): void => {
    if (isPanning) {
      isPanning = false;
      panStartCanvas = undefined;
      onInteractionStateChange(false);
      canvas?.releasePointerCapture(event.pointerId);
      elementCursor(spaceHeld ? "grab" : "crosshair");
      return;
    }
    if (!draggingHandle) return;
    const completedIndex = dragIndex;
    draggingHandle = false;
    dragIndex = -1;
    dragStart = undefined;
    dragOriginal = undefined;
    onInteractionStateChange(false);
    canvas?.releasePointerCapture(event.pointerId);
    onEndEdit();
    elementCursor("grab");
    onMessage(`Cut ${completedIndex + 1} adjusted:`, " measurements are shown on the right. Click empty space to draw another cut.");
  };

  const handlePointerCancel = (): void => {
    if (draggingHandle) onEndEdit();
    isPanning = false;
    draggingHandle = false;
    dragIndex = -1;
    panStartCanvas = undefined;
    dragStart = undefined;
    dragOriginal = undefined;
    onInteractionStateChange(false);
    draw();
  };

  const handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const view = currentView();
    const screenPoint = pointerCanvas(event);
    const before = toPhysical(screenPoint, view);
    const zoom = Math.max(0.35, Math.min(5, calculator.view.zoom * Math.exp(-event.deltaY * 0.0012)));
    if (Math.abs(zoom - calculator.view.zoom) < 1e-9) return;
    const rect = canvas?.getBoundingClientRect();
    const size = Math.min(rect?.width ?? 0, rect?.height ?? 0);
    const padding = Math.max(30, size * 0.075);
    const baseRadiusPx = (size - padding * 2) / 2;
    const scale = (baseRadiusPx / (calculator.settings.diameter / 2)) * zoom;
    onViewChange({
      zoom,
      panX: screenPoint.x - (rect?.width ?? 0) / 2 - before.x * scale,
      panY: screenPoint.y - (rect?.height ?? 0) / 2 - before.y * scale,
    });
  };

  $effect(() => {
    if (interactionResetToken === appliedInteractionResetToken) return;
    appliedInteractionResetToken = interactionResetToken;
    cancelCanvasInteraction();
  });

  $effect(() => {
    calculator;
    preview;
    measuredStart;
    draw();
  });

  onMount(() => {
    resizeCanvas();
    resizeObserver = new ResizeObserver(resizeCanvas);
    if (wrap) resizeObserver.observe(wrap);
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      clearDrawingState();
      onMessage("Cancelled:", " the unfinished cut was cancelled.");
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("keydown", handleEscape);
    };
  });
</script>

<div
  bind:this={wrap}
  class="canvas-grid relative h-[clamp(420px,68vh,720px)] min-h-[420px] overflow-hidden rounded-2xl ring-1 ring-stone-200 sm:h-[clamp(460px,68vh,720px)]"
>
  <canvas
    bind:this={canvas}
    class="block h-full w-full touch-none"
    aria-label="Round patch cutting canvas"
    onpointermove={handlePointerMove}
    onpointerleave={handlePointerLeave}
    onpointerdown={handlePointerDown}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerCancel}
    onwheel={handleWheel}
  ></canvas>
</div>
