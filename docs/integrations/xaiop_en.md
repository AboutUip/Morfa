# XAIOP Integration

> 中文原文：[xaiop.md](xaiop.md) · The Chinese document is authoritative if the two versions differ.
>
> Status: SDK vendored; application integration not started · Last updated: 2026-11-26

XAIOP is a line-oriented, cursor-construction structured-data protocol. A producer emits construction instructions line by line, and the SDK deterministically materializes JSON. This makes it suitable for incremental output, staged commits, and streaming parsing. Morfa's Agent needs to stream structured design changes to the client while preserving preview, apply, undo, and resume capabilities. The official Node.js and browser SDKs are therefore vendored as a **local source dependency** instead of being consumed from the npm registry.

This document describes how Morfa vendors, builds, validates, and uses XAIOP. Protocol syntax and the complete API remain upstream concerns; see [Upstream and version](#upstream-and-version).

## At a glance

| Area | Current state |
| --- | --- |
| SDK source | Vendored under `vendor/xaiop/` and committed |
| Workspace dependency | Registered as `@bylan280/xaiop` by the root `package.json` |
| Vite automatic build | Mounted in `apps/web/vite.config.ts` |
| Entry-point and protocol smoke test | Passes `npm run xaiop:check` |
| Upstream test suite | Passes `npm run xaiop:test`, 901 passed / 0 failed |
| Application imports | **Not started** |
| Application `package.json` declarations | **Not declared**, currently relying on root workspace hoisting |
| Agent event mapping and E2E tests | **Not started** (planned for M3) |

> Summary: the SDK can already be imported from `apps/web` or `apps/server` and is compiled locally, but no Morfa runtime code uses it yet. `/api/realtime` is Morfa's own JSON-envelope WebSocket channel, **not** an XAIOP channel; do not confuse the two.

## Upstream and version

| Item | Value |
| --- | --- |
| GitHub | <https://github.com/AboutUip/XAIOP> |
| SDK package | `@bylan280/xaiop` |
| SDK version | `0.16.0` |
| Protocol version | `0.7.0` (Draft) |
| Upstream commit | `83dea5a` |
| Sync date | 2026-11-25 |
| License | MIT, see [`vendor/xaiop/xaiop-sdk/nodejs/LICENSE`](../../vendor/xaiop/xaiop-sdk/nodejs/LICENSE) |
| Node.js requirement | Upstream `>= 18`; this repository requires `>= 22.12` |

Upstream documentation (English is authoritative):

- [Node.js SDK API](https://github.com/AboutUip/XAIOP/blob/main/docs/sdk/nodejs/API.md)
- [Protocol syntax](https://github.com/AboutUip/XAIOP/blob/main/docs/protocol/syntax.md)
- [Behavioral contract](https://github.com/AboutUip/XAIOP/blob/main/docs/sdk/behavioral-contract.md)

Why vendor the source:

- **Reproducible**: the exact source is locked in this repository, independent of registry releases or network availability.
- **Auditable**: the Agent protocol is a core dependency; source, tests, and fixtures can be reviewed in place.
- **Patchable**: local adaptations are possible, with the version delta recorded explicitly.
- **Consistent across runtimes**: Node, browser, and isomorphic core entry points come from one source tree.

## Repository layout

```text
vendor/xaiop/
├─ README.md                       # Origin, version, sync and local-modification policy
├─ xaiop-sdk/
│  ├─ nodejs/                      # @bylan280/xaiop source
│  │  ├─ src/
│  │  │  ├─ core/                  # Parse, encode, merge, checkpoint, types (no I/O)
│  │  │  ├─ browser/               # Browser entry, streaming transports, WebSocket client
│  │  │  └─ node/                  # Node entry, HTTP/SSE/WS transports, WS server
│  │  ├─ test/                     # Upstream test suite, kept runnable
│  │  ├─ scripts/
│  │  ├─ package.json
│  │  └─ tsconfig.json
│  └─ conformance/core-wire/       # Protocol conformance fixtures used by the Node tests
└─ docs/examples/                  # Example fixtures used by the Node tests
```

Committed versus generated:

- **Committed**: SDK source, tests, fixtures, `package.json`, `tsconfig.json`, license, and vendor README.
- **Not committed**: `vendor/xaiop/xaiop-sdk/nodejs/dist/`, `*.tgz`, and `vendor/**/node_modules/`; all are listed in `.gitignore`.
- **Generated**: build output produced on demand by `scripts/vite-plugin-xaiop.mjs` or `npm run xaiop:build`.

Local-modification policy: keep the upstream source pristine by default so it can be compared and upgraded. Morfa-specific adapters belong in `apps/*` or `packages/shared`, not in `vendor/xaiop`. If a local patch is unavoidable, record the reason in the commit message and [`vendor/xaiop/README.md`](../../vendor/xaiop/README.md).

## Dependency and workspace

The root `package.json` registers the SDK as a local package through npm workspaces:

```json
{
  "workspaces": [
    "apps/*",
    "packages/*",
    "vendor/xaiop/xaiop-sdk/nodejs"
  ]
}
```

Verify the link after installation:

```bash
npm ls @bylan280/xaiop
# morfa@0.1.0
# └── @bylan280/xaiop@0.16.0 -> ./vendor/xaiop/xaiop-sdk/nodejs
```

`apps/web/package.json` and `apps/server/package.json` do **not** declare `@bylan280/xaiop` yet. Before the first business-code `import`, add it to the relevant application:

```json
{
  "dependencies": {
    "@bylan280/xaiop": "0.16.0"
  }
}
```

This avoids relying on workspace hoisting long-term and makes application dependencies explicit. It is omitted for now because only build validation is in place.

## Build and automatic compilation

The SDK `package.json` points at `dist/`, which is not committed. Morfa uses [`scripts/vite-plugin-xaiop.mjs`](../../scripts/vite-plugin-xaiop.mjs) to check and compile it on demand before Vite starts or builds.

### Commands

| Command | Behavior |
| --- | --- |
| `npm run xaiop:build` | Run `tsc` and emit `vendor/xaiop/xaiop-sdk/nodejs/dist` |
| `npm run xaiop:test` | Compile, then run the upstream test suite (`node test/run-all.mjs`) |
| `npm run xaiop:check` | Ensure `dist` is fresh, validate the Node / browser / core entries, and parse a fixture |

### Vite plugin behavior

1. **Pre-start check**: `configResolved` and `buildStart` both call `ensureXaiopBuilt()`.
2. **Freshness check**: compare the newest modification time of `src/**/*.ts` (excluding `.d.ts`), `tsconfig.json`, and `package.json` with the oldest required output.
3. **Rebuild when needed**: delete `dist/` and run `tsc` again so stale files cannot survive.
4. **Validate entries**: after compilation, require `.js` and `.d.ts` for `index`, `browser/index`, and `core/index`. A missing entry aborts startup with a clear error.
5. **Development watch**: watch `add` / `change` / `unlink` under vendored `src`, debounce 150 ms, rebuild, then trigger a full page reload.
6. **Pre-bundling**: add `@bylan280/xaiop/browser` and `@bylan280/xaiop/core` to `optimizeDeps.include` so Vite pre-bundles the browser entries.
7. **Skip switch**: `XAIOP_SKIP_BUILD=1` skips both the build and the artifact check. Use it only in CI where `dist` is known to exist and be fresh; if it is missing, later imports fail at runtime.

Mounting in `apps/web/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { xaiopSourcePlugin } from "../../scripts/vite-plugin-xaiop.mjs";

export default defineConfig({
  plugins: [xaiopSourcePlugin(), react()],
});
```

### CI recommendation

```bash
npm ci
npm run xaiop:check   # compiles on demand, validates entries and fixtures
npm run build
```

- Do not assume a cached `dist` is fresh; `xaiop:check` compares modification times and rebuilds.
- The first build waits for one `tsc` pass (typically 1–5 seconds); later runs reuse `dist`.
- Even if CI explicitly runs `npm run xaiop:build`, avoid `XAIOP_SKIP_BUILD=1` unless the artifacts are guaranteed to match the source.

## Usage

### Entry-point selection

| Entry | Runtime | Includes | Avoid |
| --- | --- | --- | --- |
| `@bylan280/xaiop` | Node.js / server | Full surface: parse, encode, streaming, HTTP/SSE/WS, `XaiopWs.listen` / `connect` | Browser bundles (pulls in Node dependencies) |
| `@bylan280/xaiop/browser` | Browser | Core + `XaiopStream` + browser transports + `XaiopBrowserWs.connect` | Server `listen` / hub |
| `@bylan280/xaiop/core` | Isomorphic | Parse, encode, merge, checkpoint, type validation; no I/O | Network transports and WebSocket server |

### Parse and construct

```ts
import { parseSync } from "@bylan280/xaiop/core";

const value = parseSync(wire);
```

`parseSync(source, false)` uses strict mode by default. Passing `true` enables compatibility fixes, intended only for known legacy data or manual debugging. **Do not enable compatibility mode for model output by default**, or protocol errors will be silently repaired.

Use the in-memory engine to construct and read documents:

```ts
import { XaiopEngine } from "@bylan280/xaiop/core";

const engine = new XaiopEngine();
const id = await engine.upload(wire);
const value = await engine.get(id);
```

### Streaming consumption

In the browser, `XaiopStream` consumes incremental text. It supports `http`, `sse`, `websocket`, and `raw` transports:

```ts
import { XaiopStream } from "@bylan280/xaiop/browser";

const stream = new XaiopStream("/api/agent/stream");

stream.on("chunk", (diff, meta) => {
  previewPatch(diff, meta);
});

stream.on("done", (json) => {
  commitPreview(json);
});

stream.on("error", (error) => {
  showProtocolError(error);
});

stream.send();
```

> `/api/agent/stream` is illustrative. Morfa has not implemented an Agent endpoint yet; the final path and event envelope will be decided in M3.

### WebSocket

The Node entry can start or connect an XAIOP WebSocket; the browser entry only exposes `connect`:

```ts
import { XaiopWs } from "@bylan280/xaiop";
import { XaiopBrowserWs } from "@bylan280/xaiop/browser";

const hub = await XaiopWs.listen({ port: 3002, path: "/xaiop" });
const connection = await XaiopBrowserWs.connect("ws://127.0.0.1:3002/xaiop");
```

Morfa does not currently run a dedicated XAIOP WebSocket service. Whether to reuse the existing `/api/realtime` gateway or add a dedicated endpoint is part of the M3 integration design, not this integration.

### Boundaries inside Morfa

- **XAIOP is an encoding / checkpoint layer, not a transport.** It defines how a structured value is written as incrementally parseable text; it does not mandate SSE, WebSocket, or plain HTTP.
- **The existing `/api/realtime` is not XAIOP.** It carries Morfa's own JSON envelope (`v / id / type / module / action / payload`) for preferences, MCP capability catalogs, and similar internal operations. Do not point `XaiopBrowserWs` at it.
- **Agent streaming is still planned.** Per [ADR 0007](../decisions/0007-realtime-websocket_en.md) and [Realtime channel](../architecture/realtime_en.md), the future Agent stream is expected to reuse the single WebSocket channel. How XAIOP payloads fit into the realtime envelope and how events map are not yet designed.
- **The server encodes and validates.** Model output passes business-schema validation before XAIOP encoding; it is never written directly to a design document.
- **The client previews and commits.** Parse results enter a preview layer only; a version is committed after user confirmation. Diffs, undo, and run history remain available.
- **Keep adapters out of vendor.** Glue code between Morfa and XAIOP belongs in `apps/*` or `packages/shared` so upgrades and tests stay manageable.
- **Map errors.** Convert SDK errors such as `XaiopSyntaxError`, `XaiopControlError`, and `XaiopTypeError` into stable business error codes with translatable messages; never show raw internal stacks to users.

Planned integration points (not created yet):

| Location | Responsibility |
| --- | --- |
| `apps/server/src/agent` | Agent orchestration, XAIOP encoding, run records, and event publication |
| `packages/shared` | Agent event DTOs, payload schemas, and protocol version constants |
| `apps/web/src/features/agent` | `XaiopStream` / `parseSync` consumption, patch preview, and commit |

## Validation

The following commands were run when this document was updated:

```bash
npm run xaiop:test
npm run xaiop:check
```

Results:

```text
tests 901
suites 83
pass 901
fail 0

[xaiop] 校验通过：SDK 0.16.0 / 协议 0.7.0（Node / browser / core）
```

`xaiop:check` covers:

- `SDK_VERSION === "0.16.0"` and `PROTOCOL_VERSION === "0.7.0"`;
- the Node entry exports `XaiopWs`;
- the browser entry exports `XaiopBrowserWs` and `XaiopStream`;
- the core entry exports `parseSync`;
- the Node / browser / core entries parse `complex.xaiop` to the upstream fixture;
- `dist` exists and is not older than the source or build configuration.

The upstream suite covers protocol syntax, encode / parse round-trips, checkpoints, history and jumps, control frames, WebSocket, type validation, compatibility mode, and conformance fixtures. This validates the SDK itself, not Morfa's Agent pipeline.

## Syncing upstream

1. Check out the target commit in the XAIOP repository and confirm that `xaiop-sdk/nodejs`, `xaiop-sdk/conformance/core-wire`, and `docs/examples` have no uncommitted changes.
2. Copy those directories into `vendor/xaiop/`, **excluding** `dist/`, `node_modules/`, and `*.tgz`.
3. Update the version, commit, and sync date in [`vendor/xaiop/README.md`](../../vendor/xaiop/README.md).
4. If the SDK version changes, update the root `package.json` and any application package declarations, then run `npm install` to refresh the lockfile. If the vendored package's `package-lock.json` changed as well, sync it too.
5. Run `npm run xaiop:test` and `npm run xaiop:check`.
6. If the change is breaking, update this document, [ADR 0004](../decisions/0004-xaiop-integration_en.md), and affected architecture documents.
7. Record the upstream commit and test results in the commit message for traceability.

The protocol is still Draft. When upgrading, pay particular attention to WebSocket control frames, checkpoint / history behavior, type validation, compatibility-mode defaults, and changes to browser-entry exports.

## Security and boundaries

- **Treat input as untrusted**: XAIOP text, parsed JSON, and Agent tool arguments must all be validated against Morfa schemas. A successful SDK parse does not make the data valid business data.
- **Prefer strict mode**: use strict parsing for model output. Compatibility mode is for known legacy data only and should be enabled with a recorded reason.
- **Bound size and time**: set maximum bytes, maximum phases, and a timeout per stream to prevent runaway or malicious output from exhausting memory.
- **Never execute data**: parsed values must not feed `eval`, SQL concatenation, shell commands, or file-path construction.
- **Isolate secrets**: model-provider keys stay on the server and must not enter the browser, an XAIOP stream, or model context.
- **Least browser capability**: the browser entry does not include server `listen` / hub; do not import the Node entry in browser code.
- **Pin versions**: lock both SDK and protocol versions; run the full suite and smoke test before upgrading, and record the delta afterwards.

## Troubleshooting

| Symptom | Cause / action |
| --- | --- |
| First `npm run dev` waits a few seconds | Expected: Vite is compiling `dist`; later starts reuse it |
| `Cannot find module '@bylan280/xaiop'` | Run `npm install`; verify `npm ls @bylan280/xaiop` links to `vendor/...`; confirm `dist` exists |
| `[xaiop] 找不到 TypeScript` | Run `npm install` at the repository root, not only inside a workspace |
| `[xaiop] TypeScript 编译失败` | Run `npm run xaiop:build` alone for the full error; check Node version and source completeness |
| SDK source edits do not take effect | The dev server should rebuild and reload; if not, restart Vite or delete `dist` and run `npm run xaiop:build` |
| Browser build complains about Node built-ins | Import `@bylan280/xaiop/browser` or `/core` from client code, not the root entry |
| `require('@bylan280/xaiop')` fails | The package is ESM (`"type": "module"`, `import`-only exports); use `import` |
| CI reports missing `dist` | Run `npm run xaiop:check` or `npm run xaiop:build`; do not set `XAIOP_SKIP_BUILD=1` before building |
| `npm run xaiop:test` feels slow | The first run compiles and then executes 901 tests; this is expected |

## Known gaps

The following items are not covered yet and should update this document when implemented:

- `apps/web` / `apps/server` do not declare `@bylan280/xaiop` in their `package.json` files.
- Business code does not import the SDK yet; only build and smoke validation exist.
- The Agent endpoint, the mapping between XAIOP payloads and the realtime envelope, and the `run.*` / `patch.*` event definitions are not implemented.
- Morfa has no XAIOP integration or end-to-end test; it currently relies on the upstream suite and `xaiop:check`.
- No business-level limits exist for stream size, phase count, timeout, or reconnect recovery.
- There is no automated protocol-version upgrade check; upgrades still require manual synchronization and testing.

## Related documents

- [ADR 0004: Vendoring XAIOP](../decisions/0004-xaiop-integration_en.md)
- [vendor/xaiop/README.md](../../vendor/xaiop/README.md)
- [Agent design](../agent/overview_en.md)
- [Realtime channel](../architecture/realtime_en.md)
- [Backend architecture](../architecture/backend_en.md)
- [Frontend architecture](../architecture/frontend_en.md)
- [Development guide](../guides/development_en.md)
- [中文版本](xaiop.md)
