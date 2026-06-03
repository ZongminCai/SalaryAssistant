import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { POSITION_CONFIGS } from "../positions/registry";
import { buildTemplate } from "./template";
import { parseUpload } from "./parse";
import { computeOne } from "../calc/compute";

function makeFileFromArrayBuffer(ab: ArrayBuffer, name: string): File {
  return new File([ab], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

describe("excel 模板生成 → 解析圆环", () => {
  it("每个岗位模板都有员工信息 sheet 并含全部字段列", () => {
    for (const cfg of Object.values(POSITION_CONFIGS)) {
      const ab = buildTemplate(cfg);
      const wb = XLSX.read(ab, { type: "array" });
      expect(wb.SheetNames).toContain("员工信息");
      expect(wb.SheetNames).toContain("填写说明");
      const ws = wb.Sheets["员工信息"];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      expect(rows.length).toBeGreaterThan(0);
      const headerKeys = Object.keys(rows[0] ?? {});
      for (const f of cfg.fields) {
        expect(headerKeys, `${cfg.label} 缺列 ${f.label}`).toContain(f.label);
      }
    }
  });

  it("跨境运营岗：示例行被识别+一行真实数据能解析并算出 21000", async () => {
    const cfg = POSITION_CONFIGS.cross_border_ops;
    // 用模板做基底，再把第 3 行（第一个空数据行）改为真实数据
    const ab = buildTemplate(cfg);
    const wb = XLSX.read(ab, { type: "array" });
    const ws = wb.Sheets["员工信息"];
    // 第 3 行是 row index 3（A3..），按字段顺序写
    const headers = cfg.fields.map((f) => f.label);
    const row = ["张三", "西安", "专员", 320, "", "", "", "否"];
    for (let i = 0; i < headers.length; i++) {
      const cellRef = XLSX.utils.encode_cell({ r: 2, c: i }); // r=2 即第 3 行
      ws[cellRef] = { v: row[i], t: typeof row[i] === "number" ? "n" : "s" };
    }
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const file = makeFileFromArrayBuffer(out, "test.xlsx");
    const { employees, fileErrors } = await parseUpload(file, cfg);
    expect(fileErrors).toEqual([]);
    expect(employees.length).toBe(1);
    const r = computeOne(employees[0]);
    expect(r.errors).toEqual([]);
    expect(r.grade).toBe("高级运营");
    expect(r.monthly_salary).toBe(21000);
  });

  it("视频内容岗：业绩低于区间会被合理报错（解析通过、计算给错误）", async () => {
    const cfg = POSITION_CONFIGS.video_content;
    const ab = buildTemplate(cfg);
    const wb = XLSX.read(ab, { type: "array" });
    const ws = wb.Sheets["员工信息"];
    const row = ["李四", 5];
    for (let i = 0; i < row.length; i++) {
      const cellRef = XLSX.utils.encode_cell({ r: 2, c: i });
      ws[cellRef] = { v: row[i], t: typeof row[i] === "number" ? "n" : "s" };
    }
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const file = makeFileFromArrayBuffer(out, "test.xlsx");
    const { employees } = await parseUpload(file, cfg);
    expect(employees.length).toBe(1);
    const r = computeOne(employees[0]);
    expect(r.monthly_salary).toBeNull();
    expect(r.errors.join(" ")).toMatch(/低于最低评级区间/);
  });
});
