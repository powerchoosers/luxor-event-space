# Luxor Owner Portal: Phone & Voicemail Redesign Specification

> **Vision**: Transform `/portal/calls` into a native-feeling phone experience inspired by Apple iOS and Android Phone apps, scaled elegantly across Mobile, iPad (Tablet split-view), and Desktop.
>
> **Core Capabilities**:
> - Seamless voicemail playback & call recording playback
> - Dual-track call transcription with clickable timestamp jumping
> - Elena AI call summaries with auto-detected action items
> - Shared React audio player component across the entire owner portal

---

## 1. Visual Mockups by Device

### A. Mobile Experience (iPhone & Android Phone App Style)

On mobile devices, the interface mirrors the clean, tactile hierarchy of native phone dialers:
- **Top Segmented Switch**: Rapid switching between **All Recents**, **Missed**, and **Voicemail** with unread count badges.
- **Instant Search**: Search by caller name, number, or keywords in transcripts.
- **Contact Row**: Contact name (or formatted phone number if new lead), call direction icon (blue incoming, green outgoing, red missed), and relative timestamp.
- **Inline Audio Scrubber**: Tap any voicemail or recorded call to reveal an inline waveform player, Elena AI summary chip, and one-tap **Call Back** or **Text** buttons.
- **Bottom Navigation**: Persistent bottom bar with Recents, Voicemails, and floating softphone dialer.

![Mobile Phone & Voicemail Mockup](C:/Users/lewis/.gemini/antigravity/brain/c3665a4a-d650-4091-9517-44132f0f685d/luxor_phone_voicemail_mobile_ui_1793733724482.jpg)

---

### B. iPad / Tablet Experience (iPadOS Split-View Master-Detail)

On tablets (768px – 1024px), the screen adopts an iPadOS master-detail split layout:
- **Left Master List**: Filterable call feed with active item highlight, duration badges, and bulk actions.
- **Right Call Inspector**:
  - **Header & Quick Actions**: Call Back, Send SMS, and direct link to the matched Luxor CRM lead.
  - **Shared React Audio Player**: Gold play/pause control, waveform visualizer with hover scrubber, speed toggle (1x, 1.25x, 1.5x, 2x), and skip `-10s` / `+10s`.
  - **Elena AI Call Summary**: Instant extraction of guest count, proposed event dates, budget, and follow-up checklist.
  - **Synced Transcript**: Dual-track dialogue (`Arianna (Luxor)` vs client) with words highlighted as audio plays.

![iPad Split-View Mockup](C:/Users/lewis/.gemini/antigravity/brain/c3665a4a-d650-4091-9517-44132f0f685d/luxor_phone_voicemail_ipad_ui_1793734025815.jpg)

---

### C. Desktop Experience (High-Density Multi-Pane Workspace)

On desktop (1024px+), the interface expands into an executive command center:
- **Top KPI Row**: 6 live metrics (`All Calls`, `Inbound`, `Outbound`, `Missed`, `Voicemail`, `Recordings`).
- **Left Column**: High-density list with search, pill filters, bulk selection bar, and call type icons.
- **Right Inspector**:
  - Full-featured **React Audio Player** with high-resolution waveform, precise scrubbing, audio download, and volume controls.
  - **Elena AI Intelligence**: Actionable call summaries, key requirements, objections, and next steps.
  - **Interactive Timestamped Transcript**: Clicking any transcript turn jumps the audio player to that exact second.
  - **Lead Linking & Notes**: Instant update of call outcome, internal notes, and synchronization with CRM inquiries.

![Desktop Calls & Voicemail Mockup](C:/Users/lewis/.gemini/antigravity/brain/c3665a4a-d650-4091-9517-44132f0f685d/luxor_owner_portal_calls_voicemails_1793734031881.jpg)

---

## 2. Shared React Audio Player Component

To replace raw HTML5 `<audio controls>` across the portal, we created:
`src/components/portal/PortalAudioPlayer.tsx`

### Key Features
1. **100% Custom React UI**: No clunky native browser player styling. Fully themed with Luxor luxury tokens (`#caa24c` gold, `--portal-card`, `--portal-soft`, `--portal-border`).
2. **Dynamic Waveform Visualizer**: Generates dynamic audio bars that fill with gold gradient as audio advances. Clicking or dragging anywhere on the waveform seeks accurately.
3. **Multi-Speed Toggle**: Cycles through `1x` → `1.25x` → `1.5x` → `2x`.
4. **Skip Controls**: One-tap jump back 10 seconds (`RotateCcw`) and forward 10 seconds (`RotateCw`).
5. **Transcript Synchronization**: Accepts `onTimeUpdate(currentTime, duration)` to sync transcripts and `seekToSeconds` to jump playback when a transcript line is clicked.
6. **Variants**:
   - `'full'`: Rich card with header, waveform, timers, transport buttons, speed pill, volume slider, and download button.
   - `'compact'` / `'inline'`: Slim horizontal strip perfect for list rows and mobile expanded items.
   - `'voicemail-card'`: Highlighted luxury card with gold tint for voicemail recordings.

### Example Usage
```tsx
import { PortalAudioPlayer } from '@/components/portal/PortalAudioPlayer'

// Voicemail card
<PortalAudioPlayer
  variant="voicemail-card"
  src={`/api/twilio/recordings/${call.recording_sid}`}
  title="Voicemail Recording"
  subtitle={`${call.contact_name || 'Unknown'} · ${formatDuration(call.duration_seconds)}`}
  durationSeconds={call.recording_duration_seconds}
  downloadFilename={`voicemail-${call.id}.mp3`}
  onTimeUpdate={(curr) => setActiveTranscriptTime(curr)}
  seekToSeconds={targetSeekTime}
/>
```

---

## 3. Implementation Plan for `/portal/calls`

1. **State & Filter Modernization**:
   - Implement native phone segmented bar (`All`, `Missed`, `Voicemail`, `Recordings`).
2. **Mobile Layout (`<768px`)**:
   - Single list view with bottom navigation bar and expandable card drawer.
   - Instant playback directly in the row without losing place.
3. **Tablet Layout (`768px - 1023px`)**:
   - Split 2-pane view with smooth transitions.
4. **Desktop Layout (`>= 1024px`)**:
   - Fixed viewport height (`calc(100vh - 14rem)`), dual independently scrollable panes with sticky header and audio dock.
5. **AI Summaries & Transcripts**:
   - Display Elena AI summary badges and dual-track dialog boxes with timestamp seek triggers.
