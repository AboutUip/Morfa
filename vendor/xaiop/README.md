# XAIOP（vendored）

本目录保存 [XAIOP](https://github.com/AboutUip/XAIOP) Node.js / 浏览器 SDK 的上游源码。Morfa 通过本地 workspace 依赖使用它，不依赖 npm registry 上的发布版本。

## 上游信息

| 项 | 值 |
| --- | --- |
| 仓库 | <https://github.com/AboutUip/XAIOP> |
| 版本 | SDK `0.16.0` · Protocol `0.7.0`（Draft） |
| 源码提交 | `83dea5a`（Add XAIOP cursor-construction wire paper and surface it in docs） |
| 同步日期 | 2026-11-25 |
| 许可证 | MIT，见 [`xaiop-sdk/nodejs/LICENSE`](xaiop-sdk/nodejs/LICENSE) |

## 保留内容

```text
vendor/xaiop/
├─ xaiop-sdk/
│  ├─ nodejs/                    # @bylan280/xaiop 源码（Node + browser + core 入口）
│  │  ├─ src/
│  │  ├─ test/                   # 上游测试，保持可运行
│  │  ├─ scripts/
│  │  ├─ package.json
│  │  └─ tsconfig.json
│  └─ conformance/core-wire/     # node 测试使用的协议一致性夹具
└─ docs/examples/                # node 测试使用的示例夹具
```

以下内容**不提交**，由构建按需生成：

- `xaiop-sdk/nodejs/dist/`：TypeScript 编译产物与 `.d.ts`
- `xaiop-sdk/nodejs/*.tgz`：`npm pack` 生成的包
- `node_modules/`

## 构建与验证

```bash
npm install                       # 根目录安装 workspace 依赖
npm run xaiop:build               # 仅编译 SDK（tsc -> dist）
npm run xaiop:test                # 编译并运行上游完整测试
npm run xaiop:check               # 编译后校验 Node / browser / core 入口
```

Vite 侧使用 [`scripts/vite-plugin-xaiop.mjs`](../../scripts/vite-plugin-xaiop.mjs)：启动开发服务器或生产构建前检查 `dist` 是否缺失或过期，必要时自动编译；开发期间修改 `src` 会触发重新编译与页面刷新。详见 [XAIOP 集成文档](../../docs/integrations/xaiop.md)。

## 同步上游

1. 在 XAIOP 仓库检出目标提交，确认 `git status` 中 `xaiop-sdk/nodejs`、`xaiop-sdk/conformance/core-wire`、`docs/examples` 干净。
2. 复制上述目录，**不要**复制 `dist/`、`node_modules/`、`*.tgz`。
3. 更新本文件的版本、提交与日期。
4. 运行 `npm install`、`npm run xaiop:test`、`npm run xaiop:check`。
5. 若上游有破坏性变化，更新 [ADR 0004](../../docs/decisions/0004-xaiop-integration.md) 与集成文档。

## 本地修改策略

默认保持上游源码原样，便于比对与升级。Morfa 特有的适配代码放在 `packages/shared` 或应用侧，不直接修改 `vendor/xaiop` 内的文件；确需修改时，在提交信息与本文档中记录原因。
