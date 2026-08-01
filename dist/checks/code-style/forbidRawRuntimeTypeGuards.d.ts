import ts from 'typescript';
/**
 * 禁止业务代码用手写 `typeof … === '…'`（除 `'undefined'` 由 forbid-redundant-strict-literal-comparison 覆盖）、
 * `Array.isArray`，以及可合并的 `typeof x === 'object' && x !== null`；**整段**可交给 **`prefer-is-plain-object`**（`&&`/`||` 三连等）、**`prefer-is-finite-number-guard`**（`typeof 'number'` 与 **`Number.isFinite`** 的二连）、**`prefer-number-or-null-ternary`**（`typeof 'number'` / **`isNumber`** 与 **同式 + `null` 三元**）、**`prefer-is-non-blank-string-guard`**（`typeof 'string'` / **`isString`** 与 **trim 真值** 的二连）、或 **`prefer-trimmed-string-or-empty-ternary`**（`typeof 'string'` / **`isString`** 与 **trim + `''` 三元**）时，本条对相应子式 **跳过**，避免先被拆成中间态。
 *
 * 自动修复：`arch-guard run --fix` 或配置 `fix: true`（仍遵守按 rule 关闭 `fix: false`）。
 */
declare const forbidRawRuntimeTypeGuards: import("../../index.js").Check;
declare function readTypeofObjectStrictNotNullMerge(node: ts.BinaryExpression, sourceFile: ts.SourceFile): {
    expr: ts.Expression;
} | undefined;
export { forbidRawRuntimeTypeGuards, readTypeofObjectStrictNotNullMerge };
//# sourceMappingURL=forbidRawRuntimeTypeGuards.d.ts.map