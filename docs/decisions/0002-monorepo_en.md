# ADR 0002: Monorepo and Directory Structure

> 中文原文：[0002-monorepo.md](0002-monorepo.md)

- Status: Accepted
- Date: 2026-11-25
- Decision makers: Project maintainers

## Context

The project contains a React frontend, a Node.js backend, shared types, and extensive documentation. It needs:

- Shared design document schemas and API contracts between frontend and backend;
- A unified entry point for commits, tests, and documentation;
- Room to extend to a desktop client, mobile, or standalone services;
- A straightforward structure that avoids over-engineering.

## Decision

Use a single repository, divided by application and shared package:

```text
apps/
├─ web/        React frontend
└─ server/     Node.js API and SQLite
packages/
└─ shared/     Shared types, schema, constants
docs/          Product, architecture, design, Agent, ADRs
scripts/       Development and operations scripts
```

- Use npm workspaces to manage dependencies and scripts.
- `apps/web`, `apps/server`, and `packages/shared` each have their own `package.json` and type configuration.
- Future applications (such as `apps/desktop`) are added directly under `apps/`, with shared logic moved down into `packages/`.
- Documentation and code live in the same repository and are committed together when they change.
- Do not introduce orchestration tools such as Nx or Turborepo for now; evaluate them after build bottlenecks appear.

## Rationale

- Shared contracts are a frequent need in this project (design document schemas, Agent tool protocol, API DTOs), and a monorepo significantly reduces synchronization cost.
- The directory is divided into "deployable units (apps) / reusable units (packages)", with clear boundaries.
- Avoiding overly deep abstraction layers improves early development efficiency.

## Consequences

Positive:

- A single commit can deliver a coordinated change across "contract + frontend/backend + documentation".
- Unified CI, lint, formatting, and version numbers.
- New members only need to clone one repository.

Negative / limitations:

- The repository grows in size with the applications;
- CI needs path filtering to avoid a full build every time;
- Task orchestration tools become necessary when workspace dependency relationships grow complex.

## Alternatives

| Option | Reason not adopted |
| --- | --- |
| Separate frontend and backend repositories | Contracts change frequently early on; cross-repository synchronization is costly |
| Single-package full stack (one package.json) | Frontend and backend differ greatly in dependencies and runtime, blurring boundaries |
| Nx / Turborepo | Unnecessary at the current scale; adds learning and maintenance cost |
| pnpm workspaces | Usable, but the built-in npm workspaces meets the need and reduces tool dependencies |

## Follow-up actions

- Create the root `package.json`, workspaces, and unified scripts in M1.
- Introduce path filtering or task caching when CI time grows noticeably.
- Before adding an application, confirm whether it truly needs to be an independent deployable unit.
