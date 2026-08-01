import { defineCheck } from '../../core/defineCheck.js';
import ts from 'typescript';
import { fixReplaceSpan, readHelperImportSources } from './_fix.js';
import { collectCodeStyleFiles, getCachedSourceFile, lineOf, snippetOf, unwrapParensExpression, walk, } from './_shared.js';
import { matchNumberOrNullTernary } from './finiteNumberGuardChains.js';
import { CodeStyleFixPhase } from './fixPhases.js';
import { matchTrimmedStringOrEmptyTernary } from './nonBlankStringGuardChains.js';
/**
 * 禁止内联 **`cond ? value : undefined`**（及反写 **`cond ? undefined : value`**）。
 *
 * - 一般条件不自动修复，避免把 callback truthiness 改成 `optionalWhen(callback, value)`
 * - **`x ? x : undefined`** → **`toOptional(x)`**（与 **`forbid-nullish-churn`** 分工）
 * - **`isNumber(x) ? x : undefined`** → **`toOptional(numberOrNull(x))`**（与 **`forbid-nullish-churn`** 同相位）
 * - **`isString(x) ? x : undefined`** → **`optionalWhen(isString, x)`**
 * - **`optionalWhen(isString, value) ?? fallback`** → **`optionalWhen(isString, value, fallback)`**
 */
const preferOptionalWhenOverConditionalUndefined = defineCheck({
    id: 'code-style/prefer-optional-when-over-conditional-undefined',
    title: 'Prefer optionalWhen over conditional undefined ternary',
    description: '业务代码不要写 `cond ? value : undefined`；用全局 optionalWhen(cond, value)。`x ? x : undefined` 用 toOptional(x)。optionalWhen 后接默认值时用第三参。',
    verifies: [
        '识别顶层 `cond ? value : undefined` 与 `cond ? undefined : value`。',
        '识别 `toOptional(cond ? value : undefined)` 并整段替换为 optionalWhen（self/number 守卫交给 forbid-nullish-churn）。',
        '识别 `optionalWhen(guard, value) ?? fallback` 并替换为 `optionalWhen(guard, value, fallback)`。',
        'arch-guard run --fix 自动替换。',
    ],
    tags: ['code-style', 'nullish-discipline'],
    defaultSeverity: 'error',
    run({ context, report }) {
        const section = report.section('Prefer optionalWhen over conditional undefined');
        const helpers = readHelperImportSources(context);
        for (const info of collectCodeStyleFiles(context)) {
            const sourceFile = getCachedSourceFile(context, info);
            walk(sourceFile, (node) => {
                if (ts.isBinaryExpression(node)) {
                    reportOptionalWhenFallbackCoalesce(info.relativePath, sourceFile, node, section, helpers);
                    return;
                }
                if (ts.isCallExpression(node)) {
                    reportToOptionalWrappedTernary(info.relativePath, sourceFile, node, section, helpers);
                    return;
                }
                if (!ts.isConditionalExpression(node))
                    return;
                if (enclosingToOptionalCall(node))
                    return;
                reportBareConditionalUndefinedTernary(info.relativePath, sourceFile, node, section, helpers);
            });
        }
    },
});
const NonNullishGuardFallbackNames = new Set([
    'isPresent',
    'isBoolean',
    'isTrue',
    'isFalse',
    'isString',
    'isNonBlankString',
    'isNumber',
    'isPositiveNumber',
    'isFiniteNumber',
    'isFunction',
    'isBigInt',
    'isSymbol',
    'isObject',
    'isRecord',
    'isPlainObject',
    'isArray',
    'isNonEmptyArray',
]);
function reportOptionalWhenFallbackCoalesce(relativePath, sourceFile, node, section, helpers) {
    const replacement = readOptionalWhenFallbackReplacement(node, sourceFile);
    if (!replacement)
        return;
    const line = lineOf(sourceFile, node);
    section.add({
        ruleId: 'optional-when-fallback-third-arg',
        file: relativePath,
        line,
        message: `${relativePath}:${line}: "${snippetOf(sourceFile, node)}" — \`optionalWhen(...)\` 后接默认值请写成第三参 **\`${replacement}\`**（可 \`arch-guard run --fix\`）。`,
        fingerprintInput: `${relativePath}::${line}::optional-when-fallback-third-arg`,
        fixPhase: CodeStyleFixPhase.preferOptionalWhenOverConditionalUndefined,
        fixStartOffset: node.getStart(sourceFile),
        applyFix: fixReplaceText(relativePath, sourceFile, node, replacement, helpers),
    });
}
function readOptionalWhenFallbackReplacement(node, sourceFile) {
    if (node.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken)
        return undefined;
    const call = unwrapParensExpression(node.left);
    if (!ts.isCallExpression(call))
        return undefined;
    const callee = unwrapParensExpression(call.expression);
    if (!ts.isIdentifier(callee) || callee.text !== 'optionalWhen')
        return undefined;
    if (call.arguments.length !== 2)
        return undefined;
    const guard = unwrapParensExpression(call.arguments[0]);
    if (!ts.isIdentifier(guard) || !NonNullishGuardFallbackNames.has(guard.text))
        return undefined;
    const value = call.arguments[1].getText(sourceFile);
    const fallback = node.right.getText(sourceFile);
    return `optionalWhen(${guard.getText(sourceFile)}, ${value}, ${fallback})`;
}
function reportToOptionalWrappedTernary(relativePath, sourceFile, call, section, helpers) {
    const shape = readToOptionalUndefinedTernary(call);
    if (!shape)
        return;
    if (readTruthySelfUndefinedTernaryFromShape(shape, sourceFile))
        return;
    if (readNumberGuardUndefinedSelfFromShape(shape, sourceFile))
        return;
    const guardSelf = readNonNullishGuardUndefinedSelfFromShape(shape, sourceFile);
    if (!guardSelf)
        return;
    const line = lineOf(sourceFile, call);
    const replacement = `optionalWhen(${guardSelf.guardName}, ${formatOperand(guardSelf.value, sourceFile)})`;
    section.add({
        ruleId: 'to-optional-conditional-undefined-to-optional-when',
        file: relativePath,
        line,
        message: `${relativePath}:${line}: "${snippetOf(sourceFile, call)}" — \`toOptional(cond ? value : undefined)\` 请写成 **\`${replacement}\`**（可 \`arch-guard run --fix\`）。`,
        fingerprintInput: `${relativePath}::${line}::to-optional-conditional-undefined`,
        fixPhase: CodeStyleFixPhase.preferOptionalWhenOverConditionalUndefined,
        fixStartOffset: call.getStart(sourceFile),
        applyFix: fixReplaceText(relativePath, sourceFile, call, replacement, helpers),
    });
}
function reportBareConditionalUndefinedTernary(relativePath, sourceFile, node, section, helpers) {
    if (readIsPresentNullCoalesce(node, sourceFile))
        return;
    if (matchNumberOrNullTernary(node, sourceFile))
        return;
    if (matchTrimmedStringOrEmptyTernary(node, sourceFile))
        return;
    const truthySelf = readTruthySelfUndefinedTernary(node, sourceFile);
    if (truthySelf) {
        const line = lineOf(sourceFile, node);
        const replacement = `toOptional(${formatOperand(truthySelf, sourceFile)})`;
        section.add({
            ruleId: 'truthy-self-undefined-ternary-to-optional',
            file: relativePath,
            line,
            message: `${relativePath}:${line}: "${snippetOf(sourceFile, node)}" — \`x ? x : undefined\` 请写成 **\`${replacement}\`**（可 \`arch-guard run --fix\`）。`,
            fingerprintInput: `${relativePath}::${line}::truthy-self-undefined-ternary`,
            fixPhase: CodeStyleFixPhase.simplifyToOptionalTruthySelfTernary,
            fixStartOffset: node.getStart(sourceFile),
            applyFix: fixReplaceText(relativePath, sourceFile, node, replacement, helpers),
        });
        return;
    }
    const numberGuard = readNumberGuardUndefinedSelfTernary(node, sourceFile);
    if (numberGuard) {
        const line = lineOf(sourceFile, node);
        const replacement = `toOptional(numberOrNull(${formatOperand(numberGuard, sourceFile)}))`;
        section.add({
            ruleId: 'number-guard-undefined-ternary-to-optional',
            file: relativePath,
            line,
            message: `${relativePath}:${line}: "${snippetOf(sourceFile, node)}" — \`isNumber(x) ? x : undefined\` 请写成 **\`${replacement}\`**（可 \`arch-guard run --fix\`）。`,
            fingerprintInput: `${relativePath}::${line}::number-guard-undefined-ternary`,
            fixPhase: CodeStyleFixPhase.simplifyToOptionalTruthySelfTernary,
            fixStartOffset: node.getStart(sourceFile),
            applyFix: fixReplaceText(relativePath, sourceFile, node, replacement, helpers),
        });
        return;
    }
    const shape = readConditionalUndefinedShape(node);
    if (!shape)
        return;
    const guardSelf = readNonNullishGuardUndefinedSelfFromShape(shape, sourceFile);
    if (guardSelf) {
        const line = lineOf(sourceFile, node);
        const replacement = `optionalWhen(${guardSelf.guardName}, ${formatOperand(guardSelf.value, sourceFile)})`;
        section.add({
            ruleId: 'guard-self-undefined-ternary-to-optional-when',
            file: relativePath,
            line,
            message: `${relativePath}:${line}: "${snippetOf(sourceFile, node)}" — \`isX(x) ? x : undefined\` 请写成 **\`${replacement}\`**（可 \`arch-guard run --fix\`）。`,
            fingerprintInput: `${relativePath}::${line}::guard-self-undefined-ternary`,
            fixPhase: CodeStyleFixPhase.preferOptionalWhenOverConditionalUndefined,
            fixStartOffset: node.getStart(sourceFile),
            applyFix: fixReplaceText(relativePath, sourceFile, node, replacement, helpers),
        });
        return;
    }
    if (shapeDependsOnConditionNarrowing(shape))
        return;
}
function getNullishKind(node) {
    if (node.kind === ts.SyntaxKind.NullKeyword)
        return 'null';
    if (ts.isIdentifier(node) && node.text === 'undefined')
        return 'undefined';
    if (ts.isVoidExpression(node))
        return 'undefined';
    return undefined;
}
function readConditionalUndefinedShape(node) {
    const whenFalse = unwrapParensExpression(node.whenFalse);
    if (getNullishKind(whenFalse) === 'undefined')
        return { condition: node.condition, value: node.whenTrue, invert: false };
    const whenTrue = unwrapParensExpression(node.whenTrue);
    if (getNullishKind(whenTrue) === 'undefined')
        return { condition: node.condition, value: node.whenFalse, invert: true };
    return undefined;
}
function readIsPresentNullCoalesce(node, sourceFile) {
    if (getNullishKind(unwrapParensExpression(node.whenFalse)) !== 'null')
        return false;
    const cond = unwrapParensExpression(node.condition);
    if (!ts.isCallExpression(cond))
        return false;
    const callee = unwrapParensExpression(cond.expression);
    if (!ts.isIdentifier(callee) || callee.text !== 'isPresent')
        return false;
    if (cond.arguments.length !== 1)
        return false;
    const condArg = cond.arguments[0];
    if (!condArg)
        return false;
    const inner = unwrapParensExpression(condArg);
    const whenTrue = unwrapParensExpression(node.whenTrue);
    return inner.getText(sourceFile) === whenTrue.getText(sourceFile);
}
function readTruthySelfUndefinedTernary(node, sourceFile) {
    const shape = readConditionalUndefinedShape(node);
    if (!shape || shape.invert)
        return undefined;
    return readTruthySelfUndefinedTernaryFromShape(shape, sourceFile);
}
function readTruthySelfUndefinedTernaryFromShape(shape, sourceFile) {
    const condition = unwrapParensExpression(shape.condition);
    const whenTrue = unwrapParensExpression(shape.value);
    if (condition.getText(sourceFile) !== whenTrue.getText(sourceFile))
        return undefined;
    return condition;
}
function readNumberGuardUndefinedSelfTernary(node, sourceFile) {
    const shape = readConditionalUndefinedShape(node);
    if (!shape || shape.invert)
        return undefined;
    return readNumberGuardUndefinedSelfFromShape(shape, sourceFile);
}
function readNumberGuardUndefinedSelfFromShape(shape, sourceFile) {
    const condition = unwrapParensExpression(shape.condition);
    if (!ts.isCallExpression(condition))
        return undefined;
    const callee = unwrapParensExpression(condition.expression);
    if (!ts.isIdentifier(callee) || callee.text !== 'isNumber')
        return undefined;
    if (condition.arguments.length !== 1)
        return undefined;
    const guardArg = condition.arguments[0];
    if (!guardArg)
        return undefined;
    const candidate = unwrapParensExpression(guardArg);
    const whenTrue = unwrapParensExpression(shape.value);
    if (candidate.getText(sourceFile) !== whenTrue.getText(sourceFile))
        return undefined;
    return candidate;
}
function readNonNullishGuardUndefinedSelfFromShape(shape, sourceFile) {
    if (shape.invert)
        return undefined;
    const condition = unwrapParensExpression(shape.condition);
    if (!ts.isCallExpression(condition))
        return undefined;
    const callee = unwrapParensExpression(condition.expression);
    if (!ts.isIdentifier(callee) || !NonNullishGuardFallbackNames.has(callee.text))
        return undefined;
    if (condition.arguments.length !== 1)
        return undefined;
    const guardArg = condition.arguments[0];
    if (!guardArg)
        return undefined;
    const candidate = unwrapParensExpression(guardArg);
    const whenTrue = unwrapParensExpression(shape.value);
    if (candidate.getText(sourceFile) !== whenTrue.getText(sourceFile))
        return undefined;
    return { guardName: callee.text, value: candidate };
}
function shapeDependsOnConditionNarrowing(shape) {
    const conditionIdentifiers = identifiersIn(shape.condition);
    if (conditionIdentifiers.size === 0)
        return false;
    const valueIdentifiers = identifiersIn(shape.value);
    for (const name of valueIdentifiers) {
        if (conditionIdentifiers.has(name))
            return true;
    }
    return false;
}
function identifiersIn(node) {
    const names = new Set();
    function visit(current) {
        if (ts.isIdentifier(current)) {
            names.add(current.text);
        }
        ts.forEachChild(current, visit);
    }
    visit(node);
    return names;
}
function readToOptionalUndefinedTernary(call) {
    const callee = unwrapParensExpression(call.expression);
    if (!ts.isIdentifier(callee) || callee.text !== 'toOptional')
        return undefined;
    if (call.arguments.length !== 1)
        return undefined;
    const argument = call.arguments[0];
    if (!argument)
        return undefined;
    const ternary = unwrapParensExpression(argument);
    if (!ts.isConditionalExpression(ternary))
        return undefined;
    return readConditionalUndefinedShape(ternary);
}
function enclosingToOptionalCall(node) {
    let parent = node.parent;
    while (ts.isParenthesizedExpression(parent))
        parent = parent.parent;
    if (!ts.isCallExpression(parent))
        return false;
    const argument = parent.arguments[0];
    if (!argument)
        return false;
    if (unwrapParensExpression(argument) !== unwrapParensExpression(node))
        return false;
    return readToOptionalUndefinedTernary(parent) !== undefined;
}
function formatOperand(expression, sourceFile) {
    const text = expression.getText(sourceFile);
    if (ts.isIdentifier(expression) ||
        expression.kind === ts.SyntaxKind.ThisKeyword ||
        expression.kind === ts.SyntaxKind.SuperKeyword ||
        ts.isNonNullExpression(expression) ||
        ts.isPropertyAccessExpression(expression) ||
        ts.isElementAccessExpression(expression) ||
        ts.isMetaProperty(expression))
        return text;
    return `(${text})`;
}
function fixReplaceText(relativePath, sourceFile, node, replacement, helpers) {
    return fixReplaceSpan({
        relativePath,
        start: node.getStart(sourceFile),
        end: node.getEnd(),
        replacement,
        helpers,
    }).applyFix;
}
export { preferOptionalWhenOverConditionalUndefined };
//# sourceMappingURL=preferOptionalWhenOverConditionalUndefined.js.map