// Excel 通用工具：岗位侧（src/excel/*）与客服侧（src/cs/excel.ts）共用，禁止再各写一份。

export const BOOL_TRUE = new Set<unknown>(["是", "true", "TRUE", "True", "y", "Y", "yes", "1", 1, true]);
export const BOOL_FALSE = new Set<unknown>(["否", "false", "FALSE", "False", "n", "N", "no", "0", 0, false]);

/** 单元格 → 布尔；无法识别返回 undefined */
export function parseBool(cell: unknown): boolean | undefined {
  if (BOOL_TRUE.has(cell)) return true;
  if (BOOL_FALSE.has(cell)) return false;
  return undefined;
}

export function looksLikeExampleRow(row: Record<string, unknown>): boolean {
  const first = Object.values(row)[0];
  return typeof first === "string" && first.startsWith("示例");
}

export function isEmptyRow(row: Record<string, unknown>): boolean {
  return Object.values(row).every((v) => v === "" || v === null || v === undefined);
}

export function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function triggerDownload(ab: ArrayBuffer, filename: string): void {
  const blob = new Blob([ab], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
