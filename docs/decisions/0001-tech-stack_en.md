# ADR 0001: Technology Stack Selection

> 中文原文：[0001-tech-stack.md](0001-tech-stack.md)

- Status: Accepted
- Date: 2026-11-25
- Decision makers: Project maintainers

## Context

Morfa is an AI-driven online UI design platform. It needs:

- A complex, interactive editor interface with cross-platform access;
- Server-side storage for projects and design documents, plus orchestration of Agent runs;
- Lightweight deployment to reduce early development and self-hosting costs;
- Native dark / light themes and Chinese / English internationalization.

## Decision

Adopt the following technology stack:

| Layer | Choice |
| --- | --- |
| Frontend | React + TypeScript |
| Frontend build | Vite (recommended; to be confirmed in M1) |
| Backend | Node.js + TypeScript |
| Database | SQLite (WAL mode) |
| Repository | npm workspaces monorepo |

Specific dependency versions are pinned when the application is scaffolded; no unused dependencies are introduced during initialization.

## Rationale

- **React**: Mature ecosystem; editor applications can reuse many interaction and accessibility practices; high team familiarity, and a clear cross-platform path (web, desktop shell, and later mobile).
- **Node.js + TypeScript**: Frontend and backend share types and schemas, reducing contract drift; the asynchronous model suits streaming Agent responses.
- **SQLite**: Single file, zero operations, and reliable transactions; suitable for local-first and small deployments; isolated behind a server-side data access layer, allowing migration to PostgreSQL when needed.
- **npm workspaces**: Ships with Node.js and requires no extra package manager; sufficient for the current scale, with orchestration tools such as Turborepo possible later.

## Consequences

Positive:

- Low startup cost for local development, with no external database dependency.
- Type and validation logic can be reused across the frontend and backend.
- A monorepo makes linting, testing, documentation, and version management uniform.

Negative / limitations:

- SQLite has a single writer, so write transactions must be short; high concurrency or multi-user realtime collaboration will require re-evaluation.
- The React ecosystem offers many choices, requiring explicit conventions to avoid stylistic fragmentation.
- npm workspaces is less capable than dedicated tools for task orchestration and incremental builds; it may be supplemented as the project grows.

## Alternatives

| Option | Reason not adopted |
| --- | --- |
| Vue / Svelte | Equally viable, but team and ecosystem experience lean toward React |
| Express / Hono | Can be re-evaluated during implementation; Fastify is currently preferred for better performance and schema support |
| PostgreSQL / MySQL | Higher operational cost; early benefits do not outweigh the added complexity |
| pnpm / Yarn | More capable, but npm workspaces already meets current needs and reduces toolchain dependencies |
| Multi-repository split | Shared contracts change frequently early on; a monorepo is more efficient |

## Follow-up actions

- Pin dependency versions in M1 and add build, test, and lint configuration.
- Record an ADR for the ORM choice when introducing the database access layer.
- Evaluate database migration options when multi-node deployment or write bottlenecks arise.
