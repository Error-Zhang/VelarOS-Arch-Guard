import ts from 'typescript';
import { parseSourceFile } from './ts.js';
/**
 * 判断在 `atOffset` 处引入 `importName` 是否安全。
 *
 * - `satisfied`：该位置解析到的就是同模块的值 import，什么都不用做。
 * - `insert`：该位置这个名字是自由的，补一条顶层 import 即可。
 * - `blocked`：该位置这个名字已经被别的东西绑走了（顶层的同名声明 / 来自别的模块的同名导入 /
 *   把顶层 import 遮蔽掉的内层变量或参数）。此时**整次修复都要放弃**。
 */
function planNamedImportInSource(filePath, source, moduleSpecifier, importName, atOffset) {
    const sourceFile = parseSourceFile(filePath, source);
    const innermost = innermostBindingAt(collectValueBindings(sourceFile, moduleSpecifier), importName, atOffset);
    if (!innermost)
        return { kind: 'insert' };
    if (innermost.sameModuleValueImport)
        return { kind: 'satisfied' };
    return {
        kind: 'blocked',
        reason: `\`${importName}\` is already bound at that position by ${innermost.description}; ` +
            `arch-guard will not rewrite the code to call a \`${importName}\` it cannot prove is ` +
            `the one from '${moduleSpecifier}'.`,
    };
}
function ensureNamedImportInSource(filePath, source, moduleSpecifier, importName) {
    const sourceFile = parseSourceFile(filePath, source);
    const bindings = collectValueBindings(sourceFile, moduleSpecifier).filter((binding) => binding.name === importName && binding.topLevel);
    if (bindings.some((binding) => binding.sameModuleValueImport)) {
        return { text: source, changed: false };
    }
    const conflict = bindings[0];
    if (conflict) {
        return {
            text: source,
            changed: false,
            blocked: `\`${importName}\` is already declared at the top level of this file by ${conflict.description}`,
        };
    }
    const existing = findValueImportOfModule(sourceFile, moduleSpecifier);
    if (existing) {
        const merged = mergeIntoExistingImport(source, existing, importName);
        if (merged)
            return { text: merged, changed: true };
    }
    return {
        text: insertNewImportStatement(sourceFile, source, moduleSpecifier, importName),
        changed: true,
    };
}
function innermostBindingAt(bindings, name, offset) {
    let best;
    for (const binding of bindings) {
        if (binding.name !== name)
            continue;
        if (offset < binding.scopeStart || offset > binding.scopeEnd)
            continue;
        if (!best || binding.scopeEnd - binding.scopeStart < best.scopeEnd - best.scopeStart) {
            best = binding;
        }
    }
    return best;
}
/**
 * 收集文件里占着**值空间名字**的全部同名绑定。
 *
 * `interface` / `type` 声明只活在类型空间，不算。但 `import type { X }` 算——它在值空间
 * 实实在在占着那个名字：再补一条同名的值 import 是 `TS2300 Duplicate identifier`，
 * 直接当值用是 `TS1361`。所以类型专用 import 只会是 blocker，永远不是「已经满足了」。
 */
function collectValueBindings(sourceFile, moduleSpecifier) {
    const bindings = [];
    // 从 0 起算：`getStart()` 会跳过文件头 trivia，而 fixer 可能拿 `getFullStart()` 提问
    // （首个语句上就是 0）。区间对不上时顶层绑定会被整体漏掉，于是「顶层已有同名符号」
    // 这一档判不出来——改写照做、import 补不上，或者悄悄接到别人的同名函数上。
    const fileScope = { start: 0, end: sourceFile.end, topLevel: true };
    const add = (name, scope, description, sameModuleValueImport = false) => {
        bindings.push({
            name,
            scopeStart: scope.start,
            scopeEnd: scope.end,
            topLevel: scope.topLevel,
            sameModuleValueImport,
            description,
        });
    };
    const addBindingName = (name, scope, description) => {
        if (ts.isIdentifier(name)) {
            add(name.text, scope, description);
            return;
        }
        for (const element of name.elements) {
            if (ts.isBindingElement(element))
                addBindingName(element.name, scope, description);
        }
    };
    const visit = (node, scope) => {
        if (ts.isImportDeclaration(node)) {
            collectImportBindings(node, moduleSpecifier, add, fileScope);
            return;
        }
        if (ts.isImportEqualsDeclaration(node)) {
            add(node.name.text, fileScope, `an \`import =\` declaration`);
            return;
        }
        if (ts.isVariableDeclaration(node)) {
            addBindingName(node.name, scope, 'a local declaration in this file');
        }
        if ((ts.isFunctionDeclaration(node) ||
            ts.isClassDeclaration(node) ||
            ts.isEnumDeclaration(node) ||
            ts.isModuleDeclaration(node)) &&
            node.name !== undefined &&
            ts.isIdentifier(node.name)) {
            add(node.name.text, scope, 'a declaration in this file');
        }
        if (ts.isCatchClause(node) && node.variableDeclaration) {
            addBindingName(node.variableDeclaration.name, nodeScope(node), 'a catch clause variable');
        }
        if (isFunctionLike(node)) {
            const inner = nodeScope(node);
            if ((ts.isFunctionExpression(node) || ts.isClassExpression(node)) && node.name) {
                add(node.name.text, inner, 'a named function/class expression');
            }
            for (const parameter of node.parameters) {
                addBindingName(parameter.name, inner, 'a parameter of the enclosing function');
            }
            ts.forEachChild(node, (child) => visit(child, inner));
            return;
        }
        ts.forEachChild(node, (child) => visit(child, scope));
    };
    ts.forEachChild(sourceFile, (child) => visit(child, fileScope));
    return bindings;
}
function collectImportBindings(node, moduleSpecifier, add, fileScope) {
    const clause = node.importClause;
    if (!clause)
        return;
    const specifier = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : '';
    const sameModule = specifier === moduleSpecifier;
    // 类型专用 import 照样收集：它在值空间占着这个名字（TS2300 / TS1361），只是永远不可能
    // 是「我们要的那个值」。丢掉它 = 补一条同名 import 上去，写出 Duplicate identifier。
    const clauseTypeOnly = clause.isTypeOnly;
    const from = clauseTypeOnly
        ? `a type-only import from '${specifier}' (it still occupies the name in value space)`
        : `an import from '${specifier}'`;
    if (clause.name)
        add(clause.name.text, fileScope, `a default ${from}`, false);
    const bindings = clause.namedBindings;
    if (!bindings)
        return;
    if (ts.isNamespaceImport(bindings)) {
        add(bindings.name.text, fileScope, `a namespace ${from}`, false);
        return;
    }
    for (const element of bindings.elements) {
        const typeOnly = clauseTypeOnly || element.isTypeOnly;
        // 别名要看**导出名**，不是本地名。`import { toOptional as isString } from 'mod'`
        // 里的 `isString` 绑的是 `toOptional`；只比模块说明符的话它会被判成「已经满足」，
        // 于是不补 import，而改写出来的 `isString(x)` 悄悄调用了另一个函数——能编译、语义全错。
        const exportedName = element.propertyName?.text;
        const aliased = exportedName !== undefined && exportedName !== element.name.text;
        const isTheWantedValue = sameModule && !typeOnly && !aliased;
        const description = aliased
            ? `an aliased import (\`${exportedName} as ${element.name.text}\`) from '${specifier}'`
            : typeOnly && !clauseTypeOnly
                ? `a type-only import of '${specifier}' (it still occupies the name in value space)`
                : from;
        add(element.name.text, fileScope, description, isTheWantedValue);
    }
}
function isFunctionLike(node) {
    return (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isConstructorDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node));
}
function nodeScope(node) {
    return { start: node.pos, end: node.end, topLevel: false };
}
/** 找到同一模块的**值** import（`import type { … }` 不算，往里塞值会被 erase 掉）。 */
function findValueImportOfModule(sourceFile, moduleSpecifier) {
    for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement))
            continue;
        if (!ts.isStringLiteral(statement.moduleSpecifier))
            continue;
        if (statement.moduleSpecifier.text !== moduleSpecifier)
            continue;
        const clause = statement.importClause;
        if (!clause || clause.isTypeOnly)
            continue;
        const bindings = clause.namedBindings;
        // 只能往 `{ … }` 里塞；namespace import 与纯 default import 走新语句。
        if (bindings && ts.isNamespaceImport(bindings))
            continue;
        if (!bindings && !clause.name)
            continue;
        if (!bindings)
            continue;
        return statement;
    }
    return undefined;
}
/**
 * 把名字并进现有的 `{ … }`。
 *
 * 原清单按字母序时插到正确位置（多数仓库有 import 排序 lint），否则追加到末尾。
 * 保留原始文本的缩进风格：单行清单原地拼，多行清单按最后一项的缩进另起一行。
 */
function mergeIntoExistingImport(source, declaration, importName) {
    const bindings = declaration.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings))
        return undefined;
    const elements = bindings.elements;
    if (elements.length === 0)
        return undefined;
    const names = elements.map((element) => element.name.text);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    const alreadySorted = names.every((name, index) => name === sorted[index]);
    const insertIndex = alreadySorted
        ? names.findIndex((name) => name.localeCompare(importName) > 0)
        : -1;
    const multiline = source.slice(bindings.getStart(), bindings.getEnd()).includes('\n');
    if (insertIndex === -1) {
        const last = elements[elements.length - 1];
        const anchor = last.getEnd();
        const insertion = multiline
            ? `,\n${indentOfLineAt(source, last.getStart())}${importName}`
            : `, ${importName}`;
        return `${source.slice(0, anchor)}${insertion}${source.slice(anchor)}`;
    }
    const target = elements[insertIndex];
    const anchor = target.getStart();
    const insertion = multiline
        ? `${importName},\n${indentOfLineAt(source, anchor)}`
        : `${importName}, `;
    return `${source.slice(0, anchor)}${insertion}${source.slice(anchor)}`;
}
function indentOfLineAt(source, position) {
    const lineStart = source.lastIndexOf('\n', position - 1) + 1;
    const match = /^[\t ]*/.exec(source.slice(lineStart, position));
    return match ? match[0] : '';
}
/**
 * 插入一条新的 import 语句。
 *
 * 落点：最后一条顶层 import 之后；没有 import 时落在 shebang / `'use strict'` /
 * **游离的**文件头注释块之后。
 */
function insertNewImportStatement(sourceFile, source, moduleSpecifier, importName) {
    const statement = `import { ${importName} } from '${moduleSpecifier}'`;
    const imports = sourceFile.statements.filter((node) => ts.isImportDeclaration(node));
    const lastImport = imports[imports.length - 1];
    if (lastImport) {
        const anchor = lastImport.getEnd();
        const rest = source.slice(anchor);
        const semicolon = rest.startsWith(';') ? 1 : 0;
        const position = anchor + semicolon;
        return `${source.slice(0, position)}\n${statement}${source.slice(position)}`;
    }
    // position 是首个语句所在行的行首，因此前缀天然以换行（或为空）结尾，直接拼即可。
    const position = findHeaderInsertPosition(sourceFile, source);
    return `${source.slice(0, position)}${statement}\n\n${source.slice(position)}`;
}
/**
 * 没有任何 import 时，新 import 该落在哪一行。
 *
 * 只能落在**游离**的文件头注释之后：`getStart()` 跳过全部 trivia，于是紧贴着首个语句的
 * JSDoc 会被当成头部，import 插进注释与它描述的那个符号之间，把文档和被文档的东西拆开。
 * 判据是空行——注释与后面的东西之间隔了空行才算文件头，否则它属于那个符号。
 * 首个语句是 `'use strict'` 这类 prologue 时同样要跳过，import 不能排在 prologue 前面。
 */
function findHeaderInsertPosition(sourceFile, source) {
    const anchor = firstNonPrologueStatement(sourceFile);
    if (!anchor)
        return source.length;
    // shebang 不是注释，`getLeadingCommentRanges` 认不出它；从 0 开始扫会当场停下，
    // 于是 shebang 后面的真文件头注释也一起漏掉，import 最后插到 `#!` 之前把脚本弄坏。
    const shebangEnd = source.startsWith('#!')
        ? source.indexOf('\n') === -1
            ? source.length
            : source.indexOf('\n') + 1
        : 0;
    const scanStart = Math.max(shebangEnd, anchor.getFullStart());
    const comments = ts.getLeadingCommentRanges(source, scanStart) ?? [];
    const bodyStart = anchor.getStart(sourceFile);
    let headerEnd = scanStart;
    for (let index = 0; index < comments.length; index += 1) {
        const range = comments[index];
        const nextStart = comments[index + 1]?.pos ?? bodyStart;
        // 后面隔着空行 = 游离的文件头；否则这条注释属于紧随其后的符号，import 必须排在它前面。
        if (!/\n[^\S\n]*\n/.test(source.slice(range.end, nextStart)))
            break;
        headerEnd = range.end;
    }
    return nextContentLineStart(source, headerEnd);
}
function firstNonPrologueStatement(sourceFile) {
    for (const statement of sourceFile.statements) {
        const isPrologue = ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression);
        if (!isPrologue)
            return statement;
    }
    return undefined;
}
/** 从 `position` 起跳过空白行，落到下一段实内容所在行的行首。 */
function nextContentLineStart(source, position) {
    let cursor = position;
    let lineStart = position;
    while (cursor < source.length) {
        const character = source[cursor];
        if (character === '\n') {
            cursor += 1;
            lineStart = cursor;
            continue;
        }
        if (/\s/.test(character)) {
            cursor += 1;
            continue;
        }
        return lineStart;
    }
    return source.length;
}
export { ensureNamedImportInSource, planNamedImportInSource };
//# sourceMappingURL=ensureNamedImport.js.map