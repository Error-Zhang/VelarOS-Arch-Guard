/**
 * 原子写入：通过 `<path>.tmp` 中转 + `rename` 让读到的状态总是"前一个完整版本"或"新版本"，
 * 永远不会读到半写的文件。
 *
 * 该 helper 由 arch-guard 自己维护，避免反向依赖任何宿主项目；
 * 同样的 contract 在 core 那边也有一份，行为一致。
 *
 * 注意：`tmpSuffix` 默认 `.tmp`；目录会被自动 `mkdirSync({ recursive: true })`。
 */
declare function writeFileAtomically(filePath: string, content: string, tmpSuffix?: string): void;
export { writeFileAtomically };
//# sourceMappingURL=atomicWrite.d.ts.map