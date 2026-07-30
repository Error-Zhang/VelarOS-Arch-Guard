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

```bash
npm install --save-dev @velaros-ai/arch-guard
```

也可以安装带版本标签的 GitHub Release（仓库提交了编译后的 `dist/`，
`Error-Zhang/VelarOS-Arch-Guard#v0.1.1` 无需构建即可消费）；推荐以 npm registry 为准。

要求 Node.js 20 或更高版本，不要求 Bun。

## 快速开始

```bash
npx arch-guard init
npx arch-guard doctor
npx arch-guard run
```

`init` 会生成一份可直接运行的 `arch-guard.config.mjs`：

```js
import { defineConfig } from '@velaros-ai/arch-guard'
import { crossFileDuplication } from '@velaros-ai/arch-guard/checks'

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
import { defineCheck, toRelativePosix } from '@velaros-ai/arch-guard/plugin'

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

公共包只承诺五个入口：

- `@velaros-ai/arch-guard`：配置、Runner 和结果模型；
- `@velaros-ai/arch-guard/plugin`：Check/插件协议与受支持的分析工具；
- `@velaros-ai/arch-guard/checks`：公共通用检查；
- `@velaros-ai/arch-guard/checks/code-style`：可选的写法规则集（见下节）；
- `@velaros-ai/arch-guard/reporters`：Reporter 工厂。

源码内部路径不属于公共 API。

## 可选规则集：`code-style/*`

`@velaros-ai/arch-guard/checks/code-style` 提供一组**按需启用**的语言级写法规则——缺席值表达、
守卫单源、早返代替深嵌套、表驱动分支、恒等转发、冗余严格比较、静默吞错、React 条件渲染、
注释团队语言等。默认一条都不开，必须显式注册。

这组规则**有主张**：判据只认识 TypeScript / JavaScript 语言构件（不含任何产品架构），但其中
若干条推荐一套 **helper 词表**（`isPresent` / `isPlainObject` / `optionalWhen` / `isEmpty` /
`stringifyPretty` / `Nullable<T>` …，由 `@velaros-ai/core` 提供）。你的代码库里有这套词表（或
等价物）就采纳，没有就跳过。规则本体**不硬编码任何仓库坐标**——扫描面一律从 check options 读。

```js
import { defineConfig, definePlugin } from '@velaros-ai/arch-guard'
import { codeStyleChecks, createCodeStyleDefaults } from '@velaros-ai/arch-guard/checks/code-style'

const codeStyle = definePlugin({
  name: 'my-code-style',
  checks: codeStyleChecks,
  defaults: createCodeStyleDefaults({
    scope: {
      scanRoots: ['packages'],
      runtimeRoots: ['packages/'],          // 多数规则只扫运行时源码
      frontendRoots: ['packages/ui/src/'],  // JSX 规则只扫前端面
      skipPatterns: ['^packages/core/src/typeGuards\\.ts$'],
    },
    perCheck: {
      'code-style/forbid-raw-timers': { allowFiles: ['packages/core/src/utils/TimerScope.ts'] },
    },
  }),
})

export default defineConfig({ plugins: [codeStyle], files: { roots: ['packages'] } })
```

scope 每个字段都可省，省了就是「不过滤」。在存量仓库接门的方式与其他 check 一致：先
`arch-guard baseline update` 冻结存量，再让棘轮拦新增。

`code-style/require-chinese-comments` 约束解释性注释的团队语言，并**豁免挂在导出声明上的 JSDoc
块**（公开 API 文档是写给外部消费者的）；要连 JSDoc 一起管，设 `exemptExportedJsDoc: false`。

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
