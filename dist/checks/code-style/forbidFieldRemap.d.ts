/**
 * 检测对象字面量里"把 src.a 复制到 a、把 src.b 复制到 b、..."这种逐字段抄写，超过阈值即报告：
 * 业务代码不该手工搬运结构化数据；要么用 `{ ...src, ...overrides }`，要么把映射移到 mapper/normalizer。
 *
 * 豁免：mapper / adapter / normalizer / schema / contract / ipc 等"本来就是做映射"的文件。
 */
declare const forbidFieldRemap: import("../../index.js").Check;
export { forbidFieldRemap };
//# sourceMappingURL=forbidFieldRemap.d.ts.map