# Design QA — Messages new-conversation pane

- Source visual truth: `C:/Users/Lap3p/AppData/Local/Temp/codex-clipboard-df6cd7c1-4c36-4229-82ed-2df08dc8591f.png`
- Implementation route: `/portal/messages`
- Intended viewport: desktop, 1828 × 874 reference
- State: New conversation recipient search open

## Full-view comparison evidence

The Google Messages reference was opened at original resolution. The Luxor implementation could not be captured because the in-app browser runtime failed before navigation. This was a browser-control runtime failure rather than an application error.

## Focused comparison evidence

Rendered comparison is unavailable for the same browser-runtime blocker. Code inspection confirms the requested interaction: the left conversation rail remains present while recipient search replaces the right thread pane; line selection is housed in a separate overflow menu beside New.

## Findings

- [P1] Browser-rendered interaction verification unavailable.
  - Location: `/portal/messages`, New button, both overflow menus, and right-side recipient search.
  - Evidence: no post-change implementation screenshot could be captured.
  - Impact: exact responsive sizing and hover brightness cannot be visually certified from code alone.
  - Fix: reconnect the in-app browser and capture the New conversation state plus both overflow-menu hover/open states.

## Required fidelity surfaces

- Fonts and typography: existing Luxor portal typography is intentionally preserved rather than copying Google branding; rendered comparison blocked.
- Spacing and layout rhythm: the reference's persistent left rail/right compose pane structure is implemented; rendered comparison blocked.
- Colors and visual tokens: existing Luxor black, zinc, and gold tokens are preserved.
- Image quality and asset fidelity: no new raster assets are required; existing contact avatars remain in use.
- Copy and content: the right pane uses “New conversation,” a “To:” field, contact search, and matching-contact results.

## Comparison history

- Initial mismatch: New Message appeared as a centered modal and the number selector occupied permanent rail space.
- Fixes made: replaced the modal with the right-side compose pane, moved line selection into an overflow menu, and removed idle borders from both three-dot triggers while adding brighter hover containers.
- Post-fix visual evidence: blocked by the in-app browser runtime connection failure.

## Implementation checklist

- [x] Keep the conversation rail visible while starting a message on desktop.
- [x] Render recipient search in the thread pane.
- [x] Move business-number selection beside New in an overflow menu.
- [x] Remove idle borders from both overflow buttons.
- [x] Add brighter hover backgrounds and icon colors.
- [x] Pass TypeScript, lint, and whitespace validation.
- [ ] Capture and compare the rendered implementation when browser control is available.

final result: blocked
