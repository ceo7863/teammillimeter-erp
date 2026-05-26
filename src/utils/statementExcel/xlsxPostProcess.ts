import JSZip from "jszip";

const A4_SHEET_PR = `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>`;

function buildA4PrintBlock(printPageCount: number) {
  const fitToHeight = Math.max(1, printPageCount);
  return (
    `<printOptions horizontalCentered="1"/>` +
    `<pageMargins left="0.25" right="0.25" top="0.35" bottom="0.35" header="0.2" footer="0.2"/>` +
    `<pageSetup paperSize="9" orientation="portrait" fitToHeight="${fitToHeight}" fitToWidth="1"/>`
  );
}

export type StatementLogoAnchor = {
  fromCol: number;
  fromRow: number;
  toCol: number;
  toRow: number;
};

const DRAWING_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing";
const IMAGE_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const DRAWING_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.drawing+xml";

function patchWorksheetXml(xml: string, printPageCount = 1) {
  const A4_PRINT_BLOCK = buildA4PrintBlock(printPageCount);
  let next = xml;
  if (!next.includes("pageSetUpPr")) {
    next = next.replace(/<worksheet([^>]*)>/, `<worksheet$1>${A4_SHEET_PR}`);
  }
  if (!next.includes("<pageSetup")) {
    if (next.includes("</mergeCells>")) {
      next = next.replace("</mergeCells>", `</mergeCells>${A4_PRINT_BLOCK}`);
    } else if (next.includes("</sheetData>")) {
      next = next.replace("</sheetData>", `</sheetData>${A4_PRINT_BLOCK}`);
    } else {
      next = next.replace("</worksheet>", `${A4_PRINT_BLOCK}</worksheet>`);
    }
  } else {
    next = next.replace(/fitToHeight="\d+"/, `fitToHeight="${Math.max(1, printPageCount)}"`);
  }
  return next;
}

function insertDrawingTag(sheetXml: string, drawingRelId: string) {
  if (sheetXml.includes("<drawing ")) return sheetXml;
  const tag = `<drawing r:id="${drawingRelId}"/>`;
  if (sheetXml.includes("</ignoredErrors>")) {
    return sheetXml.replace("</ignoredErrors>", `</ignoredErrors>${tag}`);
  }
  if (sheetXml.includes("</pageSetup>")) {
    return sheetXml.replace("</pageSetup>", `</pageSetup>${tag}`);
  }
  if (sheetXml.includes("/>") && sheetXml.includes("<pageSetup")) {
    return sheetXml.replace(/<pageSetup[^>]*\/>/, (match) => `${match}${tag}`);
  }
  return sheetXml.replace("</worksheet>", `${tag}</worksheet>`);
}

function nextRelationshipId(relsXml: string) {
  const ids = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]));
  return `rId${Math.max(0, ...ids) + 1}`;
}

function ensureContentTypeOverride(contentTypesXml: string, partName: string, contentType: string) {
  if (contentTypesXml.includes(`PartName="${partName}"`)) return contentTypesXml;
  return contentTypesXml.replace(
    "</Types>",
    `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`
  );
}

function buildDrawingXml(imageRelId: string, anchor: StatementLogoAnchor, extCx: number, extCy: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:oneCellAnchor>
    <xdr:from>
      <xdr:col>${anchor.fromCol}</xdr:col>
      <xdr:colOff>9525</xdr:colOff>
      <xdr:row>${anchor.fromRow}</xdr:row>
      <xdr:rowOff>9525</xdr:rowOff>
    </xdr:from>
    <xdr:ext cx="${extCx}" cy="${extCy}"/>
    <xdr:pic>
      <xdr:nvPicPr>
        <xdr:cNvPr id="1025" name="TEAM mm logo"/>
        <xdr:cNvPicPr>
          <a:picLocks noChangeAspect="1"/>
        </xdr:cNvPicPr>
      </xdr:nvPicPr>
      <xdr:blipFill>
        <a:blip r:embed="${imageRelId}"/>
        <a:stretch>
          <a:fillRect/>
        </a:stretch>
      </xdr:blipFill>
      <xdr:spPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="${extCx}" cy="${extCy}"/>
        </a:xfrm>
        <a:prstGeom prst="rect">
          <a:avLst/>
        </a:prstGeom>
      </xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:oneCellAnchor>
</xdr:wsDr>`;
}

function emuPerPoint() {
  return 12700;
}

function estimateLogoExtEmu(anchor: StatementLogoAnchor, imageWidth: number, imageHeight: number) {
  const rowCount = anchor.toRow - anchor.fromRow + 1;
  const colCount = anchor.toCol - anchor.fromCol + 1;
  const boxHeightEmu = rowCount * 18 * emuPerPoint();
  const boxWidthEmu = colCount * 9 * 7 * emuPerPoint();
  const imageRatio = imageWidth / Math.max(imageHeight, 1);
  let extCy = boxHeightEmu;
  let extCx = Math.round(extCy * imageRatio);
  if (extCx > boxWidthEmu) {
    extCx = boxWidthEmu;
    extCy = Math.round(extCx / imageRatio);
  }
  return { extCx: Math.max(extCx, 1), extCy: Math.max(extCy, 1) };
}

async function embedLogoInWorksheet(
  zip: JSZip,
  sheetPath: string,
  logo: {
    bytes: ArrayBuffer;
    anchor: StatementLogoAnchor;
    width: number;
    height: number;
    mediaPath: string;
  }
) {
  const sheetFileName = sheetPath.split("/").pop() || "sheet1.xml";
  const sheetRelsPath = `xl/worksheets/_rels/${sheetFileName}.rels`;
  const drawingPath = "xl/drawings/drawing1.xml";
  const drawingRelsPath = "xl/drawings/_rels/drawing1.xml.rels";
  const mediaFileName = logo.mediaPath.split("/").pop() || "image1.jpeg";
  const mediaTarget = `../media/${mediaFileName}`;

  const existingSheetRels = zip.file(sheetRelsPath) ? await zip.file(sheetRelsPath)!.async("string") : "";
  const drawingRelId = existingSheetRels ? nextRelationshipId(existingSheetRels) : "rId1";
  const sheetRelsXml = existingSheetRels
    ? existingSheetRels.replace(
        "</Relationships>",
        `<Relationship Id="${drawingRelId}" Type="${DRAWING_REL_TYPE}" Target="../drawings/drawing1.xml"/></Relationships>`
      )
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="${drawingRelId}" Type="${DRAWING_REL_TYPE}" Target="../drawings/drawing1.xml"/>
</Relationships>`;

  const { extCx, extCy } = estimateLogoExtEmu(logo.anchor, logo.width, logo.height);
  const drawingXml = buildDrawingXml("rId1", logo.anchor, extCx, extCy);
  const drawingRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="${IMAGE_REL_TYPE}" Target="${mediaTarget}"/>
</Relationships>`;

  zip.file(sheetRelsPath, sheetRelsXml);
  zip.file(drawingPath, drawingXml);
  zip.file(drawingRelsPath, drawingRelsXml);
  zip.file(logo.mediaPath, logo.bytes);

  const sheetXml = await zip.file(sheetPath)!.async("string");
  zip.file(sheetPath, insertDrawingTag(sheetXml, drawingRelId));

  const contentTypesPath = "[Content_Types].xml";
  const contentTypesXml = await zip.file(contentTypesPath)!.async("string");
  let nextContentTypes = ensureContentTypeOverride(contentTypesXml, "/xl/drawings/drawing1.xml", DRAWING_CONTENT_TYPE);
  nextContentTypes = ensureContentTypeOverride(
    nextContentTypes,
    `/xl/media/${mediaFileName}`,
    mediaFileName.endsWith(".png") ? "image/png" : "image/jpeg"
  );
  zip.file(contentTypesPath, nextContentTypes);
}

export async function finalizeStatementXlsx(
  buffer: ArrayBuffer,
  options?: {
    printPageCount?: number;
    logo?: {
      bytes: ArrayBuffer;
      anchor: StatementLogoAnchor;
      width: number;
      height: number;
      mediaPath: string;
    };
  }
) {
  const zip = await JSZip.loadAsync(buffer);
  const sheetPaths = Object.keys(zip.files).filter(
    (path) => path.startsWith("xl/worksheets/sheet") && path.endsWith(".xml") && !path.includes("_rels")
  );

  const printPageCount = Math.max(1, options?.printPageCount ?? 1);

  await Promise.all(
    sheetPaths.map(async (path) => {
      const file = zip.file(path);
      if (!file) return;
      const xml = await file.async("string");
      zip.file(path, patchWorksheetXml(xml, printPageCount));
    })
  );

  if (options?.logo && sheetPaths[0]) {
    await embedLogoInWorksheet(zip, sheetPaths[0], options.logo);
  }

  const output = await zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return new Blob([output], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
