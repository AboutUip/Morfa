# ADR 0004: Vendoring XAIOP Source

> 中文原文：[0004-xaiop-integration.md](0004-xaiop-integration.md)

- Status: Accepted
- Date: 2026-11-25
- Decision makers: Project maintainers

## Context

Morfa's Agent needs to stream structured design changes. XAIOP provides a line-oriented cursor-construction protocol and Node.js / browser / isomorphic core SDKs, suitable for incremental parsing, phase commits, and reconnect recovery.

The integration approach must satisfy:

- Treat local source as the source of truth so it can be audited, modified, and version-pinned;
- Support both the Node.js server and the browser client;
- Do not commit build artifacts to the repository;
- Prepare the SDK automatically during development and build, with no extra manual steps;
- Clearly attribute the upstream GitHub repository and license.

## Decision

1. **Vendoring**: Copy the upstream `xaiop-sdk/nodejs` source, plus the `conformance/core-wire` and `docs/examples` fixtures required by the Node tests, into `vendor/xaiop/`, preserving the directory hierarchy so tests can run directly.
2. **Version pinning**: Record the upstream repository, SDK `0.16.0`, protocol `0.7.0`, commit `83dea5a`, and the MIT license.
3. **Dependency method**: The root `package.json` uses npm workspaces to register `vendor/xaiop/xaiop-sdk/nodejs` as `@bylan280/xaiop`; applications import the package name, which resolves to the local source.
4. **Build artifacts**: Add `dist/`, `*.tgz`, and `node_modules/` to `.gitignore`; the repository keeps only source, tests, and fixtures.
5. **On-demand compilation**: Add `scripts/vite-plugin-xaiop.mjs` to check and compile the SDK before Vite starts or builds, and to watch source changes for automatic rebuilds during development; also provide `npm run xaiop:check` for entry-point and protocol smoke validation.
6. **Attribution**: `vendor/xaiop/README.md`, the root README, and the integration document all state XAIOP's GitHub URL, version, and license; the root `package.json` also records Morfa's own repository URL.

## Rationale

- **Reproducible**: Source is pinned with the repository, unaffected by registry releases or network availability.
- **Auditable**: The Agent-related protocol is a core dependency, with visible source and runnable tests.
- **Types and browser support**: One package provides Node, browser, and core entry points, avoiding two sets of dependencies.
- **Clean repository**: Build artifacts are reproducible; `dist` and source maps larger than 1 MB are not committed.
- **Developer experience**: The Vite plugin moves compilation earlier, avoiding runtime errors where "the package exists but the entry point is missing".

## Consequences

Positive:

- The first startup compiles automatically, and later runs reuse artifacts based on modification time.
- The full upstream test suite can run directly in this repository, providing regression coverage during upgrades.
- Browser and Node entry points use the same version, reducing protocol behavior differences.

Negative / limitations:

- Upstream source enters the repository, increasing its size (currently about 830 KB).
- Upgrades require manual synchronization of source and fixtures, plus updated version records.
- The Vite plugin must be maintained in sync with the upstream build method (currently only `tsc`).
- When `dist` is missing, the first startup waits for an extra compilation pass.

## Alternatives

| Option | Reason not adopted |
| --- | --- |
| Depend directly on npm `@bylan280/xaiop@0.15.1` | The published version lags behind local source; the upstream commit and modifications cannot be pinned |
| git submodule | Requires extra initialization steps, complicates CI and cloning, and makes local modification and review inconvenient |
| Commit only the compiled `dist` | Violates the requirement to "keep source and exclude build dependencies" and is hard to audit |
| Run `npm run build` manually every time | Easy to forget; the user explicitly requires Vite to check and compile on demand |

## Follow-up actions

- Mount `xaiopSourcePlugin()` when creating `apps/web` in M1, and declare `@bylan280/xaiop` in its dependencies.
- When the Agent event stream lands, add an "XAIOP event mapping" document and end-to-end tests.
- After upgrading XAIOP, record the new commit hash and test results.

## Implementation status (2026-11-26)

- Completed: vendored source, root workspaces registration, plugin mounted in `apps/web/vite.config.ts`, `npm run xaiop:test` (901 passed / 0 failed), and `npm run xaiop:check`.
- Pending: the `package.json` files of `apps/web` / `apps/server` do not yet declare `@bylan280/xaiop`; business code does not yet import the SDK; Agent event mapping and end-to-end tests await M3.
- See [XAIOP integration](../integrations/xaiop_en.md) for current integration details and validation commands.
