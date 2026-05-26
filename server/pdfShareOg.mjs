function decodePdfShareFileName(fileName) {
  const raw = String(fileName || "").replace(/\.pdf$/i, "");
  const match = raw.match(
    /_\uAC70\uB798\uCC98_(.+?)_(\d{4}-\d{2}-\d{2}|\uC804\uCCB4)_(\d{4}-\d{2}-\d{2}|\uC804\uCCB4)$/
  );

  return {
    clientName: match?.[1]?.replace(/_/g, " ") || "",
    periodStart: match?.[2] && match[2] !== "\uC804\uCCB4" ? match[2] : "",
    periodEnd: match?.[3] && match[3] !== "\uC804\uCCB4" ? match[3] : "",
  };
}

export function buildPdfShareOgMeta({ fileName, sharePageUrl, origin }) {
  const { clientName, periodStart, periodEnd } = decodePdfShareFileName(fileName);
  const periodLabel =
    periodStart && periodEnd
      ? periodStart === periodEnd
        ? periodStart
        : `${periodStart} ~ ${periodEnd}`
      : "";

  const ogTitle = clientName
    ? `\uC2DC\uACF5\uBE44 \uB0B4\uC5ED\uC11C \u00B7 ${clientName}`
    : `\uC2DC\uACF5\uBE44 \uB0B4\uC5ED\uC11C | TEAM mm`;

  const descriptionParts = ["TEAM mm \uC2DC\uACF5\uBE44 \uB0B4\uC5ED\uC11C"];
  if (clientName) descriptionParts.push(clientName);
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
