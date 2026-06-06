import { callBarobillSoap, getErrString, assertBarobillCredentials } from "./client.mjs";
import { config } from "../config.mjs";

function decodeXml(text) {
  return String(text ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function describeCode(code) {
  if (code >= 0) return null;
  try {
    return await getErrString(code);
  } catch {
    return `\uBC14\uB85C\uBE4C \uC624\uB958 (${code})`;
  }
}

/** \uD648\uD0DD\uC2A4 \uC2A4\uD06C\uB798\uD551 \uC11C\uBE44\uC2A4 \uC2E0\uCCAD \uC5EC\uBD80 \uD655\uC778 (RefreshTaxInvoiceScrap) */
export async function checkTaxInvoiceScrapService() {
  const { certKey, corpNum } = assertBarobillCredentials();
  const { rawResult } = await callBarobillSoap(
    "RefreshTaxInvoiceScrap",
    { CERTKEY: certKey, CorpNum: corpNum },
    "RefreshTaxInvoiceScrapResult",
  );
  const code = Number(String(rawResult || "").trim());
  if (code === -51001) {
    return {
      active: false,
      code,
      message:
        "\uD648\uD0DD\uC2A4 \uB9E4\uC785/\uB9E4\uCD9C \uC870\uD68C \uC11C\uBE44\uC2A4\uAC00 \uBC14\uB85C\uBE4C\uC5D0 \uC2E0\uCCAD\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uBC14\uB85C\uBE4C(\uC6B4\uC601 \uC0AC\uC774\uD2B8) \uC5D0\uC11C \uD648\uD0DD\uC2A4 \uC5F0\uB3D9\uC744 \uC2E0\uCCAD\uD55C \uB2E4\uC74C \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694. (\uC694\uAE08 \uCDA9\uC804\uB3C4 \uD544\uC694\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4)",
    };
  }
  if (code === -51008) {
    return {
      active: true,
      collecting: true,
      code,
      message:
        "\uBC14\uB85C\uBE4C\uC5D0\uC11C \uD648\uD0DD\uC2A4 \uB370\uC774\uD130\uB97C \uC218\uC9D1 \uC911\uC785\uB2C8\uB2E4. \uC644\uB8CC \uD6C4(\uC57D 10~30\uBD84) \uB2E4\uC2DC \uB3D9\uAE30\uD654\uD558\uC2DC\uACE0, \uC774\uBBF8 \uC218\uC9D1\uB41C \uB0B4\uC5ED\uC740 \uC544\uB798\uC5D0 \uD45C\uC2DC\uB420 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
    };
  }
  if (code < 0) {
    const detail = await describeCode(code);
    return {
      active: false,
      code,
      message: detail || `\uD648\uD0DD\uC2A4 \uC5F0\uB3D9 \uD655\uC778 \uC2E4\uD328 (${code})`,
    };
  }
  return {
    active: true,
    code,
    message: "\uD648\uD0DD\uC2A4 \uC989\uC2DC \uC218\uC9D1\uC744 \uC694\uCCAD\uD588\uC2B5\uB2C8\uB2E4. \uBA87 \uBD84 \uD6C4 \uB2E4\uC2DC \uB3D9\uAE30\uD654\uD574 \uBCF4\uC138\uC694.",
  };
}

export async function getTaxInvoiceScrapRequestUrl() {
  const { certKey, corpNum, userId } = assertBarobillCredentials({ requireUserId: true });
  const userPwd = String(config.barobill.userPwd || "").trim();
  if (!userPwd) {
    throw new Error("BAROBILL_USER_PWD\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
  }

  const { rawResult } = await callBarobillSoap(
    "GetTaxInvoiceScrapRequestURL",
    { CERTKEY: certKey, CorpNum: corpNum, UserID: userId, PWD: userPwd },
    "GetTaxInvoiceScrapRequestURLResult",
  );

  const result = decodeXml(String(rawResult || "").trim());
  const asNumber = Number(result);
  if (Number.isFinite(asNumber) && asNumber < 0) {
    const detail = await describeCode(asNumber);
    const error = new Error(detail || `\uD648\uD0DD\uC2A4 \uC5F0\uB3D9 \uC2E0\uCCAD URL \uC870\uD68C \uC2E4\uD328 (${asNumber})`);
    error.errCode = asNumber;
    throw error;
  }
  if (!/^https?:\/\//i.test(result)) {
    throw new Error(result || "\uD648\uD0DD\uC2A4 \uC5F0\uB3D9 \uC2E0\uCCAD URL\uC744 \uBC1B\uC9C0 \uBAB8\uC2B5\uB2C8\uB2E4.");
  }
  return result;
}

export async function refreshTaxInvoiceScrap() {
  return checkTaxInvoiceScrapService();
}
