# Jarvis Voice Sight UI / UX Specification

# Design Target: Apple × OpenAI Quality

Status: Canonical UI / UX specification

Recorded date: 2026-06-10

Repository: `jarvis-voice-sight`

## 1. UI Goal

The interface must feel premium, calm, minimal, and intelligent.

This is not a developer dashboard.
This is a voice-first AI companion interface.

The user should feel:

```text
quiet
focused
safe
high-end
responsive
alive
```

The UI must look closer to Apple, OpenAI, and Humane-style product pages than a typical hackathon demo.

# 2. Core Design Principle

Use fewer elements.

Every screen should answer only three questions:

```text
Is Jarvis listening?
What did Jarvis hear?
What did Jarvis say?
```

Everything else is secondary.

# 3. Visual Direction

## 3.1 Overall Style

Use:

```text
soft dark background
large empty space
glassmorphism cards
subtle gradients
thin borders
smooth motion
high-quality typography
minimal text
premium spacing
```

Avoid:

```text
bright toy colors
developer-style boxes
busy dashboards
tables
raw JSON
heavy borders
cheap shadows
emoji-heavy UI
```

# 4. Color System

## Background

```css
--bg-main: #08090C;
--bg-surface: rgba(255, 255, 255, 0.06);
--bg-surface-strong: rgba(255, 255, 255, 0.10);
```

## Text

```css
--text-primary: #F5F5F7;
--text-secondary: rgba(245, 245, 247, 0.68);
--text-tertiary: rgba(245, 245, 247, 0.42);
```

## Accent

Use a cool blue-white intelligence accent.

```css
--accent: #A7C7FF;
--accent-strong: #D7E6FF;
--accent-muted: rgba(167, 199, 255, 0.16);
```

## Status

```css
--listening: #A7C7FF;
--thinking: #C9B8FF;
--speaking: #B7F7D4;
--error: #FF9A9A;
```

# 5. Typography

Use system fonts first.

```css
font-family:
  -apple-system,
  BlinkMacSystemFont,
  "SF Pro Display",
  "SF Pro Text",
  "Inter",
  "Noto Sans TC",
  sans-serif;
```

## Type Scale

Hero title:

```css
font-size: 56px;
font-weight: 600;
letter-spacing: -0.04em;
```

Subtitle:

```css
font-size: 18px;
font-weight: 400;
line-height: 1.6;
color: var(--text-secondary);
```

Transcript:

```css
font-size: 22px;
font-weight: 400;
line-height: 1.5;
```

Jarvis reply:

```css
font-size: 32px;
font-weight: 500;
letter-spacing: -0.02em;
```

Small metadata:

```css
font-size: 13px;
font-weight: 400;
color: var(--text-tertiary);
```

# 6. Main Layout

Desktop layout:

```text
┌──────────────────────────────────────────────┐
│ Jarvis Voice Sight                            │
│ Real-time voice companion                     │
│                                              │
│              [Orb / Voice Core]              │
│                                              │
│         "You can speak when ready."          │
│                                              │
│     User transcript card                     │
│     Jarvis response card                     │
│                                              │
│              [Hold to Speak]                 │
│                                              │
│     latency · emotion · session state        │
│     Jason Lin · NYCU · v0.2 · system stack   │
└──────────────────────────────────────────────┘
```

Mobile layout:

```text
Top:
Jarvis Voice Sight

Center:
Voice orb

Below:
Jarvis reply

Bottom:
Hold to Speak button
```

The voice orb is the emotional center of the product.

# 7. Voice Orb

## Purpose

The orb represents Jarvis' current state.

States:

```text
IDLE
LISTENING
TRANSCRIBING
THINKING
SPEAKING
ERROR
```

## Visual Behavior

IDLE:

```text
soft glow
slow breathing animation
```

LISTENING:

```text
larger glow
waveform ring reacts to microphone input
```

TRANSCRIBING:

```text
thin rotating ring
```

THINKING:

```text
slow pulsing gradient
```

SPEAKING:

```text
audio-reactive pulse
```

ERROR:

```text
soft red glow
no harsh warning UI
```

# 8. Copywriting

The UI text must be short, quiet, and premium.

Do not use:

```text
Start recording now!!!
AI is thinking...
Error occurred!!!
```

Use:

```text
Speak when ready.
Listening.
Thinking.
I heard this.
Jarvis replied.
Connection softened. Try again.
```

Main title:

```text
Jarvis Voice Sight
```

Subtitle:

```text
A real-time voice companion that listens, thinks, and responds.
```

Idle microcopy:

```text
Speak when ready.
```

Listening:

```text
Listening.
```

Thinking:

```text
Thinking.
```

Speaking:

```text
Speaking.
```

Error:

```text
Something faded. Try again.
```

Button labels:

```text
Hold to Speak
Release to Send
Try Again
```

# 9. Components

## 9.1 AppShell

Responsibilities:

1. Page background
2. Centered layout
3. Global typography
4. Responsive container

## 9.2 VoiceOrb

Props:

```ts
type VoiceState =
  | "IDLE"
  | "LISTENING"
  | "TRANSCRIBING"
  | "THINKING"
  | "SPEAKING"
  | "ERROR";

type VoiceOrbProps = {
  state: VoiceState;
  level?: number;
};
```

## 9.3 TranscriptCard

Props:

```ts
type TranscriptCardProps = {
  transcript?: string;
  placeholder?: string;
};
```

Text:

```text
I heard this.
```

## 9.4 JarvisReplyCard

Props:

```ts
type JarvisReplyCardProps = {
  reply?: string;
  emotion?: EmotionLabel;
};
```

Text:

```text
Jarvis replied.
```

## 9.5 HoldToSpeakButton

Props:

```ts
type HoldToSpeakButtonProps = {
  state: VoiceState;
  onPressStart: () => void;
  onPressEnd: () => void;
};
```

## 9.6 StatusStrip

Props:

```ts
type StatusStripProps = {
  latencyMs?: number;
  emotion?: EmotionLabel;
  sessionState?: string;
};
```

Example:

```text
1.42s · anxious · session active
```

## 9.7 SystemStack

Purpose:

Show the demo's product identity and technical choices without turning the UI
into a developer dashboard.

Required content:

```text
Jason Lin · NYCU
Jarvis Voice Sight
v0.2
Insurance voice coach
Breeze-ASR-25
Gemma 4 E2B int4
BreezyVoice
RTX 4090 Laptop GPU
```

Visual rules:

```text
small metadata typography
glass surface
thin divider
no raw JSON
no logs
no tables
no loud badges
```

Placement:

```text
At the bottom of the screen as a compact metadata rail.
Keep it visually quieter than the voice orb.
Never use it as a large dashboard panel.
```

# 10. Motion Design

Use Framer Motion.

Animation principles:

```text
slow
subtle
physical
no bouncing toy effects
```

Durations:

```text
fast: 120ms
normal: 240ms
slow: 800ms
breathing: 3000ms
```

Hover:

```text
slight lift
slight glow
```

Press:

```text
scale 0.98
```

State transition:

```text
crossfade + scale
```

# 11. Frontend File Structure

```text
apps/web/
  src/
    app/
      page.tsx
      layout.tsx
      globals.css
    components/
      AppShell.tsx
      VoiceOrb.tsx
      TranscriptCard.tsx
      JarvisReplyCard.tsx
      HoldToSpeakButton.tsx
      StatusStrip.tsx
    hooks/
      useVoiceRecorder.ts
      useVoiceTurn.ts
      useAudioPlayback.ts
    lib/
      api.ts
      types.ts
      constants.ts
```

# 12. Frontend Behavior

## v0.1

1. User holds button.
2. UI state changes to `LISTENING`.
3. User releases button.
4. UI state changes to `TRANSCRIBING`.
5. Client sends audio to `/api/v1/voice-turn`.
6. UI shows transcript.
7. UI state changes to `THINKING`.
8. UI shows Jarvis reply.
9. Audio plays.
10. UI state changes to `SPEAKING`.
11. Playback ends.
12. UI returns to `IDLE`.

## v0.2

If emotion is returned:

1. Show emotion quietly in StatusStrip.
2. Do not make emotion visually loud.
3. Slightly adjust orb glow.
4. Keep main UI minimal.

# 13. Design Quality Bar

The UI is accepted only if:

1. It does not look like a dashboard.
2. It does not show raw JSON.
3. It has one clear visual center.
4. The voice orb clearly shows state.
5. Text is short and polished.
6. The layout works on desktop and mobile.
7. The button feels like a premium control.
8. Motion feels subtle.
9. Empty states look intentional.
10. Error states are calm.

# 14. Codex Goal Prompt Addition

Add the following instruction to the existing Codex prompt:

Build a premium voice-first UI for `apps/web`.

The UI must look like a refined Apple/OpenAI-style product prototype.
It must be minimal, dark, spacious, calm, and high-end.

Do not create a developer dashboard.
Do not show raw JSON.
Do not use generic Tailwind demo cards.
Do not use loud colors or emoji-heavy UI.

Implement:

1. `AppShell`
2. `VoiceOrb`
3. `TranscriptCard`
4. `JarvisReplyCard`
5. `HoldToSpeakButton`
6. `StatusStrip`
7. `useVoiceRecorder`
8. `useVoiceTurn`
9. `useAudioPlayback`

Use:

1. Next.js
2. TypeScript
3. Tailwind CSS
4. Framer Motion
5. CSS variables for design tokens

Main page must include:

1. Product title: `Jarvis Voice Sight`
2. Subtitle: `A real-time voice companion that listens, thinks, and responds.`
3. Center voice orb
4. Short state text
5. Transcript card
6. Jarvis reply card
7. Hold-to-speak button
8. Quiet latency/emotion/session status strip

Voice states:

```ts
type VoiceState =
  | "IDLE"
  | "LISTENING"
  | "TRANSCRIBING"
  | "THINKING"
  | "SPEAKING"
  | "ERROR";
```

State copy:

```ts
const STATE_COPY = {
  IDLE: "Speak when ready.",
  LISTENING: "Listening.",
  TRANSCRIBING: "I heard this.",
  THINKING: "Thinking.",
  SPEAKING: "Speaking.",
  ERROR: "Something faded. Try again."
};
```

Design tokens:

```css
:root {
  --bg-main: #08090C;
  --bg-surface: rgba(255, 255, 255, 0.06);
  --bg-surface-strong: rgba(255, 255, 255, 0.10);

  --text-primary: #F5F5F7;
  --text-secondary: rgba(245, 245, 247, 0.68);
  --text-tertiary: rgba(245, 245, 247, 0.42);

  --accent: #A7C7FF;
  --accent-strong: #D7E6FF;
  --accent-muted: rgba(167, 199, 255, 0.16);

  --listening: #A7C7FF;
  --thinking: #C9B8FF;
  --speaking: #B7F7D4;
  --error: #FF9A9A;
}
```

Typography:

```css
body {
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "SF Pro Display",
    "SF Pro Text",
    "Inter",
    "Noto Sans TC",
    sans-serif;
}
```

Main layout:

```text
Full-screen dark canvas.
Centered max-width container.
Hero title at top.
Voice orb in center.
Reply card below orb.
Transcript card below reply.
Hold-to-speak button at bottom center.
Status strip below button.
```

Motion:

Use Framer Motion.

Orb:

* idle: slow breathing glow
* listening: stronger glow and ring pulse
* transcribing: rotating thin ring
* thinking: slow gradient pulse
* speaking: audio pulse
* error: soft red glow

Button:

* hover: slight lift
* press: scale 0.98
* disabled: muted

Cards:

* glassmorphism
* thin white border
* blur background
* subtle enter animation

Acceptance criteria:

1. The UI looks premium.
2. The UI works on desktop and mobile.
3. It supports mock mode.
4. It connects to `/api/v1/voice-turn`.
5. It handles all states.
6. It plays audio if `audio_url` exists.
7. It shows transcript and Jarvis reply.
8. It never shows raw backend JSON to the user.
9. It keeps copy short and polished.
10. It passes lint and typecheck.

你要的是「明天讓老闆一看覺得這不是玩具」。所以 UI 一定要做成 voice product，不要做成工程 demo。
