# Round Patch Cut Calculator

An interactive calculator for planning straight cuts on a round patch. Each cut owns one area, and the calculator links area, dosage, and cut length.

## Live site

[Open the calculator](https://bilderloong.github.io/round-patch-cut-calculator/)

## Features

- Uses a default patch area of 30 cm² and a labeled full-patch dosage of 21 mg.
- Starts Cut 1 from a measured length or dosage. Cut 1 is a centered horizontal top cap.
- Continues measured cuts from End A or End B of the previous cut.
- Chooses a reachable direction automatically for later measured cuts.
- Rounds a measured cut length to the nearest 0.1 cm.
- Lets you draw manual cuts, choose the removed side, select each colored area, edit dosage/area/length, drag handles, and delete cuts.
- Supports undo, right-click undo, keyboard deletion, snapping, canvas panning, and zooming.

## Run locally

Install Bun, then run:

```sh
bun install
bun run dev
```

To check the project, run:

```sh
bun run check
bun test
bun run build
```

## Architecture

The application is a Svelte 5 and Vite TypeScript app. Tailwind CSS v4 is loaded through `@tailwindcss/vite`.

- `src/lib/calculator/geometry.ts` contains pure circle geometry, polygon clipping, measured-cut solving, and measurement adjustment functions.
- `src/lib/calculator/state.ts` contains immutable calculator state transitions and undo snapshots.
- `src/lib/ui/Canvas.svelte` owns canvas drawing and browser pointer/wheel effects.
- `src/lib/ui/Controls.svelte`, `MeasuredPanel.svelte`, and `Sidebar.svelte` contain the meaningful UI regions.
- `src/App.svelte` coordinates state, user actions, keyboard safety, and context-menu undo.

The Vite base path is `/round-patch-cut-calculator/` for GitHub Pages. The workflow in `.github/workflows/deploy-pages.yml` builds with Bun and deploys `dist`.

## Important note

This calculator performs geometry and an area-proportional dosage calculation only. It does not determine a medically appropriate dose. Follow the product instructions and advice from a qualified healthcare professional.
