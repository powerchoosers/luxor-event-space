# Design QA — Lead next step and tour invite modal

- Source visual truth:
  - `C:/Users/Lap3p/AppData/Local/Temp/codex-clipboard-ef12a9b9-73fc-45cb-ab08-9b0dd05fa63d.png`
  - `C:/Users/Lap3p/AppData/Local/Temp/codex-clipboard-378b30cc-60a4-47cb-a760-7917018f8301.png`
- Implementation route: `/portal/leads/[id]`
- Intended viewport: desktop, matching the supplied captures
- State: inquiry-stage next-step bar and open tour-scheduling modal

## Full-view comparison evidence

The supplied source captures were opened at original resolution. The implementation could not be captured because the in-app browser runtime failed to connect before page navigation. The failure occurred in the browser-control runtime itself, not in the Luxor application.

## Focused comparison evidence

Focused rendered comparison is unavailable for the same browser-runtime blocker. Code inspection confirms the requested structural changes: the Contract action is removed from the inquiry next-step bar, the two tour actions are present, and the modal uses a constrained scroll region plus a fixed footer inside the dialog.

## Findings

- [P1] Browser-rendered modal and button-state verification unavailable.
  - Location: inquiry next-step bar and tour scheduling modal.
  - Evidence: no post-change implementation screenshot could be captured.
  - Impact: scrolling, sticky footer placement, and responsive wrapping cannot be visually certified from code alone.
  - Fix: reconnect the in-app browser and capture the open modal at the supplied desktop viewport, then test the disabled and ready-to-send states.

## Required fidelity surfaces

- Fonts and typography: existing portal typography classes were preserved; rendered comparison blocked.
- Spacing and layout rhythm: existing card/modal tokens were preserved; rendered comparison blocked.
- Colors and visual tokens: existing Luxor gold, portal borders, and dark surfaces were reused.
- Image quality and asset fidelity: the existing event-type image selector and image rendering were preserved.
- Copy and content: updated to “Schedule Tour & Invite,” “Tour Scheduled Offline,” and a persistent “Send Invite & Schedule” footer action.

## Comparison history

- Initial source finding: Contract was offered too early and the modal footer/send action was clipped below the viewport.
- Fixes made: replaced Contract with the two requested tour paths; split the modal into fixed header, scrollable body, and fixed action footer; added disabled-state guidance.
- Post-fix visual evidence: blocked by the in-app browser runtime connection failure.

## Implementation checklist

- [x] Remove Contract from the inquiry-stage next-step bar.
- [x] Open the calendar modal from the next-step bar.
- [x] Provide a no-invite manual advancement path.
- [x] Keep modal actions visible while the content scrolls.
- [x] Disable sending until client email, tour date, and start time exist.
- [x] Pass TypeScript and lint validation.
- [ ] Capture and compare the rendered implementation when browser control is available.

final result: blocked
