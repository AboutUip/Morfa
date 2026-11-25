# Morfa Documentation (English)

Morfa is an AI-powered, cross-platform online UI design platform. Agents operate on structured, editable design documents, while users retain control through preview, apply, and undo.

> Status: M1 in progress. The project page, 3-second bootstrap screen, account registration / login modal, and authentication API are runnable. Projects, editor, and Agent capabilities are still pending.
>
> Chinese is the primary language of this project. The Chinese documentation under `docs/` is authoritative; this page provides an English overview.

## Stack

- **Web**: React + TypeScript (Vite planned)
- **Server**: Node.js + TypeScript
- **Database**: SQLite (WAL)
- **Repository**: npm workspaces monorepo

## Run the web workspace

```bash
npm install
npm run dev     # web http://127.0.0.1:5173 + API http://127.0.0.1:3001
npm run build
```

Accounts support avatar upload (only the relative file path is stored), nickname, unique login account, password confirmation, a required 6-digit VCode, optional import of a cancelled account's archive, and automatic sign-in after sign-up. The login/register modal does not close when the backdrop is clicked.

The VCode is a reusable 3×4 keypad dialog that auto-submits after six digits. It gates data export, account cancellation, and password reset. Existing accounts without a VCode are signed out automatically and prompted to set one after their next sign-in. Each VCode is stored only as a salted scrypt hash; setup tokens and one-time sensitive-operation tickets are stored as SHA-256 hashes.

Signed-in users can open a centered two-column profile panel from their avatar. The left rail holds vertical Profile/Account tabs and the sign-out action. The Profile tab edits the avatar, nickname, and password. The password change uses a single new-password field plus a right-side Update button, then a dedicated current-password verification dialog. Forgot-password verifies the VCode before allowing a reset. The Account tab shows account details, exports an encrypted project archive, and cancels the account through two dialogs in sequence: password verification, then VCode verification.

Both the VCode and password verification dialogs are centered, use a focus trap, and do not close when their backdrop is clicked; they provide an explicit X and Escape instead. The password dialog follows the same keyboard principles as the VCode keypad.

Exports are server-encrypted with AES-256-GCM and compressed. Only one valid export exists per user; creating a new one immediately invalidates the old archive. Import is offered only during registration: the original account must be cancelled and the archive must be unused. The server verifies the archive hash, decrypts and unpacks it, consumes the export, and deletes the file. Imported project data never overrides the new account's own profile fields.

The UI is responsive across mobile and desktop: safe-area insets, `visualViewport` tracking for the soft keyboard, a bottom-sheet auth modal on small screens, 16px form inputs to avoid iOS zoom, and larger touch targets. The top bar switches between Projects, Components, and Settings (the latter two are placeholders for now). A PWA manifest and icons are included; no Service Worker yet.

Keyboard accessibility includes a skip link, arrow-key navigation for top-bar tabs and the language menu, focus traps with an inert background, Escape to close, and focus restoration to the trigger. The VCode keypad is ordered 1–9, 0, delete, close; it supports physical digits, Backspace/Delete, automatic submission, and visible focus. The profile panel and nested VCode dialog hand off focus correctly.

**Typeface:** Maple Mono CN 7.9 (monospace, Latin + Simplified Chinese, rounded sans-serif) is self-hosted as subsetted WOFF2 files under `apps/web/src/assets/fonts/maple-mono/`, licensed under SIL OFL 1.1. UI strings use the font; rare characters fall back to system fonts.

## Repository layout

```text
apps/web        React project page, bootstrap flow, auth modal, theme and i18n
apps/server     Fastify API, SQLite auth, avatar storage, Agent orchestration
packages/shared Shared types, schemas, and contracts
branding/       Logo, badge, favicon and app icons
docs/           Product, architecture, design, Agent, guides, ADRs
scripts/        Development scripts and Vite integration
```

## Documentation map

| Document | Topic |
| --- | --- |
| [Product vision (zh)](../product/vision.md) | Positioning, users, principles |
| [Roadmap (zh)](../product/roadmap.md) | Milestones and exit criteria |
| [Architecture overview (zh)](../architecture/overview.md) | Components, data flow, cross-platform |
| [Frontend (zh)](../architecture/frontend.md) | React structure and conventions |
| [Backend (zh)](../architecture/backend.md) | Node.js API and modules |
| [Database (zh)](../architecture/database.md) | SQLite conventions and schema draft |
| [Theming (zh)](../design/theming.md) | Light/dark themes and design tokens |
| [i18n (zh)](../design/i18n.md) | Locale strategy and message resources |
| [Branding (zh)](../design/branding.md) | Logo usage, backgrounds, assets |
| [Agent design (zh)](../agent/overview.md) | Agent runtime, tools, safety |
| [XAIOP integration (zh)](../integrations/xaiop.md) | Vendored SDK, build, Vite plugin |
| [Development guide (zh)](../guides/development.md) | Setup, commands, workflow |
| [ADRs (zh)](../decisions/) | Architecture decision records |

## Guiding principles

- **Agent-driven, human-controlled**: every Agent action is a typed tool call that can be reviewed, applied, replayed, or undone.
- **Structured by default**: designs are versioned data, not opaque pixels.
- **Cross-platform**: web-first with responsive and touch support; desktop clients are on the roadmap.
- **First-class theming and i18n**: `system / light / dark` modes and complete `zh-CN` / `en-US` coverage from day one.
- **Self-host friendly**: SQLite keeps local development and small deployments simple.
- **Structured streaming**: the XAIOP SDK is vendored as source for Node.js and the browser; compiled artifacts are generated on demand by a Vite plugin.

## Vendored XAIOP

- Repository: <https://github.com/AboutUip/XAIOP>
- SDK `0.16.0`, protocol `0.7.0` (Draft), upstream commit `83dea5a`, MIT
- Source lives in `vendor/xaiop/`; `dist/` is ignored and rebuilt by `scripts/vite-plugin-xaiop.mjs`
- Validate with `npm run xaiop:test` and `npm run xaiop:check`

## Contributing

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). Chinese commit subjects are preferred. Architecture changes require a new ADR. User-facing strings must be added to both `zh-CN` and `en-US` resources.

## License

[MIT](../../LICENSE) © 2026 小萱baibai
