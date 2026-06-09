import { execFileSync } from "child_process";
import fs from "fs";
import { loadEnv } from "../server/loadEnv.mjs";
import { solapiAuthHeader, solapiRequest } from "../server/alimtalkSolapi.mjs";

loadEnv();

const banner =
  "/home/ubuntu/teammillimeter-erp/server/templates/team-mm-alimtalk-banner.jpg";
if (!fs.existsSync(banner)) {
  throw new Error(`missing banner: ${banner}`);
}

const attempts = [
  ["KAKAO", "file"],
  ["ATA", "file"],
];

for (const [type, field] of attempts) {
  const auth = solapiAuthHeader();
  try {
    const output = execFileSync(
      "curl",
      [
        "-sS",
        "https://api.solapi.com/storage/v1/files",
        "-H",
        `Authorization: ${auth}`,
        "--form",
        `${field}=@${banner};type=image/jpeg`,
        "--form",
        `type=${type}`,
      ],
      { encoding: "utf8" },
    );
    console.log(type, field, "=>", output);
  } catch (error) {
    console.log(type, field, "=> ERR", error.message);
  }
}

try {
  const list = await solapiRequest("GET", "/storage/v1/files?type=ATA&limit=3");
  console.log("list", JSON.stringify(list).slice(0, 800));
} catch (error) {
  console.log("list err", error.message);
}
