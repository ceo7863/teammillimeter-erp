const BASE_URL =
  typeof import.meta !== "undefined" && import.meta.env && "BASE_URL" in import.meta.env
    ? String(import.meta.env.BASE_URL)
    : "/";

export const STATEMENT_LOGO_PATH = `${BASE_URL}team-mm-logo.png`;

export type StatementLogoAsset = {
  bytes: ArrayBuffer;
  width: number;
  height: number;
  extension: "png" | "jpeg";
  mediaPath: string;
};

function detectImageExtension(bytes: ArrayBuffer): "png" | "jpeg" {
  const view = new Uint8Array(bytes);
  if (view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4e && view[3] === 0x47) {
    return "png";
  }
  return "jpeg";
}

export async function fetchStatementLogoBytes() {
  try {
    const response = await fetch(STATEMENT_LOGO_PATH);
    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

export async function loadStatementLogo(): Promise<StatementLogoAsset | null> {
  const bytes = await fetchStatementLogoBytes();
  if (!bytes) return null;

  const extension = detectImageExtension(bytes);
  const mediaPath = extension === "png" ? "xl/media/image1.png" : "xl/media/image1.jpeg";

  return new Promise((resolve) => {
    const blob = new Blob([bytes], { type: extension === "png" ? "image/png" : "image/jpeg" });
    const url = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        bytes,
        width: image.naturalWidth,
        height: image.naturalHeight,
        extension,
        mediaPath,
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    image.src = url;
  });
}
