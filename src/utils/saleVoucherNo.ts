type SaleVoucherLike = {
  id?: number | string;
  voucherNo?: string | number;
};

const MAX_EXCEL_STYLE_VOUCHER = 999_999_999;

/** voucherNo/id에서 순번 추출 (Excel 스타일 13자리 등) */
export function parseVoucherSequence(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const head = text.split("-")[0].replace(/[^\d]/g, "") || text.replace(/[^\d]/g, "");
  const num = Number(head);
  if (!Number.isFinite(num) || num <= 0 || num > MAX_EXCEL_STYLE_VOUCHER) return null;
  return num;
}

/** 새 전표 NO 부여: 기존 최대 순번 + 1 */
export function allocateNextSaleRecordIds(sales: SaleVoucherLike[] = []) {
  let maxSeq = 0;

  sales.forEach((sale) => {
    const fromVoucher = parseVoucherSequence(sale.voucherNo);
    const fromId = parseVoucherSequence(sale.id);
    if (fromVoucher != null) maxSeq = Math.max(maxSeq, fromVoucher);
    if (fromId != null) maxSeq = Math.max(maxSeq, fromId);
  });

  const next = maxSeq + 1;
  return { id: next, voucherNo: String(next) };
}

export function getSaleVoucherLabel(sale: SaleVoucherLike) {
  const voucherNo = String(sale.voucherNo ?? "").trim();
  if (voucherNo) return voucherNo;

  const fromId = parseVoucherSequence(sale.id);
  if (fromId != null) return String(fromId);

  return String(sale.id ?? "");
}
