import fs from "fs";

const API = "https://erp.teammillimeter.com/api";
const PDF = process.argv[2] || String.raw`c:\Users\User\Downloads\????_?????_A4_1?.pdf`;
const meta = {
  fileName: "????_?????_A4_1?.pdf",
  clientName: process.argv[3] || "?????",
  title: process.argv[4] || "???? ?????",
  contactName: process.argv[5] || "???",
  contactPhone: process.argv[6] || "01057977863",
};

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loginId: "admin", password: "1234" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "login failed");
  return data.token;
}

async function main() {
  const buffer = fs.readFileSync(PDF);
  const token = await login();
  const uploadRes = await fetch(`${API}/client-contracts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/pdf",
      "X-Contract-Meta": encodeURIComponent(JSON.stringify(meta)),
    },
    body: buffer,
  });
  const uploaded = await uploadRes.json();
  if (!uploadRes.ok) throw new Error(uploaded.error || "upload failed");

  const sendRes = await fetch(`${API}/client-contracts/${uploaded.id}/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const sent = await sendRes.json();
  if (!sendRes.ok) throw new Error(sent.error || "send failed");

  console.log(JSON.stringify({ contractId: uploaded.id, signUrl: sent.signUrl, alimtalk: sent.alimtalk }, null, 2));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
