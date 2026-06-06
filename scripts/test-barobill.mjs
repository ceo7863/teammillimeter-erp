import {
  getBarobillConfigStatus,
  testBarobillConnection,
} from "../server/barobill/client.mjs";

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  printSection("??? ?? ??? (Phase 1)");

  const status = getBarobillConfigStatus();
  console.log(`??: ${status.test ? "???(testws.baroservice.com)" : "??(ws.baroservice.com)"}`);
  console.log(`???(CERTKEY): ${status.certKeyMasked}`);
  console.log(`?????: ${status.hasCorpNum ? "???" : "???"}`);
  console.log(`?? ID: ${status.hasUserId ? "???" : "???"}`);

  const result = await testBarobillConnection();

  printSection("??");
  if (result.connectionOk) {
    console.log("??: ??");
    console.log(result.message);
    if (typeof result.balance === "number") {
      console.log(`??(?): ${result.balance.toLocaleString("ko-KR")}`);
    }
    process.exitCode = 0;
    return;
  }

  console.log("??: ??");
  console.log(result.message);
  if (typeof result.errCode === "number") {
    console.log(`?? ??: ${result.errCode}`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("\n=== ??? ?? ?? ===");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
