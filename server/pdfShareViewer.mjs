function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildPdfShareViewerHtml({ title, pdfUrl, downloadUrl }) {
  const safeTitle = escapeHtml(title);
  const safePdfUrl = escapeHtml(pdfUrl);
  const safeDownloadUrl = escapeHtml(downloadUrl);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <meta name="format-detection" content="telephone=no"/>
  <title>${safeTitle}</title>
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
    .toolbar a, .toolbar button {
      appearance: none;
      border: 0;
      color: #fff;
      text-decoration: none;
      font: inherit;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.45rem 0.7rem;
      border-radius: 0.65rem;
      background: #2563eb;
      white-space: nowrap;
      cursor: pointer;
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
    #pages canvas {
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
      <a class="is-secondary" href="${safePdfUrl}" target="_blank" rel="noopener noreferrer">PDF \uC5F4\uAE30</a>
      <a href="${safeDownloadUrl}">\uB2E4\uC6B4\uB85C\uB4DC</a>
    </div>
  </div>
  <div id="status">PDF \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4...</div>
  <div id="pages" class="is-hidden"></div>
  <script src="/vendor/pdfjs/pdf.min.js"></script>
  <script>
    (function () {
      var pdfUrl = ${JSON.stringify(pdfUrl)};
      var statusEl = document.getElementById("status");
      var pagesEl = document.getElementById("pages");
      var msgViewerLoadFail = "PDF \uBDF0\uC5B4\uB97C \uBD88\uB7EC\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC0C1\uB2E8 \uBC84\uD2BC\uC744 \uC774\uC6A9\uD574 \uC8FC\uC138\uC694.";
      var msgPreviewFail = "\uBBF8\uB9AC\uBCF4\uAE30\uB97C \uD45C\uC2DC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC0C1\uB2E8 \uBC84\uD2BC\uC744 \uC774\uC6A9\uD574 \uC8FC\uC138\uC694.";

      if (!window.pdfjsLib) {
        statusEl.textContent = msgViewerLoadFail;
        return;
      }

      pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.js";

      function showError(message) {
        statusEl.textContent = message;
        pagesEl.classList.add("is-hidden");
      }

      function loadPdf(useWorker) {
        return fetch(pdfUrl, { credentials: "omit", cache: "no-store" })
          .then(function (response) {
            if (!response.ok) throw new Error("fetch failed");
            return response.arrayBuffer();
          })
          .then(function (data) {
            var options = { data: data };
            if (!useWorker) options.disableWorker = true;
            return pdfjsLib.getDocument(options).promise;
          })
          .then(function (pdf) {
          statusEl.classList.add("is-hidden");
          pagesEl.classList.remove("is-hidden");

          var renderPage = function (pageNumber) {
            return pdf.getPage(pageNumber).then(function (page) {
              var containerWidth = pagesEl.clientWidth || window.innerWidth || 360;
              var baseViewport = page.getViewport({ scale: 1 });
              var scale = Math.min(2, Math.max(0.8, containerWidth / baseViewport.width));
              var viewport = page.getViewport({ scale: scale });
              var canvas = document.createElement("canvas");
              var context = canvas.getContext("2d");

              canvas.width = viewport.width;
              canvas.height = viewport.height;
              pagesEl.appendChild(canvas);

              return page.render({ canvasContext: context, viewport: viewport }).promise;
            });
          };

          var chain = Promise.resolve();
          for (var i = 1; i <= pdf.numPages; i += 1) {
            (function (pageNumber) {
              chain = chain.then(function () {
                return renderPage(pageNumber);
              });
            })(i);
          }

          return chain;
        });
      }

      loadPdf(true).catch(function () {
        pagesEl.innerHTML = "";
        return loadPdf(false);
      }).catch(function () {
        showError(msgPreviewFail);
      });
    })();
  </script>
</body>
</html>`;
}
