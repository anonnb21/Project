# IRIS visual design QA

- Source visual truth: local user-supplied `design-reference/gradient-ui-kit.jpg` (excluded from Git distribution)
- Primary implementation evidence: `design-reference/iris-dashboard.png`
- Additional implementation evidence: `design-reference/iris-login-final.png`, `design-reference/iris-editor.png`, `design-reference/iris-editor-mobile.png`, `design-reference/iris-share-dialog.png`
- Combined comparison: `design-reference/qa-comparison-dashboard.jpg`
- Iteration comparison: `design-reference/qa-comparison-login-iteration.jpg`
- Desktop viewport: 1440 × 900 CSS px at device scale 1
- Mobile viewport: 390 × 844 CSS px at device scale 1
- Source pixels: 1920 × 1280; normalized with aspect-preserving contain to 1350 × 900 inside a 1440 × 900 comparison panel
- Implementation pixels: 1440 × 900 desktop and 390 × 844 mobile
- State: authenticated dashboard, authenticated editable map, access dialog, unauthenticated sign-in, and mobile editor

## Findings

No actionable P0, P1, or P2 differences remain.

The source is a component-system board rather than an application screen, so the comparison evaluates design-language fidelity rather than identical page geometry. IRIS preserves the source system's Montserrat typography, high-saturation gradient actions and headers, white rounded cards, soft multi-layer elevation, compact outlined inputs, icon-led controls, and warm neutral canvas. The requested product adaptation intentionally maps the source blue-purple gradient to ember, crimson, and colony burgundy.

### Required fidelity surfaces

- Fonts and typography: local Montserrat 400/500/600/700/800 files match the source family. Headings use the source's strong geometric weight and tight tracking; small labels remain readable and consistently uppercased.
- Spacing and layout rhythm: cards use 23–28 px radii, generous interior padding, and layered shadows consistent with the kit. Dashboard density is deliberately lower than the component sheet to support map scanning.
- Colors and visual tokens: white surfaces, warm blush canvas, coral-to-crimson-to-burgundy gradients, muted rose borders, and semantic green presence status are coherent and accessible.
- Image quality and asset fidelity: the source does not require photographic or illustrative assets. UI symbols use the locally served Phosphor icon font rather than text glyphs or emoji. The supplied raster is used only as design reference and is not stretched into the product UI.
- Copy and content: all visible copy is IRIS-specific and supports authentication, mind-map management, collaboration, OPML interchange, and access control.

## Focused region evidence

- Sign-in card: compared at 1440 × 900 before and after the spacing correction in `qa-comparison-login-iteration.jpg`.
- Access dialog: verified in `iris-share-dialog.png`; gradient header accent, input grouping, member hierarchy, and owner state follow the shared card system.
- Editor: verified in `iris-editor.png`; the root node uses the same red gradient and elevation language while secondary nodes remain clear white cards.
- Mobile editor: verified at 390 × 844 in `iris-editor-mobile.png`; no document-level horizontal overflow, primary share action remains visible, and edit tools collapse into a bottom floating tray.

## Comparison history

### Pass 1

- [P2] The account-switch line beneath the sign-in button was visually crowded.
  - Fix: added a dedicated 16 px top margin to the authentication footer.
  - Post-fix evidence: `design-reference/iris-login-final.png` and `design-reference/qa-comparison-login-iteration.jpg`.

### Pass 2

- The earlier P2 is resolved. No new P0/P1/P2 findings were visible in the dashboard, sign-in, editor, sharing, or mobile states.

## Interaction and runtime checks

- Tested sign-in, dashboard loading, map-card navigation, editor loading, and opening the sharing dialog.
- Verified the existing node editing/autosave behavior remains wired through the redesigned controls.
- Browser console errors and warnings checked: none.
- Automated OPML tests and JavaScript syntax checks pass.

## Follow-up polish

- [P3] A future brand pass could replace the typographic `I` monogram with a commissioned IRIS/ant-colony logo without changing the current layout.

final result: passed
