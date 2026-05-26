function decodePeriodPart(value) {
  return value && value !== "\uC804\uCCB4" ? value : "";
}

function decodePdfShareFileName(fileName) {
  const raw = String(fileName || "").replace(/\.pdf$/i, "");

  const clientMatch = raw.match(
    /_\uAC70\uB798\uCC98_(.+?)_(\d{4}-\d{2}-\d{2}|\uC804\uCCB4)_(\d{4}-\d{2}-\d{2}|\uC804\uCCB4)$/
  );
  if (clientMatch) {
    return {
      kind: "client",
      subjectName: clientMatch[1].replace(/_/g, " "),
      periodStart: decodePeriodPart(clientMatch[2]),
      periodEnd: decodePeriodPart(clientMatch[3]),
    };
  }

  const workerMatch = raw.match(
    /_\uC2DC\uACF5\uC790_(.+?)_(\d{4}-\d{2}-\d{2}|\uC804\uCCB4)_(\d{4}-\d{2}-\d{2}|\uC804\uCCB4)$/
  );
  if (workerMatch) {
    return {
      kind: "worker",
      subjectName: workerMatch[1].replace(/_/g, " "),
      periodStart: decodePeriodPart(workerMatch[2]),
      periodEnd: decodePeriodPart(workerMatch[3]),
    };
  }

  return {
    kind: "unknown",
    subjectName: "",
    periodStart: "",
    periodEnd: "",
  };
}

export function buildPdfShareOgMeta({ fileName, sharePageUrl, origin }) {
  const decoded = decodePdfShareFileName(fileName);
  const { kind, subjectName, periodStart, periodEnd } = decoded;
  const periodLabel =
    periodStart && periodEnd
      ? periodStart === periodEnd
        ? periodStart
        : `${periodStart} ~ ${periodEnd}`
      : "";

  const isWorker = kind === "worker";
  const defaultTitle = isWorker
    ? `\uC2DC\uACF5\uB0B4\uC5ED\uC11C | TEAM mm`
    : `\uC2DC\uACF5\uBE44 \uB0B4\uC5ED\uC11C | TEAM mm`;
  const titlePrefix = isWorker ? `\uC2DC\uACF5\uB0B4\uC5ED\uC11C` : `\uC2DC\uACF5\uBE44 \uB0B4\uC5ED\uC11C`;
  const descriptionLabel = isWorker ? "TEAM mm \uC2DC\uACF5\uB0B4\uC5ED\uC11C" : "TEAM mm \uC2DC\uACF5\uBE44 \uB0B4\uC5ED\uC11C";

  const ogTitle = subjectName ? `${titlePrefix} \u00B7 ${subjectName}` : defaultTitle;

  const descriptionParts = [descriptionLabel];
  if (subjectName) descriptionParts.push(subjectName);
  if (periodLabel) descriptionParts.push(periodLabel);
  descriptionParts.push("\uB2E4\uC6B4\uB85C\uB4DC \uBC0F \uBBF8\uB9AC\uBCF4\uAE30");

  return {
    sharePageUrl,
    ogImageUrl: `${origin}/share/team-mm-og.png`,
    ogTitle,
    ogDescription: descriptionParts.join(" | "),
    ogSiteName: "TEAM mm",
    ogImageWidth: 625,
    ogImageHeight: 625,
  };
}
