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
arch-guard baseline update|prune|migrate|check
```

只有 `baseline update` / `baseline prune` / `baseline migrate` 会写基线；`run` 与 `verify` 纯只读。

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

### 基线是棘轮，因此只有三个命令可以写它

| 命令 | 作用 |
| --- | --- |
| `baseline update` | 重冻违规。支持 `--file` / `--changed` / `--staged` / `--only` / `--skip` / `--tag`，**带作用域即合并**：域外条目一个字节都不动，域外违规也不会被冻进来 |
| `baseline prune` | 退役不再命中的条目，并把配额收缩到本次真正用掉的份数。带作用域时拒绝执行；本次一条都没命中时拒绝清空（`--force` 可强制） |
| `baseline migrate` | 给旧版本写下的条目补 `contentDigest` 与配额，并报出这次迁移**准确**会收回多少条豁免 |

除此之外全是只读的。具体说：

* `run` / `verify` / `list` / `explain` / `doctor` 不碰这个文件。0.3.0 之前 `run` **默认**剪枝，
  于是「看一眼违规」成了会改棘轮的动作：跑一次 `run` 能把红的跑成绿的，`git checkout` 回基线又
  变红——门自己在改判据。`--no-prune-stale-baseline` 仍可传，但现在是空操作。
* 裸 `arch-guard baseline` 打印用法并 exit 2。**没有默认动作**——用来发现子命令的那个词不许重写棘轮。
* `--dry-run` 打完整差异，不写盘。不认识的长选项一律 exit 2 而不是被忽略——`--dry-run` 打错字
  不能悄悄变成一次写盘。
* 作用域解析下来是**零个**可扫文件（`--changed` 时 diff 全是 `.md`、`--staged` 没暂存 TS）＝写命令
  什么都不做，而不是全仓重冻。读命令**照常跑**（不读文件扫描面的 check 本来就报全仓，跳过它们
  等于让门变松），但会明说「一个文件都没扫」——「扫了零个」永远不许长得像「扫完了没问题」。
  `verify --json` 用 `emptyFileScope` 携带这一位。
* 内容一模一样的写入会被跳过，因此文件 mtime 只在棘轮真的动了时才变。

优先用带作用域的 update。不带作用域的 `baseline update` 会把**当前全部**违规冻死，包括上次冻结
之后别人写的新债；它会把每一条新冻的条目、以及每一条配额变大的条目逐条打出来。

**`--skip` 不是作用域。** 它说的是「除了 X」，也就是其余每一条 check 仍然盖着全仓，所以
`baseline update --skip X` 是不折不扣的全仓重冻。它仍然按**合并**语义生效——X 的条目逐字节保留
——但汇总行会如实写成 `whole repository, minus --skip X`，并保留「你正在冻别人写的债」那句警告。
真要收窄，用 `--file` / `--changed` / `--staged` / `--only` / `--tag`。

### 条目身份，以及它现在还做不到的事

条目的 key 是 `checkId + ruleId + fingerprint`，而 fingerprint 是 check 传进来的 `fingerprintInput`
的哈希。多数规则用 `file::line::kind` 拼这个串——于是同文件同行同规则的**两条不同违规**会撞成
同一个指纹，棘轮就会豁免一条它从没见过的违规。因此条目还带一个 `contentDigest`（违规 message
去掉 `path:line:` 前缀后的哈希），**两者同时命中**才豁免。

身份还有第三块：**`count`**（缺省 1），一条条目豁免几条同形态的违规。只按 key 查表是一次
Map 命中、不做算术，于是一条冻结记录可以无限次生效：冻掉一条 `typeof x === 'string'`，再把这行
复制成三份，门照样是绿的。摘要救不了它——三份逐字相同的表达式摘要也相同。只有计数能。

* 没有 digest 的条目（≤ 0.2.x 写的）沿用只比指纹、不计数的旧口径，旧基线不迁移也**逐字节**照常工作。
* `baseline update` 冻结时一律写 digest 与配额。
* `baseline migrate` 给存量基线补 digest 与配额。内容取自**条目自己冻着的 message**，不是当前代码：
  于是「冻的东西已经不在了、指纹却盖着别的违规」会被报出来并开始判红，而不是继续替新来的挡枪。
  **每一条都补**，包括本次 run 匹配不到的那些——它们的 message 就在文件里，摘要离线可算；不补则
  那个 `(文件, 行, 规则)` 槽位仍然通配，等于一张永久空白支票。`migrate --dry-run` 会把全量违规
  分别过一遍迁移前后的基线，报出**准确**有多少条今天被豁免的违规将不再被豁免。

已知缺口，按扎手程度排：

1. 指纹里仍带行号，所以代码搬家（或上面加一行 import）会让冻结条目变 stale、原封不动的违规被当成
   新增。临时解法是 `baseline update --file <搬走的文件>` 重新锚定。
2. 有些规则的 message 里根本不含违规内容（`forbid-swallowed-errors`、`require-error-logging`、
   `forbid-redundant-else-after-return`），这些规则的摘要退化成**每规则一个常量**、不带区分力，
   实际只剩指纹与配额在约束。路线图第 2 条是它的解。

### 基线路线图

1. **内容键计数棘轮**：把逐条指纹换成 `(file, checkId, ruleId, contentKey) → count`。重排、
   格式化、行号漂移、加 import 全部免疫；同形态多出第 N+1 条仍然红；合并冲突退化成比大小。
2. **`ViolationInput.contentKey`**：让 check 显式声明与行号无关的内容键，不再从 message 推导，
   这样改一句措辞不会让 digest 集体失效。
3. **结构锚**（`file > 外层具名作用域 > 表达式文本`）只用于给人读的 `examples[]`，非权威、允许过期。

## Autofix 安全边界

Autofix 默认关闭，只能由配置中的 `fix: true` 或 CLI `--fix` 开启：

```bash
arch-guard run --changed --fix
```

引擎会按文件和阶段组织修复，同一阶段从右向左应用 offset、去重相同位置、原子写入，**再统一补齐
修复所需的 import**，然后清理缓存并重新检查，再进入下一阶段。整个过程有固定迭代上限，避免无限修复。

### 会引入名字的修复

把 `typeof x === 'string'` 改写成 `isString(x)` 的修复引入了一个文件里可能没有的标识符。两个调用：

* `fix.planNamedImport(file, module, name, offset)`——**在写任何东西之前**先问：这个名字在那个位置
  能不能用。`satisfied` = 那里解析到的已经是同模块的值 import；`insert` = 名字自由；
  `blocked` = 被别的东西占着。
* `fix.requireNamedImport(file, module, name)`——声明这条 import。引擎把插入推迟到本轮全部替换
  落盘之后（import 插在文件头会把其它修复持有的 offset 全部顶掉），重新读盘后幂等执行：同模块
  已有的值 import 就地扩充，同模块的 `import type` 不会被挪用。

**拿到 `blocked` 的修复必须抛出、不许继续。** 表达式改了、import 没补是最坏的结局：文件不编译，
而且没人说过一句话。引擎接住这个抛出，文件一个字节都不动，本轮结束时按理由聚合打印；违规本身
照旧红着，什么都没丢。

`planNamedImport` 按 TypeScript 的口径解析名字，不是「全文件搜一遍有没有这个串」。后者会在三种
形态上出错：**别的**函数里一个不相干的 `const isString` 挡掉顶层用法需要的 import（改写照做、
import 不补）；从**别的模块**导入的同名符号挡掉它、于是修复把守卫悄悄接到外来函数上（能编译、
语义全错）；函数**参数**名叫 `isString` 根本不是变量声明，于是 import 补了又在被修的那个函数里被遮蔽。

内置 `code-style` 规则集会吐出约 28 个这样的原语，所以必须告诉它原语住在哪里：

```js
createCodeStyleDefaults({
  scope: { /* … */ },
  helpers: {
    module: '@your-scope/core',
    bySymbol: { stringifyPretty: '@your-scope/core/json' },
  },
})
```

**不写 `helpers` 时这些修复会被拒绝并报出来，什么都不写。** 旧行为是静默改盘，那是错的：`--fix`
会同时爆 `TS2304` 和随后的 `TS2322`（未解析的标识符不携带类型谓词，原本靠裸 `typeof` 完成的窄化
整体塌掉，报错数比缺失的 import 数还多），而且一个字都不打印。宿主真把这些原语注入成全局时明说：

```js
createCodeStyleDefaults({ scope: { /* … */ }, helpers: { assumeGlobals: true } })
```

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
