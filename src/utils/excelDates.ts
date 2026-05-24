/** Excel serial (days since 1899-12-30 UTC) → YYYY-MM-DD calendar date */
export function excelSerialToISO(serial: number) {
  const utc = new Date(Math.round((serial - 25569) * 86400000));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function excelDateToISO(value: unknown) {
  if (value == null || value === "") return "";

  if (typeof value === "number" && Number.isFinite(value)) {
    return excelSerialToISO(value);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return excelSerialToISO(Math.floor(value.getTime() / 86400000) + 25569);
  }

  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  return text;
}
