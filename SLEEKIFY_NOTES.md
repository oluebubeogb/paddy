# Paddy — Sleekify pass

The teal-on-warm-stone identity in `globals.css` is kept. This pass changes presentation only: auth logic, API contracts and `src/proxy.ts` routing are unchanged.

## Brand & shell
- `components/brand/paddy-mark.tsx`: an inline SVG Paddy mark (a teal pebble with a sprout and a smile), plus `PaddyLogo` and `PaddyAvatar`. No external assets.
- `components/app/app-shell.tsx`, used by `app/(app)/layout.tsx`:
  - a glass sticky header with the logo
  - desktop pill nav and a mobile bottom tab bar (lucide icons: Chat, Memories, Life, Companion)
  - a theme toggle and sign-out
  - helpers: `PageHeader`, `EmptyState`, `Card`, `Spinner`
- Theme: system, light or dark (`components/theme/*`):
  - the choice is stored in `localStorage["paddy-theme"]`
  - an inline head script prevents a flash of the wrong theme
  - `prefers-color-scheme` is the default
- Viewport: removed `maximumScale` and `userScalable: false`, so pinch-zoom works again. Added `viewportFit: cover` and safe-area padding.
- `globals.css` adds `.glass`, `.paddy-glow`, `.typing-dot` (bounce), `.animate-in` and `.md` (markdown) styles.

## Chat (`app/(app)/chat/page.tsx`)
- Conversation sidebar: a slide-in drawer on mobile.
- Welcome state with starter prompts.
- Assistant bubbles get an avatar. Timestamps only appear on hover.
- An animated "Paddy is typing" indicator.
- Safe markdown for assistant messages:
  - built on `react-markdown` with `skipHtml`, so no raw HTML
  - links open with `noopener noreferrer nofollow`
  - images render as their alt text only
- Composer:
  - rounded, with a focus ring and auto-grow
  - Enter sends, but not during IME composition
  - the send icon is an arrow
  - if a send fails, the text is restored to the input

## Auth (`app/(auth)/*`)
- `components/auth/auth-shell.tsx` is shared by sign-in, sign-up, forgot, verify, reset, phrase and onboarding.
- Shell elements: the mark, a soft glow, a glass card, inline `FormError`, `FieldLabel` and a theme toggle.
- `PhraseCard` gets a gradient card and copy icons, and fires a "Phrase copied!" toast.
- Onboarding gets a 5-segment progress bar and a radio-card relationship picker.
- Sign-in gets a show/hide password toggle.
- The landing page gets the logo, a glass header, the hero mark and the theme toggle.

## Companion / Memories / Life
- The same shell, a `PageHeader` with lucide icons, and consistent card spacing.
- Warm empty states.
- Toast feedback for every action (`components/ui/toast.tsx`).
- Memories: search debounced at 300 ms and category pills.
- Companion: a proper switch control and relationship radio cards.
- Life: separate sections for check-ins, upcoming events, goals and past events.

## Hygiene
- Fixed all `npm run lint` errors:
  - set-state-in-effect warnings in the app pages
  - an impure `Date.now()` during render in chat
  - `any` casts in the messages, events and goals APIs
  - unused vars in the health and memories APIs
- Two warnings remain, in untouched lib files (`memory/store.ts`, `proactive/follow-ups.ts`).
- `npm run build` passes, `tsc` is clean and all 15 tests pass.
- Smoke test against the standalone server:
  - the public and auth pages return 200
  - `/chat` redirects (307) to `/sign-in?from=/chat`
- New dependency: `react-markdown`.

## Known gaps
- The signed-in pages (chat, memories, life, companion) were not checked visually in a browser, because there is no database or session on the build box.
- The Docker image build has not been run here.
- `PaddyMark` uses the same SVG gradient id in every instance. This is harmless because the definitions are identical.
