import { syncBarobillTaxInvoices } from "../server/barobill/taxInvoiceSync.mjs";
import { getBarobillConfigStatus } from "../server/barobill/client.mjs";

function parseArgs(argv) {
  const args = { from: "", to: "", flowTypes: ["purchase", "sales"], apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--from") args.from = argv[++i] || "";
    else if (token === "--to") args.to = argv[++i] || "";
    else if (token === "--apply") args.apply = true;
    else if (token === "--purchase-only") args.flowTypes = ["purchase"];
    else if (token === "--sales-only") args.flowTypes = ["sales"];
  }
  return args;
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

async function main() {
  const defaults = defaultDateRange();
  const args = parseArgs(process.argv.slice(2));
  const startDate = args.from || defaults.from;
  const endDate = args.to || defaults.to;

  const status = getBarobillConfigStatus();
  console.log("\n=== ??? ????? ??? (CLI) ===");
  console.log(`??: ${status.test ? "???" : "??"}`);
  console.log(`???: ${status.certKeyMasked}`);
  console.log(`??: ${startDate} ~ ${endDate}`);
  console.log(`??: ${args.flowTypes.join(", ")}`);
  console.log(`??: ${args.apply ? "? (ERP ?? ? ? — preview only unless --apply with server)" : "??? (????)"}`);

  if (!status.configured) {
    console.error("\n??: BAROBILL_CERT_KEY? BAROBILL_CORP_NUM? ?????.");
    process.exitCode = 1;
    return;
  }
  if (!status.hasUserId) {
    console.error("\n??: BAROBILL_USER_ID? ?????.");
    process.exitCode = 1;
    return;
  }

  try {
    const result = await syncBarobillTaxInvoices({
      startDate,
      endDate,
      flowTypes: args.flowTypes,
      existing: [],
      author: { name: "CLI", loginId: "cli" },
      apply: args.apply,
    });

    const { preview } = result;
    console.log("\n=== ?? ===");
    console.log(`?? ??: ${preview.rows.length}`);
    console.log(`?? ??: ${result.added}`);
    console.log(`?? ??: ${result.skipped}`);
    console.log(
      `??: ?? ${preview.parsedTotals.supply.toLocaleString("ko-KR")} / ??? ${preview.parsedTotals.vat.toLocaleString("ko-KR")} / ? ${preview.parsedTotals.total.toLocaleString("ko-KR")}`,
    );

    if (preview.earliestIssueDate) {
      console.log(`??? ??: ${preview.earliestIssueDate} ~ ${preview.latestIssueDate}`);
    }

    if (preview.errors.length) {
      console.log("\n=== ??/?? ===");
      preview.errors.slice(0, 5).forEach((line) => console.log(`- ${line}`));
      if (preview.errors.length > 5) {
        console.log(`... ? ${preview.errors.length - 5}?`);
      }
    }

    if (preview.rows.length) {
      console.log("\n=== ?? (?? 5?) ===");
      preview.rows.slice(0, 5).forEach((row) => {
        console.log(
          `${row.issueDate} | ${row.flowType === "purchase" ? "??" : "??"} | ${row.client} | ${row.totalAmount.toLocaleString("ko-KR")} | ${row.invoiceNo}`,
        );
      });
    } else {
      console.log("\n??? ?????? ????. (?? ? ??? ?? ?? ??? ???)");
    }

    process.exitCode = preview.errors.length && !preview.rows.length ? 1 : 0;
  } catch (error) {
    console.error("\n=== ??? ?? ===");
    console.error(error instanceof Error ? error.message : String(error));
    if (error && typeof error === "object" && "errCode" in error) {
      console.error(`?? ??: ${error.errCode}`);
    }
    process.exitCode = 1;
  }
}

main();
