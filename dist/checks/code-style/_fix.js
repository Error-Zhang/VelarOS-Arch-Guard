/**
 * code-style 修复器的共享落点。
 *
 * 这一族规则原本各自持有一份逐字节相同的 `fixReplaceText` / `fixReplaceRange`，且**都只改表达式、
 * 不管 import**。19 条可 autofix 的规则里有 15 条会吐出 `isString` / `isEmpty` / `optionalWhen`
 * 这类具名原语，`--fix` 之后文件里并没有这些名字，于是 `TS2304` 叠加 `TS2322`（未解析标识符不
 * 携带类型谓词，窄化整体塌掉）。这里把替换和「补 import」并成同一个动作，规则只需说明
 * 「我引入了哪些名字」——由 {@link HelperPrimitiveNames} 从替换文本里机械识别。
 */
/** 这一族规则可能吐出的原语。补 import 时只认这张表，避免误伤用户标识符。 */
const HelperPrimitiveNames = [
    'isArray',
    'isBigInt',
    'isBlank',
    'isBoolean',
    'isEmpty',
    'isFalse',
    'isFiniteNumber',
    'isFunction',
    'isNonBlankString',
    'isNonEmptyArray',
    'isNotNull',
    'isNotUndefined',
    'isNull',
    'isNumber',
    'isObject',
    'isPlainObject',
    'isPositiveNumber',
    'isPresent',
    'isRecord',
    'isString',
    'isSymbol',
    'isTrue',
    'isUndefined',
    'numberOrNull',
    'optionalWhen',
    'stringifyPretty',
    'toNullable',
    'toOptional',
    'trimmedStringOrEmpty',
];
const NoHelperImports = { module: '', bySymbol: {}, assumeGlobals: false };
/** 从 check options 读出原语来源。 */
function readHelperImportSources(context) {
    const module = context.options.helperImportModule;
    const bySymbol = context.options.helperImportModuleBySymbol;
    return {
        module: typeof module === 'string' ? module : '',
        bySymbol: typeof bySymbol === 'object' && bySymbol !== null
            ? Object.fromEntries(Object.entries(bySymbol).filter(([, value]) => typeof value === 'string'))
            : {},
        assumeGlobals: context.options.helperAssumeGlobals === true,
    };
}
/** 单个原语的来源模块；没有配置时返回空串。 */
function moduleForHelper(sources, name) {
    return sources.bySymbol[name] ?? sources.module;
}
function resolveHelperImport(sources, name) {
    if (sources.assumeGlobals)
        return { kind: 'globals' };
    const module = moduleForHelper(sources, name);
    if (module)
        return { kind: 'module', module };
    return { kind: 'unconfigured' };
}
/**
 * 从替换文本里识别本次引入的原语。
 *
 * 只认「作为被调用者出现」的形态（`name(`），并排除成员访问（`x.isEmpty(`），
 * 避免把用户自己的方法名当成原语。
 */
const HelperCallPatterns = HelperPrimitiveNames.map((name) => [name, new RegExp(`(?<![.?\\w$])${name}\\s*\\(`)]);
function helpersIntroducedBy(replacement) {
    const found = [];
    for (const [name, pattern] of HelperCallPatterns) {
        if (pattern.test(replacement))
            found.push(name);
    }
    return found;
}
/**
 * 生成一次「替换 + 补 import」的修复。
 *
 * **先判后写**：所有要引入的名字都先过一遍 {@link FixContext.planNamedImport}，任何一个
 * 判不了（没配来源 / 那个位置这个名字已经被别的东西绑走了）就整次修复放弃、抛出理由，
 * 文件一个字节都不动。`--fix` 只有两种结局：写出能编译的代码，或者什么都不写并明说。
 *
 * import 不在这里写盘：见 {@link FixContext.requireNamedImport}，由引擎在本轮替换全部落盘后 flush。
 */
function fixReplaceSpan(input) {
    const { relativePath, start, end, replacement, helpers } = input;
    return {
        fixStartOffset: start,
        applyFix: (ctx) => {
            const pending = planHelperImports(ctx, relativePath, start, replacement, helpers);
            if (input.preserveLeadingTrivia === true) {
                ctx.replaceTextRange(relativePath, { start, end }, replacement);
            }
            else {
                const text = ctx.readTextFile(relativePath);
                ctx.writeTextFile(relativePath, `${text.slice(0, start)}${replacement}${text.slice(end)}`);
            }
            for (const { module, name } of pending) {
                ctx.requireNamedImport(relativePath, module, name);
            }
        },
    };
}
/** 改盘前的体检：算出要补哪些 import，任何一条不确定就抛出，让引擎放弃这次修复。 */
function planHelperImports(ctx, relativePath, atOffset, replacement, helpers) {
    const pending = [];
    for (const name of helpersIntroducedBy(replacement)) {
        const resolved = resolveHelperImport(helpers, name);
        if (resolved.kind === 'globals')
            continue;
        if (resolved.kind === 'unconfigured') {
            throw new Error(`the repair introduces \`${name}\` but this ruleset has no import source for it. ` +
                "Set `createCodeStyleDefaults({ helpers: { module: '@your/core' } })` (or " +
                '`helpers: { assumeGlobals: true }` if these primitives really are globals here).');
        }
        const plan = ctx.planNamedImport(relativePath, resolved.module, name, atOffset);
        if (plan.kind === 'blocked')
            throw new Error(plan.reason);
        if (plan.kind === 'insert')
            pending.push({ module: resolved.module, name });
    }
    return pending;
}
export { fixReplaceSpan, HelperPrimitiveNames, helpersIntroducedBy, moduleForHelper, NoHelperImports, readHelperImportSources, resolveHelperImport, };
//# sourceMappingURL=_fix.js.map