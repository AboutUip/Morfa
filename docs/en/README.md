# Morfa Documentation (English)

Morfa is an AI-powered, cross-platform online UI design platform. Agents operate on structured, editable design documents, while users retain control through preview, apply, and undo.

> Status: M1 in progress. The web workspace is runnable and includes a 3-second bootstrap screen with an extensible progress API, a Figma-like shell, light/dark themes, and Chinese/English switching. Backend and editor capabilities are still pending.
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
npm run dev     # http://127.0.0.1:5173
npm run build
```

## Repository layout

```text
apps/web        React workspace shell, bootstrap flow, theme and i18n
apps/server     Node.js API, SQLite, Agent orchestration
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
