function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildPdfShareViewerHtml({ title, pdfUrl, downloadUrl, pageImages = [], og = null }) {
  const safeTitle = escapeHtml(title);
  const safePdfUrl = escapeHtml(pdfUrl);
  const safeDownloadUrl = escapeHtml(downloadUrl);
  const hasPreview = pageImages.length > 0;
  const pagesHtml = pageImages
    .map((src, index) => `<img src="${src}" alt="\uD398\uC774\uC9C0 ${index + 1}" loading="lazy" />`)
    .join("");

  const ogTags = og
    ? `
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
  <meta name="twitter:image" content="${escapeHtml(og.ogImageUrl)}"/>
  <meta name="description" content="${escapeHtml(og.ogDescription)}"/>`
    : "";

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <meta name="format-detection" content="telephone=no"/>
  <title>${safeTitle}</title>${ogTags}
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: #525659; color: #f8fafc; }
    body { font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      padding: 0.65rem 0.85rem;
      background: #0f172a;
      border-bottom: 1px solid #1e293b;
    }
    .toolbar-title {
      flex: 1;
      min-width: 0;
      font-size: 0.8125rem;
      font-weight: 700;
      line-height: 1.35;
      word-break: break-all;
    }
    .toolbar-actions {
      display: flex;
      flex-shrink: 0;
      gap: 0.4rem;
    }
    .toolbar a {
      color: #fff;
      text-decoration: none;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.45rem 0.7rem;
      border-radius: 0.65rem;
      background: #2563eb;
      white-space: nowrap;
    }
    .toolbar .is-secondary { background: #334155; }
    #status {
      padding: 1rem 0.85rem;
      font-size: 0.875rem;
      line-height: 1.5;
      text-align: center;
      color: #e2e8f0;
    }
    #pages {
      padding: 0.75rem 0.5rem 1.5rem;
    }
    #pages img {
      display: block;
      width: 100%;
      height: auto;
      margin: 0 auto 0.75rem;
      background: #fff;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.28);
    }
    .is-hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-title">${safeTitle}</div>
    <div class="toolbar-actions">
      <a class="is-secondary" href="${safePdfUrl}">PDF \uC5F4\uAE30</a>
      <a href="${safeDownloadUrl}">\uB2E4\uC6B4\uB85C\uB4DC</a>
    </div>
  </div>
  ${
    hasPreview
      ? `<div id="pages">${pagesHtml}</div>`
      : `<div id="status">\uBBF8\uB9AC\uBCF4\uAE30\uB97C \uD45C\uC2DC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC0C1\uB2E8 \uB2E4\uC6B4\uB85C\uB4DC \uBC84\uD2BC\uC744 \uB20C\uB7EC PDF\uB97C \uC800\uC7A5\uD574 \uC8FC\uC138\uC694.</div>`
  }
</body>
</html>`;
}
