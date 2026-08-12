# IRIS mind-map editor handoff

Last updated: 2026-08-12

## Current state

The original fixed SVG tree has been upgraded into a responsive mind-map editor while keeping IRIS self-hosted and dependency-light. Mind-map documents now normalize to schema version 5. Existing trees and ordinary OPML remain supported.

Implemented editor behavior:

- HTML topic layer with SVG connectors, variable topic sizes, multiline wrapping, canvas pan/zoom, fit-map, and fit-selection.
- Drag-to-create shapes plus subtree reorder and reparent with invalid-cycle/root protection.
- Inline editing with double-click or `F2`, keyboard navigation, branch collapse with `Space`, and nearest surviving selection after delete.
- `Ctrl/Cmd+Click`, selection marquee, and branch selection for multi-select workflows.
- Canvas and editable/read-only relationship-table views backed by the same command model.
- Outline copy/paste with indentation-aware `Tab`, batch commands, undo/redo, autosave, optimistic-conflict replay, and live announcements.
- Topic format panel for shape, topic/text colors, text size, emphasis, and alignment; child creation inherits parent colors.
- Logic Tree, Spider Diagram, Top-down Tree, and Org Chart layouts.
- Map-level connector settings: Smart, Straight, Curved, and Elbow 90-degree paths; optional arrowheads; three line weights; branch-following or custom colors.
- OPML round trips for supported IRIS metadata, with safe defaults for legacy or unknown fields.

## Connector decisions

- `Smart` resolves to curved connectors for Logic Tree, Spider Diagram, and Top-down Tree, and elbow connectors for Org Chart.
- Connector endpoints are anchored at topic-box boundaries rather than their centers.
- Connector preferences are document-level in this release. Per-branch overrides and arbitrary cross-links are intentionally not implemented.
- Arrow markers use fixed screen-space sizing so bold connectors do not produce oversized arrowheads.

## Architecture entry points

- `public/editor-model.js`: normalization, validation, commands, undo inverses, replay helpers, and visible-tree utilities.
- `public/app.js`: editor state, rendering, interactions, autosave, presence, table synchronization, layout, and connector geometry.
- `public/index.html` and `public/styles.css`: editor controls, canvas/table/format UI, responsive behavior, and accessibility structure.
- `src/tree.js`: new-document defaults.
- `src/opml.js`: OPML import/export and optional IRIS attributes.
- `test/editor-model.test.js` and `test/opml.test.js`: behavior, compatibility, and metadata regression coverage.

## Verification snapshot

Completed on 2026-08-12:

- `npm run check`: passed.
- `npm test`: 21 tests passed.
- `git diff --check`: passed; Git only reported the repository's LF-to-CRLF conversion warnings.
- Browser matrix: all four layouts crossed with all four connector styles; 16 edges and 17 topics rendered in every case with no detected topic overlap.
- Arrowhead, bold-weight, custom-color, autosave, and reload states were visually exercised.
- Responsive check at 390 x 844: no horizontal document overflow; the format drawer fits at 280 px and its connector grid at 227 px.

Repository-level Bash checks from `AGENTS.md` were not run because Bash is unavailable on the current Windows host. Run these when a Bash environment is available:

```bash
bash -n scripts/*.sh
./scripts/doctor.sh --repo-only
```

## Recommended next work

1. Add per-branch connector overrides only if users need mixed connector semantics in one map.
2. Add browser regression tests for connector controls, keyboard/table synchronization, touch drag, and conflict resolution.
3. Profile large visible trees around 500 topics and debounce layout measurement further if needed.
4. Before any deployment, read the repository `SECURITY.md`; do not store credentials or production data in Git.
