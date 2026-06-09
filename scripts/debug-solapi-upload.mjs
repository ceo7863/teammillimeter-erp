import { execFileSync } from "child_process";
import { loadEnv } from "../server/loadEnv.mjs";
import { solapiAuthHeader, solapiRequest } from "../server/alimtalkSolapi.mjs";

loadEnv();

const banner =
  "/home/ubuntu/teammillimeter-erp/server/templates/team-mm-alimtalk-banner.jpg";
const auth = solapiAuthHeader();

const attempts = [
  ["KAKAO", "file"],
  ["ATA", "file"],
  ["KAKAO", "upload"],
  ["ATA", "upload"],
];

for (const [type, field] of attempts) {
  try {
    const output = execFileSync(
      "curl",
      [
        "-sS",
        "https://api.solapi.com/storage/v1/files",
        "-H",
        `Authorization: ${auth}`,
        "-F",
        `${field}=@${banner};type=image/jpeg`,
        "-F",
        `type=${type}`,
      ],
      { encoding: "utf8" },
    );
    console.log(type, field, "=>", output.slice(0, 300));
  } catch (error) {
    console.log(type, field, "=> ERR", String(error.stdout || error.message).slice(0, 300));
  }
}

try {
  const list = await solapiRequest("GET", "/storage/v1/files?type=KAKAO&limit=3");
  console.log("list", JSON.stringify(list).slice(0, 500));
} catch (error) {
  console.log("list err", error.message);
}
