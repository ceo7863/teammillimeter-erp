function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildOgMetaTags(og) {
  return `
  <meta property="og:type" content="website"/>
  <meta property="og:locale" content="ko_KR"/>
  <meta property="og:site_name" content="${escapeHtml(og.ogSiteName)}"/>
  <meta property="og:title" content="${escapeHtml(og.ogTitle)}"/>
  <meta property="og:description" content="${escapeHtml(og.ogDescription)}"/>
  <meta property="og:url" content="${escapeHtml(og.sharePageUrl)}"/>
  <meta property="og:image" content="${escapeHtml(og.ogImageUrl)}"/>
  <meta property="og:image:secure_url" content="${escapeHtml(og.ogImageUrl)}"/>
  <meta property="og:image:type" content="image/png"/>
  <meta property="og:image:width" content="${escapeHtml(og.ogImageWidth)}"/>
  <meta property="og:image:height" content="${escapeHtml(og.ogImageHeight)}"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${escapeHtml(og.ogTitle)}"/>
  <meta name="twitter:description" content="${escapeHtml(og.ogDescription)}"/>
  <meta name="twitter:image" content="${escapeHtml(og.ogImageUrl)}"/>`;
}

export function buildClientSiteRequestSharePreviewHtml(indexHtml, { title, og }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(og.ogDescription);
  const ogTags = buildOgMetaTags(og);

  let html = String(indexHtml || "");
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${safeTitle}</title>`);
  html = html.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${safeDescription}" />`
  );
  html = html.replace(/<\/head>/i, `${ogTags}\n  </head>`);
  return html;
}
