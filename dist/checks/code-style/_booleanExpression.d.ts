import ts from 'typescript';
declare function formatBooleanCondition(condition: ts.Expression, sourceFile: ts.SourceFile): string;
declare function formatNegatedCondition(condition: ts.Expression, sourceFile: ts.SourceFile): string;
declare function formatConditionForAnd(condition: ts.Expression, sourceFile: ts.SourceFile): string;
declare function isSyntacticBooleanExpression(expression: ts.Expression): boolean;
export { formatBooleanCondition, formatConditionForAnd, formatNegatedCondition, isSyntacticBooleanExpression, };
//# sourceMappingURL=_booleanExpression.d.ts.map