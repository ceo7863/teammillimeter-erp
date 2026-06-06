import { getBarobillConfigStatus } from "../server/barobill/client.mjs";
import { registAndIssueTaxInvoice } from "../server/barobill/taxInvoiceIssue.mjs";

function parseArgs(argv) {
  const args = {
    client: "??????",
    businessNo: "1234567890",
    supply: 1000,
    documentType: "tax",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--client") args.client = argv[++i] || args.client;
    else if (token === "--business-no") args.businessNo = argv[++i] || args.businessNo;
    else if (token === "--supply") args.supply = Number(argv[++i]) || args.supply;
    else if (token === "--bill") args.documentType = "bill";
    else if (token === "--tax") args.documentType = "tax";
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const status = getBarobillConfigStatus();

  console.log("\n=== ??? ????? ?? ??? (CLI) ===");
  console.log(`??: ${status.test ? "???" : "??"}`);
  console.log(`???: ${status.certKeyMasked}`);
  console.log(`???: ${args.client} (${args.businessNo})`);
  console.log(`??: ${args.documentType === "bill" ? "???" : "?????"}`);

  if (!status.configured) {
    console.error("\n??: BAROBILL_CERT_KEY? BAROBILL_CORP_NUM? ?????.");
    process.exitCode = 1;
    return;
  }

  const issueDate = new Date().toISOString().slice(0, 10);
  const supplyAmount = Math.max(1, Math.round(args.supply));
  const vatAmount = args.documentType === "bill" ? 0 : Math.round(supplyAmount * 0.1);
  const totalAmount = supplyAmount + vatAmount;

  console.log(`???: ${issueDate}`);
  console.log(`??: ?? ${supplyAmount.toLocaleString("ko-KR")} / ??? ${vatAmount.toLocaleString("ko-KR")} / ?? ${totalAmount.toLocaleString("ko-KR")}`);

  if (!String(process.env.BAROBILL_CEO_NAME || "").trim()) {
    console.warn("\n??: BAROBILL_CEO_NAME? ???? ?????. ??? ??? ? ????.");
  }
  if (!String(process.env.BAROBILL_CONTACT_EMAIL || "").trim()) {
    console.warn("??: BAROBILL_CONTACT_EMAIL? ???? ?????. ??? ??? ? ????.");
  }

  try {
    const result = await registAndIssueTaxInvoice({
      issueDate,
      client: args.client,
      businessNo: args.businessNo,
      flowType: "sales",
      documentType: args.documentType,
      supplyAmount,
      vatAmount,
      totalAmount,
      itemName: "??? ??",
      memo: "CLI ?? ???",
      purposeType: 2,
    });

    console.log("\n=== ?? ===");
    console.log(`??: ${result.ok ? "?" : "???"}`);
    console.log(`MgtKey: ${result.mgtKey}`);
    if (result.invoiceNo) console.log(`????(NTSSendKey): ${result.invoiceNo}`);
    console.log(result.message);
    process.exitCode = 0;
  } catch (error) {
    console.error("\n=== ?? ?? ===");
    console.error(error instanceof Error ? error.message : String(error));
    if (error && typeof error === "object" && "errCode" in error) {
      console.error(`?? ??: ${error.errCode}`);
    }
    process.exitCode = 1;
  }
}

main();
