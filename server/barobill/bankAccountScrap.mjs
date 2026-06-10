import { config } from "../config.mjs";
import { describeBarobillCode } from "./client.mjs";
import {
  assertBarobillBankCredentials,
  callBankAccountSoap,
  callBankAccountSoapRequest,
  decodeXml,
  extractAccountBlocks,
  extractResultBlock,
  readXmlTag,
} from "./bankAccountClient.mjs";

export async function getBankAccountScrapRegistrationStatus(bankAccountNum) {
  const { bankAccountNum: defaultAccount } = assertBarobillBankCredentials();
  const target = String(bankAccountNum || defaultAccount || "").replace(/\D/g, "");
  const accounts = await listRegisteredBankAccounts();
  const active = accounts.some((row) => String(row.bankAccountNum || "").replace(/\D/g, "") === target);
  if (!active) {
    return {
      active: false,
      code: -26001,
      message:
        "\uACC4\uC88C\uAC70\uB798\uB0B4\uC5ED \uC870\uD68C \uC11C\uBE44\uC2A4\uAC00 \uBC14\uB85C\uBE4C\uC5D0 \uC2E0\uCCAD\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uBC14\uB85C\uBE4C \uC6B4\uC601 \uC0AC\uC774\uD2B8\uC5D0\uC11C \uACC4\uC88C\uAC70\uB798\uB0B4\uC5ED \uC870\uD68C \uC11C\uBE44\uC2A4\uB97C \uC2E0\uCCAD\uD55C \uB2E4\uC74C \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",
    };
  }
  return {
    active: true,
    code: 1,
    message: "\uACC4\uC88C\uAC70\uB798\uB0B4\uC5ED \uC870\uD68C \uC11C\uBE44\uC2A4\uAC00 \uC2E0\uCCAD\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.",
  };
}

/** \uACC4\uC88C\uAC70\uB798\uB0B4\uC5ED \uC218\uC9D1 \uC694\uCCAD (RefreshBankAccount) */
export async function checkBankAccountScrapService(bankAccountNum) {
  const { certKey, corpNum, userId, bankAccountNum: defaultAccount } = assertBarobillBankCredentials();
  const account = String(bankAccountNum || defaultAccount || "").replace(/\D/g, "");

  const { rawResult } = await callBankAccountSoap(
    "RefreshBankAccount",
    { CERTKEY: certKey, CorpNum: corpNum, ID: userId, BankAccountNum: account },
    "RefreshBankAccountResult",
  );

  const code = Number(String(rawResult || "").trim());
  if (code === -26001) {
    return {
      active: false,
      code,
      message:
        "\uACC4\uC88C\uAC70\uB798\uB0B4\uC5ED \uC870\uD68C \uC11C\uBE44\uC2A4\uAC00 \uBC14\uB85C\uBE4C\uC5D0 \uC2E0\uCCAD\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uBC14\uB85C\uBE4C \uC6B4\uC601 \uC0AC\uC774\uD2B8\uC5D0\uC11C \uACC4\uC88C\uAC70\uB798\uB0B4\uC5ED \uC870\uD68C \uC11C\uBE44\uC2A4\uB97C \uC2E0\uCCAD\uD55C \uB2E4\uC74C \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",
    };
  }
  if (code === -26008) {
    return {
      active: true,
      collecting: true,
      code,
      message:
        "\uBC14\uB85C\uBE4C\uC5D0\uC11C \uACC4\uC88C \uAC70\uB798\uB0B4\uC5ED\uC744 \uC218\uC9D1 \uC911\uC785\uB2C8\uB2E4. \uC644\uB8CC \uD6C4 \uB2E4\uC2DC \uB3D9\uAE30\uD654\uD574 \uBCF4\uC138\uC694.",
    };
  }
  if (code === -51008) {
    return {
      active: true,
      collecting: true,
      code,
      message:
        "\uBC14\uB85C\uBE4C\uC5D0\uC11C \uACC4\uC88C \uAC70\uB798\uB0B4\uC5AD\uC744 \uC218\uC9D1 \uC911\uC785\uB2C8\uB2E4. \uC774\uBBF8 \uC218\uC9D1\uB41C \uB0B4\uC5ED\uC740 \uC544\uB798 \uAC00\uC838\uC635\uB2C8\uB2E4.",
    };
  }
  if (code < 0) {
    const detail = await describeBarobillCode(code);
    return {
      active: false,
      code,
      message: detail || `\uACC4\uC88C \uC218\uC9D1 \uD655\uC778 \uC2E4\uD328 (${code})`,
    };
  }
  return {
    active: true,
    code,
    message: "\uACC4\uC88C \uAC70\uB798\uB0B4\uC5AD \uC989\uC2DC \uC218\uC9D1\uC744 \uC694\uCCAD\uD588\uC2B5\uB2C8\uB2E4. \uBA87 \uBD84 \uD6C4 \uB2E4\uC2DC \uB3D9\uAE30\uD654\uD574 \uBCF4\uC138\uC694.",
  };
}

export async function getBankAccountScrapRequestUrl() {
  const { certKey, corpNum, userId } = assertBarobillBankCredentials();
  const userPwd = String(config.barobill.userPwd || "").trim();
  if (!userPwd) {
    throw new Error("BAROBILL_USER_PWD\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
  }

  const { rawResult } = await callBankAccountSoap(
    "GetBankAccountScrapRequestURL",
    { CERTKEY: certKey, CorpNum: corpNum, ID: userId, PWD: userPwd },
    "GetBankAccountScrapRequestURLResult",
  );

  return resolveBarobillUrlResult(rawResult, "\uACC4\uC88C \uC870\uD68C \uC11C\uBE44\uC2A4 \uC2E0\uCCAD URL\uC744 \uBC1B\uC9C0 \uBAB8\uC2B5\uB2C8\uB2E4.");
}

export async function getBankAccountManagementUrl() {
  const { certKey, corpNum, userId } = assertBarobillBankCredentials();
  const userPwd = String(config.barobill.userPwd || "").trim();
  if (!userPwd) {
    throw new Error("BAROBILL_USER_PWD\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
  }

  const { rawResult } = await callBankAccountSoap(
    "GetBankAccountManagementURL",
    { CERTKEY: certKey, CorpNum: corpNum, ID: userId, PWD: userPwd },
    "GetBankAccountManagementURLResult",
  );

  return resolveBarobillUrlResult(rawResult, "\uACC4\uC88C \uAD00\uB9AC URL\uC744 \uBC1B\uC9C0 \uBAB8\uC2B5\uB2C8\uB2E4.");
}

async function resolveBarobillUrlResult(rawResult, fallbackMessage) {
  const result = decodeXml(String(rawResult || "").trim());
  const asNumber = Number(result);
  if (Number.isFinite(asNumber) && asNumber < 0) {
    const detail = await describeBarobillCode(asNumber);
    const error = new Error(detail || fallbackMessage);
    error.errCode = asNumber;
    throw error;
  }
  if (!/^https?:\/\//i.test(result)) {
    throw new Error(result || fallbackMessage);
  }
  return result;
}

export async function listRegisteredBankAccounts() {
  const { certKey, corpNum } = assertBarobillBankCredentials();
  const xml = await callBankAccountSoapRequest("GetBankAccountEx", {
    CERTKEY: certKey,
    CorpNum: corpNum,
    AvailOnly: "1",
  });
  const resultBlock = extractResultBlock(xml, "GetBankAccountExResult");
  const blocks = extractAccountBlocks(resultBlock);

  return blocks.map((block) => ({
    bankName: readXmlTag(block, "BankName"),
    bankAccountNum: readXmlTag(block, "BankAccountNum"),
  }));
}

export async function refreshBankAccountScrap(bankAccountNum) {
  return checkBankAccountScrapService(bankAccountNum);
}
