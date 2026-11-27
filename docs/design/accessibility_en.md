# Keyboard and Accessibility

> 中文原文：[accessibility.md](accessibility.md)
>
> Status: Base implemented with VCode keyboard interaction · Last updated: 2026-11-26

## Goals

All core operations can be completed without a mouse; keyboard focus is never lost and never enters an invisible area. After a dialog opens, the background cannot receive focus, and closing it returns focus to the trigger.

## Focus order

The page starts from the top:

1. **Skip to main content**: the first focusable element on the page; pressing Enter moves focus to `<main id="workspace-main">`.
2. The currently selected top-bar tab (Projects / Components / Settings).
3. Theme switcher, language menu, sign-in / user menu.
4. Primary actions inside the current panel (such as sign-in / sign-up).
5. The browser's default focus cycle.

Top-bar tabs, the Sign in / Sign up tabs inside the auth dialog, and language menu options all remain in the Tab sequence, so compact keyboards or keyboards without arrow keys can operate everything; the left and right arrow keys are a shortcut and do not replace Tab reachability.

## Keyboard navigation

| Area | Key | Behavior |
| --- | --- | --- |
| Page | `Tab` / `Shift+Tab` | Move focus forward / backward |
| Page | `Enter` | Activate the skip link, buttons, and menu items |
| Top-bar tab | `←` / `→` | Switch Projects / Components / Settings |
| Top-bar tab | `Home` / `End` | Jump to the first / last tab |
| Mobile logo button | `Enter` / `Space` | Expand / collapse the page menu |
| Mobile logo button | `↓` / `↑` | Expand the menu and focus the current tab |
| Page menu | `↓` / `↑` | Switch Projects / Components / Settings |
| Page menu | `Enter` / `Space` | Select a page and collapse the menu |
| Page menu | `Esc` | Collapse the menu and return to the logo button |
| Language menu button | `↓` / `↑` | Open the menu and focus the first / last option |
| Language menu | `↓` / `↑` | Move between options |
| Language menu | `Home` / `End` | First / last option |
| Language menu | `Enter` / `Space` | Select a language and close the menu |
| Language menu | `Esc` | Close and return to the language button |
| Sign-in / sign-up dialog | `Tab` / `Shift+Tab` | Cycle within the dialog without entering the background |
| Sign-in / sign-up dialog | `←` / `→` | Switch between the Sign in / Sign up tabs |
| Sign-in / sign-up dialog | `Esc` | Close the dialog (except while submitting) |
| Dialog close | Automatic | Focus returns to the button that opened the dialog |

## Dialog focus management

- On open, focus enters the account or nickname input.
- `#root` is set to `inert`; the background page and top bar cannot receive focus.
- The focus trap intercepts `Tab` / `Shift+Tab` and cycles at the start and end of the dialog.
- Clicking the backdrop **does not** close the dialog, preventing accidental activation; exit only via the close button or `Esc`.
- On close, `inert` is removed and focus returns to the trigger button; if the trigger was replaced after a successful sign-in, focus moves to the main content area.
- Dialog tabs use `role="tablist"`, `role="tab"`, and `role="tabpanel"`, with `aria-selected` and `aria-labelledby` kept in sync.
- On validation failure, focus moves to the first invalid field; when a server error appears, focus moves to the error message (`tabIndex={-1}`).
- When the mobile soft keyboard appears, `--mf-viewport-height` and `--mf-viewport-offset-top` are synced through `visualViewport`, keeping the bottom dialog visible with internal scrolling.

## Profile panel

- Clicking the avatar opens the profile panel with a backdrop; focus enters the current tab. On desktop it is a two-column panel centered horizontally and vertically relative to the screen; on mobile it is a full-screen panel with horizontal tabs at the top, an independently scrolling content area, sign-out fixed at the bottom, and safe-area plus `visualViewport` handling.
- The profile panel renders through a portal; while open, `#root` is set to `inert` and the background cannot receive focus; on close everything is restored and focus returns to the avatar button.
- Mobile tabs use `aria-orientation="horizontal"`; desktop keeps them vertical. Both support all four arrow keys and `Home` / `End`.
- Tabs, form controls, sign-out, and the close button inside the panel are all inside the focus trap, cycling at the ends.
- After closing via `Esc`, the close button, or a backdrop click, focus returns to the avatar button.
- Vertical tabs support the up/down arrow keys and `Home` / `End`.
- Avatar change, nickname save, and password change on the Profile page are all focusable controls; the export and cancel-account buttons on the Account page are also inside the focus trap.
- Opening the password verification or VCode dialog pauses the profile panel's focus trap and hands control to the dialog; on close, focus returns to the trigger.
- The Models page uses collapsible provider cards: the card header button controls the model list through `aria-expanded` / `aria-controls`, and both the add form and the provider cards stay in the Tab sequence; revealing an API key opens the VCode dialog, and closing it returns focus to the reveal button.

## VCode dialog

- A standalone, reusable `VCodeModal` using `role="dialog"` and `aria-modal="true"`, with the title and description linked through `aria-labelledby` / `aria-describedby`.
- A 3-column × 4-row numeric keypad: 1–9, 0, with the delete key in the bottom-right corner spanning 2 columns; six digits submit automatically, with no extra confirm button.
- Initial focus lands on digit 1; the Tab order is 1 → 9 → 0 → delete → close, cycling at the ends. The close button is last in the DOM so the order stays stable.
- Physical digit keys and the numeric keypad are supported, along with `Backspace` / `Delete` to remove the last digit; `Esc` closes the dialog, and focus returns to the trigger afterwards.
- Clicking the backdrop does not close the dialog; exit only via the top-right X or `Esc`, so input is not lost by accident.
- On verification failure, the input is cleared, the error is announced through `aria-live`, and focus returns to digit 1; while submitting, the keypad and close action are disabled.
- The dialog is centered horizontally and vertically relative to the screen; on mobile it uses the `visualViewport` height and safe-area variables, and the keypad keys keep a sufficient touch target.

## Password verification dialog

- A standalone, reusable `PasswordModal` using `role="dialog"` and `aria-modal="true"`, with the title and description linked through `aria-labelledby` / `aria-describedby`.
- It contains the current-password input, a verify button, and a top-right X; initial focus enters the input, and the Tab order is input → verify → close, cycling at the ends.
- Clicking the backdrop does not close it; exit only via X or `Esc`; while submitting, the input, button, and close action are disabled.
- On verification failure, the error is announced through `role="alert"`, the input is cleared, and focus returns to the input; on close, focus returns to the trigger.
- Changing the password needs only one new-password input and an Update button on the right; after clicking, the length is validated locally before opening the password verification dialog, and the change completes once verification passes.
- Account cancellation runs the "password verification dialog → VCode dialog" sequence; cancelling or failing either step leaves the account uncancelled.

## Dialog transitions

- Sign-in / sign-up, the profile panel, password verification, and the VCode dialog use 160–180 ms enter and exit animations.
- During the exit animation the dialog stays in the DOM but becomes non-interactive, and the background stays `inert`; focus and the background are only restored after the animation ends.
- Under `prefers-reduced-motion: reduce`, animations are skipped and closing completes immediately.

## Semantics and state

- Each page view has a visually hidden `h1` for accessibility, and empty states use `h2`.
- The language menu uses `menu` + `menuitemradio`, with `aria-checked` on the current item.
- Loading progress uses `role="progressbar"` and `aria-valuenow`.
- Form errors use `role="alert"`; fields include `aria-invalid`.
- Icon buttons all provide an `aria-label` or visible text; decorative graphics are `aria-hidden`.
- A global `:focus-visible` provides a 2 px accent outline.

## Verified

- The first `Tab` hits the skip link, and Enter moves focus into the main content.
- All top-bar tabs are reachable via Tab; arrow keys, `Home`, and `End` switch correctly and focus follows.
- Mobile page menu: after the logo button expands it, focus enters the current tab; arrow keys switch, `Esc` collapses it and returns to the trigger; it collapses when clicking outside or tabbing away; the menu open/close and chevron rotation animations work.
- All language menu options are reachable via Tab; arrow keys, Enter selection, Esc, and focus restoration work.
- After the dialog opens, focus enters the account input and the background `inert` takes effect.
- Repeated `Tab` presses only cycle inside the dialog and never escape to the background.
- Arrow-key switching between the Sign in / Sign up tabs and the subsequent Tab order work.
- After `Esc` closes the dialog, focus returns to the sign-in button.
- VCode dialog keyboard input, `Backspace` deletion, and the 1 → 9 → 0 → delete → close Tab order and focus cycle have been tested manually.
- After VCode verification fails, the input is cleared and focus returns to digit 1; after verification passes, export, account cancellation, and forgot-password flows proceed normally.
- Clicking the backdrop on the VCode and password verification dialogs does not close them; X / `Esc` exits correctly.
- The password verification dialog's initial focus, verification-failure message, Tab cycle, and post-close focus restoration have been tested manually.
- Password change and account cancellation both pass through the sequential "password verification → VCode" flow.
- Profile panel tab arrow keys, nested VCode focus handoff, and post-close focus restoration have been tested manually.
- The mobile full-screen profile panel, horizontal tabs, bottom sign-out, content scrolling, and safe-area handling have been tested manually, with no horizontal overflow.
- Models page provider card collapse, add form, model list refresh, and the VCode reveal / hide flow for API keys have been tested manually.
- Keyboard navigation is consistent on desktop and mobile.
- Mobile soft-keyboard handling is implemented through `visualViewport`; regression testing on real iOS / Android devices is still required.

## Next steps

- Run regression testing with real screen readers (NVDA / VoiceOver).
- Add field-level `aria-describedby` associations for form errors.
- Add Playwright automated tests for keyboard interaction.
- Evaluate how the skip link and focus styles behave in real browsers and under zoom.
