# Design QA — Lead next step and tour invite modal

- Source visual truth:
  - `C:/Users/Lap3p/AppData/Local/Temp/codex-clipboard-fad6d731-c4b5-477b-8efa-1fef1d9c9f84.png`
  - `C:/Users/Lap3p/AppData/Local/Temp/codex-clipboard-932766f4-d3cd-4c9e-a2e7-5444aff5ff8f.png`
- Implementation route: `/portal/leads/[id]`
- Intended viewport: desktop, matching the supplied captures
- State: inquiry-stage next-step bar and open tour-scheduling modal

## Full-view comparison evidence

The supplied source captures were opened at original resolution. The implementation could not be captured because the in-app browser runtime failed to connect before page navigation. The failure occurred in the browser-control runtime itself, not in the Luxor application.

## Focused comparison evidence

Focused rendered comparison is unavailable for the same browser-runtime blocker. Code inspection confirms the compact structure: the primary action reads “Schedule Invite,” and the adjacent 40px checkmark button advances the lead without sending an invitation.

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
- Copy and content: the next-step actions are reduced to “Schedule Invite” and an accessible checkmark-only advance action. The modal retains its persistent “Send Invite & Schedule” footer action.

## Comparison history

- Initial source finding: the two labeled tour buttons consumed too much horizontal space and squeezed the Next Step copy into a narrow column.
- Fixes made: shortened the primary label to “Schedule Invite” and reduced the manual advancement control to a 40px checkmark button with tooltip and accessible label.
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
