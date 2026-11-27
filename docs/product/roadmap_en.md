# Roadmap

> 中文原文：[roadmap.md](roadmap.md)
>
> Status: Draft · Last updated: 2026-11-25

The roadmap is organized around verifiable capabilities rather than fixed dates. At the end of each milestone, the corresponding capability should be demonstrable and the documentation updated.

## M0 · Repository and documentation skeleton (complete)

**Goal**: establish the collaboration foundation so that subsequent development has a clear directory structure and decision basis.

- [x] monorepo directory planning (`apps/web`, `apps/server`, `packages/shared`)
- [x] skeleton for product, architecture, design, Agent, and development documentation
- [x] ADRs for the tech stack and repository structure
- [x] decision to make theming and i18n first-class capabilities
- [x] initial commit
- [x] XAIOP SDK vendored as source and wired into Vite for on-demand compilation (2026-11-25)

**Exit criteria**: directory responsibilities are clear, documentation is navigable, and key choices are recorded.

## M1 · Engineering foundation (current)

**Goal**: get the minimal full-stack loop running, and make theming and i18n usable from day one.

- [x] npm workspaces, TypeScript, Vite (Lint / Format / test baseline still to be added)
- [x] React app skeleton: splash animation, project page, and authentication modal (routing / error boundary still to be added)
- [x] Node.js API skeleton: health check, unified error format, logging
- [x] SQLite integration: migration mechanism, connection configuration, development data directory
- [x] Account registration / login: avatar relative path, nickname, account deduplication, automatic sign-in after registration
- [x] Theme system: `system / light / dark` tri-state, tokens, flicker-free initialization
- [x] i18n foundation: `zh-CN` default, `en-US`, language switching and persistence
- [x] Mobile / desktop responsive foundation: safe area, bottom drawer, touch target sizes, PWA manifest
- [x] Splash animation, reusable loading UI, and progress interface
- [ ] Project list and creation API
- [ ] Login failure rate limiting and end-to-end smoke tests

**Exit criteria**: start the frontend and backend with a single command; theme and language switching persist; CI can run builds and tests.

## M2 · Editor MVP

**Goal**: complete basic UI design without AI.

- Canvas and layer tree, selection and transform
- Basic elements: Frame, rectangle, text, image, icon
- Property panel, alignment and distribution, style reuse
- Design tokens and theme preview (application theme decoupled from canvas content theme)
- Create, save, and version projects and design documents
- Undo / redo and keyboard shortcut system

**Exit criteria**: create, edit, save, and reopen a multi-page design; core operations can be undone.

## M3 · Agent MVP

**Goal**: complete real design tasks with natural language, with a controllable process.

- Chat panel and streaming responses (XAIOP structured stream)
- Agent orchestrator, model provider abstraction, run records
- Typed design tool set (query, create, modify, style, batch operations)
- Change preview, apply / discard, undo, and run replay
- Selection and context injection (current page, selected nodes, tokens)
- Cost, rate, and timeout controls

**Exit criteria**: the Agent can complete a set of typical tasks on an existing design, and every modification is traceable and can be rolled back.

## M4 · Cross-platform and sharing

**Goal**: make designs usable on more devices and in more scenarios.

- Responsive editor and touch gestures
- Share links, read-only preview, export (PNG / SVG / JSON)
- PWA and offline draft capability
- Desktop client evaluation and prototype
- Continue filling in multilingual content (English UI completeness)

**Exit criteria**: basic editing is possible on a tablet; share links can be viewed without an account.

## M5 · Launch preparation

**Goal**: reach public beta quality.

- Performance budgets and canvas optimization
- Accessibility audit and fixes
- Security audit: authentication, uploads, rate limiting, prompt injection protection
- Observability: structured logs, metrics, error tracking
- Backup and recovery drills
- Deployment documentation and operations runbook

**Exit criteria**: complete the launch checklist and have rollback and data recovery capability.

## Later candidates

- Realtime multiplayer collaboration
- Design system and component library management
- Design-to-code export (React / Tailwind, etc.)
- Plugin and Agent tool extension mechanism
- Team billing and enterprise capabilities

> Priorities will be adjusted based on user feedback; record the reasons in this document after adjustments.
