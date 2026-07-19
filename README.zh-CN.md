# VelarOS Arch Guard

VelarOS Arch Guard 是一个面向 JavaScript 和 TypeScript 项目的可扩展架构策略引擎。它负责把项目边界变成可执行检查，但不绑定具体框架、构建工具或产品。

它从 VelarOS Desktop 正在使用的架构门禁链路中拆出。公开仓库负责可复用的执行引擎与
插件契约；VelarOS 专属包名、路径、baseline 和产品策略仍保留在私有下游插件中。

它提供：

- 带类型的 Check 与插件 API；
- 确定性的文件收集和共享源码/AST 缓存；
- 规则级严重度与参数覆盖；
- 按 Git diff、暂存文件、标签和路径执行；
- 适合存量项目渐进接入的 baseline；
- 默认关闭、原子写入、分阶段执行的 autofix；
- Stylish、JSON、SARIF 和 GitHub Actions reporter。

项目自己的包边界、禁止导入、命名约束、框架约定和产品架构应该放在项目插件里，不进入公共引擎。

[English](README.md) · [官网介绍](https://velaros.cn/blog/open-sourcing-arch-guard)

## 安装

首个 npm registry 版本正在准备中。在 `@velaros/arch-guard` 正式发布前，请安装
带版本标签的 GitHub Release：

```bash
npm install --save-dev Error-Zhang/VelarOS-Arch-Guard#v0.1.0
```

仓库会提交编译后的 `dist/`，npm、pnpm、Bun 和 Yarn 消费 Git 依赖时不需要额外执行
构建脚本。安装后的包名仍是 `@velaros/arch-guard`，文档中的 import 与 CLI 用法不变。

要求 Node.js 20 或更高版本，不要求 Bun。

## 快速开始

```bash
npx arch-guard init
npx arch-guard doctor
npx arch-guard run
```

`init` 会生成一份可直接运行的 `arch-guard.config.mjs`：

```js
import { defineConfig } from '@velaros/arch-guard'
import { crossFileDuplication } from '@velaros/arch-guard/checks'

export default defineConfig({
  files: {
    roots: ['src'],
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    excludePatterns: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
  },
  checks: [crossFileDuplication],
})
```

建议在宿主项目中保存稳定脚本：

```json
{
  "scripts": {
    "arch:check": "arch-guard run",
    "arch:changed": "arch-guard run --changed",
    "arch:verify": "arch-guard verify"
  }
}
```

## 命令行

```text
arch-guard init
arch-guard doctor
arch-guard run [files...]
arch-guard verify
arch-guard list [--by-tag | --json | --ids-only]
arch-guard explain <check-id>
arch-guard baseline update|check
```

常用方式：

```bash
arch-guard run src/main.ts packages/core/src
arch-guard run --changed --base main
arch-guard run --staged
arch-guard run --only duplication/cross-file
arch-guard run --format stylish --format sarif --out reports/arch-guard.sarif
```

完整参数见 `arch-guard help`。

## 编写 Check

`plugin` 是受支持的扩展入口：

```js
import { defineCheck, toRelativePosix } from '@velaros/arch-guard/plugin'

export const noDirectDatabaseImports = defineCheck({
  id: 'example/no-direct-database-imports',
  title: 'Database access boundary',
  description: 'Application modules access the database through the data package.',
  verifies: ['数据库客户端只能由 data package 直接导入。'],
  tags: ['architecture', 'imports'],
  appliesTo: { include: ['src/**/*.{js,ts,tsx}'] },
  run({ context, report }) {
    const section = report.section('Direct database imports')
    for (const file of context.files.collect(['src'], new Set(['.js', '.ts', '.tsx']))) {
      const source = context.cache.readSource(file)
      if (!source.includes("from 'database-client'")) continue
      section.add({
        ruleId: 'direct-import',
        file: toRelativePosix(context.rootDir, file),
        message: '请通过 data package 访问数据库。',
      })
    }
  },
})
```

公共包只承诺四个入口：

- `@velaros/arch-guard`：配置、Runner 和结果模型；
- `@velaros/arch-guard/plugin`：Check/插件协议与受支持的分析工具；
- `@velaros/arch-guard/checks`：公共通用检查；
- `@velaros/arch-guard/reporters`：Reporter 工厂。

源码内部路径不属于公共 API。

## Baseline

存量项目可以先记录当前问题，再只阻止新增问题：

```bash
arch-guard baseline update
arch-guard run
```

默认文件是 `.arch-guard/baseline.json`。它代表明确的迁移边界，应和代码一起提交。

## Autofix 安全边界

Autofix 默认关闭，只能由配置中的 `fix: true` 或 CLI `--fix` 开启：

```bash
arch-guard run --changed --fix
```

引擎会按文件和阶段组织修复，同一阶段从右向左应用 offset、去重相同位置、原子写入，然后清理缓存并重新检查，再进入下一阶段。整个过程有固定迭代上限，避免无限修复。

执行后仍应检查 diff。插件作者应只提供确定、窄范围的修复。

## 临时暂缓

暂缓标记在 baseline 匹配前处理，必须同时写明 Check id 与原因：

```js
// @arch-guard:suspend-file example/generated-contract 原因：由 schema compiler 生成，跟踪 issue #123。
```

```js
// @arch-guard:suspend example/legacy-boundary 原因：兼容层将在 issue #456 后删除。
legacyCall()
```

它用于可追踪的技术债，不应代替正式配置。

## 开发

```bash
npm install
npm run check
```

`npm run check` 会完成类型检查、构建、Node 测试和发布包内容验证。

## 许可证

MIT © Error-Zhang
