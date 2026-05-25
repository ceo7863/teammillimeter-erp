import { safeExportFileName } from "@/utils/tableExport";
import { parseStatementExcelPayload } from "./payload";
import { buildClientStatementWorksheet, buildWorkerStatementWorksheet } from "./template";
import { downloadWorksheet } from "./workbook";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export async function exportStatementExcelFromPayload(root: HTMLElement, fileName: string) {
  const payload = parseStatementExcelPayload(root);
  if (!payload) {
    throw new Error("내역서 엑셀 데이터를 찾을 수 없습니다.");
  }

  const built =
    payload.kind === "client" ? buildClientStatementWorksheet(payload) : buildWorkerStatementWorksheet(payload);

  await downloadWorksheet(built.ws, "내역서", `${safeExportFileName(fileName)}_${todayISO()}.xlsx`, built.logoAnchor);
}

export function serializeStatementExcelPayload(payload: import("./types").StatementExcelPayload) {
  return JSON.stringify(payload);
}

export * from "./payload";
export * from "./types";
