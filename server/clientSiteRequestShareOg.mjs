export function buildClientSiteRequestOgMeta({ clientName, sharePageUrl, origin }) {
  const name = String(clientName || "").trim();
  const defaultTitle = `\uD604\uC7A5\uC811\uC218 \uCE98\uB9B0\uB354 | TEAM mm`;
  const ogTitle = name ? `\uD604\uC7A5\uC811\uC218 \uCE98\uB9B0\uB354 \u00B7 ${name}` : defaultTitle;

  const descriptionParts = ["TEAM mm \uD604\uC7A5\uC811\uC218 \uCE98\uB9B0\uB354"];
  if (name) descriptionParts.push(name);
  descriptionParts.push("\uCE98\uB9B0\uB354\uC5D0\uC11C \uB0A0\uC9DC \uC120\uD0DD \uD6C4 \uC811\uC218");

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
