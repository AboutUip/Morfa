# Morfa Documentation

This directory is the entry point and single source of truth for Morfa documentation. It covers the product, architecture, design, Agent, and development process.

> 中文原文：[README.md](README.md) · Chinese is authoritative if the two versions differ
>
> Status: Established with project initialization · Last updated: 2026-11-26

## Language and writing conventions

- **Chinese first, English alongside**: topic documents use a bilingual pair in the same directory: `name.md` (Chinese) and `name_en.md` (English). For example, `integrations/xaiop.md` and `integrations/xaiop_en.md`. The English documentation home is this file. The root README follows the same convention: `README.md` + `README_en.md`.
- Code identifiers, API fields, and common technical terms remain in English; add a Chinese explanation on first use in Chinese documents.
- English versions keep code blocks, commands, and literal examples unchanged; Chinese UI strings, error messages, and commit examples inside examples may therefore remain in Chinese.
- File names use kebab-case; one document covers one topic.
- Document status uses `Draft / Confirmed / Deprecated`; architecture trade-offs require a new [ADR](decisions/).
- When the two languages differ, the Chinese version is authoritative.

## Documentation map

| Directory / document | Contents | Status |
| --- | --- | --- |
| [product/vision_en.md](product/vision_en.md) | Product positioning, target users, core value, and principles | Draft |
| [product/roadmap_en.md](product/roadmap_en.md) | Milestones and exit criteria | Draft |
| [architecture/overview_en.md](architecture/overview_en.md) | System context, components, data flow, and cross-platform strategy | M1 partially implemented |
| [architecture/realtime_en.md](architecture/realtime_en.md) | WebSocket envelope, operation registry, subscriptions, reconnect, and push | Base implemented |
| [architecture/frontend_en.md](architecture/frontend_en.md) | React structure, splash and loading, state, and styles | Partially implemented |
| [architecture/backend_en.md](architecture/backend_en.md) | Node.js service, authentication API, modules, and security | M1 partially implemented |
| [architecture/database_en.md](architecture/database_en.md) | SQLite conventions, migrations, and schema | M1 partially implemented |
| [design/theming_en.md](design/theming_en.md) | Light/dark themes, design tokens, and persistence | Base implemented |
| [design/i18n_en.md](design/i18n_en.md) | Locale strategy, resource organization, and formatting | Base implemented |
| [design/branding_en.md](design/branding_en.md) | Logo construction, background rules, whitespace, and asset list | Established |
| [design/typography_en.md](design/typography_en.md) | Typeface choice, subset strategy, performance, and usage rules | Integrated |
| [design/accessibility_en.md](design/accessibility_en.md) | Keyboard interaction, focus traps, skip link, and validation | Base implemented |
| [agent/overview_en.md](agent/overview_en.md) | Agent positioning, run lifecycle, tools, and safety | Draft |
| [integrations/mcp_en.md](integrations/mcp_en.md) | Native MCP server, API key permissions, capabilities, and integration | Implemented |
| [integrations/xaiop_en.md](integrations/xaiop_en.md) | XAIOP SDK origin, build, usage, and validation | Vendored; app integration not started |
| [guides/development_en.md](guides/development_en.md) | Local environment, commands, branches, and commit conventions | Draft |
| [decisions/](decisions/) | Architecture decision records (ADRs), including native MCP and API key permissions | Ongoing |
| [README.md](README.md) | Chinese documentation home (the original of this file) | Established |

### Architecture decision records

- [0001 Tech stack](decisions/0001-tech-stack_en.md)
- [0002 Monorepo](decisions/0002-monorepo_en.md)
- [0003 Theming and i18n](decisions/0003-theming-and-i18n_en.md)
- [0004 Vendored XAIOP](decisions/0004-xaiop-integration_en.md)
- [0005 Auth and avatar](decisions/0005-auth-and-avatar_en.md)
- [0006 Native MCP](decisions/0006-native-mcp_en.md)
- [0007 Realtime WebSocket](decisions/0007-realtime-websocket_en.md)

## Reading paths

- **New developers**: README → product vision → architecture overview → development guide → the relevant module document.
- **Product and design**: product vision → roadmap → theming → i18n.
- **Agent / MCP / realtime**: architecture overview → Agent design → MCP integration → realtime channel → XAIOP integration → database design (run records).
- **Third-party dependency maintenance**: XAIOP integration → vendor README → ADR 0004.
- **Architecture review**: architecture overview → module documents → ADR list.

## Documentation maintenance

1. When a feature or behavior changes, update the relevant documents in the same change.
2. When adding an architecture decision, number it under `decisions/` as `NNNN-title.md`, and link it from this page and related documents. Add the English counterpart as `NNNN-title_en.md`.
3. Distinguish plans from current state: mark unimplemented content as planned so it is not mistaken for an existing capability.
4. Example code and commands should be copyable and runnable; explicitly note commands that are not yet available.
