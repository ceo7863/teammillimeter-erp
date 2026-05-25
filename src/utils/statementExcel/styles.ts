import type * as XLSX from "xlsx-js-style";

export type CellStyle = XLSX.CellObject["s"];

export const EXCEL_FONT = "Malgun Gothic";

export const EXCEL_COLORS = {
  border: "E2E8F0",
  borderStrong: "CBD5E1",
  borderHead: "334155",
  headBg: "1E293B",
  headText: "F8FAFC",
  labelBg: "F8FAFC",
  labelText: "64748B",
  footBg: "F8FAFC",
  subRowBg: "FAFBFC",
  text: "334155",
  textStrong: "0F172A",
  muted: "94A3B8",
  white: "FFFFFF",
} as const;

function side(color: string, weight: "thin" | "medium" = "thin") {
  return { style: weight, color: { rgb: color } };
}

function allBorders(color: string, weight: "thin" | "medium" = "thin") {
  const border = side(color, weight);
  return { top: border, bottom: border, left: border, right: border };
}

function mergeStyles(base: CellStyle, extra?: CellStyle): CellStyle {
  if (!extra) return base;
  return {
    ...base,
    ...extra,
    font: { ...base?.font, ...extra.font },
    alignment: { ...base?.alignment, ...extra.alignment },
    fill: extra.fill || base?.fill,
    border: extra.border || base?.border,
  };
}

export function plainStyle(): CellStyle {
  return {
    font: { name: EXCEL_FONT, sz: 10, color: { rgb: EXCEL_COLORS.text } },
    alignment: { vertical: "center", wrapText: true },
    fill: { patternType: "solid", fgColor: { rgb: EXCEL_COLORS.white } },
  };
}

export function companyNameStyle(): CellStyle {
  return mergeStyles(plainStyle(), {
    font: { name: EXCEL_FONT, sz: 11, bold: true, color: { rgb: EXCEL_COLORS.textStrong } },
    alignment: { vertical: "top", wrapText: true },
  });
}

export function companyLineStyle(): CellStyle {
  return mergeStyles(plainStyle(), {
    font: { name: EXCEL_FONT, sz: 9, color: { rgb: EXCEL_COLORS.text } },
    alignment: { vertical: "top", wrapText: true },
  });
}

export function companyLinkStyle(): CellStyle {
  return mergeStyles(companyLineStyle(), {
    font: { name: EXCEL_FONT, sz: 9, color: { rgb: EXCEL_COLORS.labelText } },
  });
}

export function dataFillerStyle(): CellStyle {
  return mergeStyles(plainStyle(), {
    border: allBorders(EXCEL_COLORS.border),
    fill: { patternType: "solid", fgColor: { rgb: EXCEL_COLORS.white } },
  });
}

export function titleCellStyle(): CellStyle {
  return mergeStyles(plainStyle(), {
    font: { name: EXCEL_FONT, sz: 16, bold: true, color: { rgb: EXCEL_COLORS.textStrong } },
    alignment: { horizontal: "center", vertical: "center", wrapText: false },
    border: { bottom: side(EXCEL_COLORS.textStrong, "medium") },
  });
}

export function recipientCellStyle(): CellStyle {
  return mergeStyles(plainStyle(), {
    font: { name: EXCEL_FONT, sz: 12, bold: true, color: { rgb: EXCEL_COLORS.textStrong } },
  });
}

export function metaLabelStyle(): CellStyle {
  return mergeStyles(plainStyle(), {
    font: { name: EXCEL_FONT, sz: 9, bold: true, color: { rgb: EXCEL_COLORS.labelText } },
    fill: { patternType: "solid", fgColor: { rgb: EXCEL_COLORS.labelBg } },
    alignment: { horizontal: "center", vertical: "center" },
    border: allBorders(EXCEL_COLORS.borderStrong),
  });
}

export function metaValueStyle(): CellStyle {
  return mergeStyles(plainStyle(), {
    border: allBorders(EXCEL_COLORS.borderStrong),
  });
}

export function metaAmountStyle(): CellStyle {
  return mergeStyles(metaValueStyle(), {
    font: { name: EXCEL_FONT, sz: 10, bold: true, color: { rgb: EXCEL_COLORS.textStrong } },
    alignment: { horizontal: "right", vertical: "center" },
  });
}

export function metaCenterStyle(): CellStyle {
  return mergeStyles(metaValueStyle(), {
    alignment: { horizontal: "center", vertical: "center" },
  });
}

export function dataHeaderStyle(): CellStyle {
  return {
    font: { name: EXCEL_FONT, sz: 9, bold: true, color: { rgb: EXCEL_COLORS.headText } },
    fill: { patternType: "solid", fgColor: { rgb: EXCEL_COLORS.headBg } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: allBorders(EXCEL_COLORS.borderHead),
  };
}

export function dataTextStyle(subRow = false): CellStyle {
  return mergeStyles(plainStyle(), {
    alignment: { horizontal: "left", vertical: "center", wrapText: true },
    border: allBorders(EXCEL_COLORS.border),
    fill: subRow ? { patternType: "solid", fgColor: { rgb: EXCEL_COLORS.subRowBg } } : undefined,
  });
}

export function dataNumberStyle(subRow = false): CellStyle {
  return mergeStyles(dataTextStyle(subRow), {
    alignment: { horizontal: "right", vertical: "center" },
  });
}

export function dataCenterStyle(subRow = false): CellStyle {
  return mergeStyles(dataTextStyle(subRow), {
    alignment: { horizontal: "center", vertical: "center" },
  });
}

export function dataFooterStyle(): CellStyle {
  return mergeStyles(plainStyle(), {
    font: { name: EXCEL_FONT, sz: 10, bold: true, color: { rgb: EXCEL_COLORS.textStrong } },
    fill: { patternType: "solid", fgColor: { rgb: EXCEL_COLORS.footBg } },
    alignment: { horizontal: "right", vertical: "center" },
    border: allBorders(EXCEL_COLORS.borderStrong, "medium"),
  });
}

export function dataEmptyStyle(): CellStyle {
  return mergeStyles(plainStyle(), {
    font: { name: EXCEL_FONT, sz: 10, color: { rgb: EXCEL_COLORS.muted } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: allBorders(EXCEL_COLORS.border),
  });
}

export function footerBrandStyle(bold = false): CellStyle {
  return mergeStyles(plainStyle(), {
    font: {
      name: EXCEL_FONT,
      sz: bold ? 10 : 9,
      bold,
      color: { rgb: bold ? EXCEL_COLORS.textStrong : EXCEL_COLORS.text },
    },
  });
}

export function footerLinkStyle(): CellStyle {
  return mergeStyles(plainStyle(), {
    font: { name: EXCEL_FONT, sz: 9, color: { rgb: EXCEL_COLORS.labelText } },
  });
}
