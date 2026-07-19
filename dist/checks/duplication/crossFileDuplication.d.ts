/**
 * 通用规则：跨文件大段重复实现检测。
 *
 * 朴素算法：对每个文件做"剥注释 → 过滤低信息行 → 行序列窗口 hash"，
 * 同一 hash 跨文件出现 ≥2 次即视为可疑重复。
 *
 * options:
 *   - `windowSize`: 滑窗行数，默认 12。
 *   - `minLineLength`: 单行最少非空字符数，默认 24，过滤格式化噪声。
 *   - `include` / `exclude` / `roots` / `extensions`: 标准过滤；测试目录默认会被排除。
 *   - `excludeFilePatterns`: 额外按 regex 排除文件路径。
 */
declare const crossFileDuplication: import("../../index.js").Check;
export { crossFileDuplication };
//# sourceMappingURL=crossFileDuplication.d.ts.map