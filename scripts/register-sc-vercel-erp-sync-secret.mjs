/**
 * Register ERP_SYNC_SECRET on Vercel (SC production).
 *
 * Usage:
 *   VERCEL_TOKEN=xxx node scripts/register-sc-vercel-erp-sync-secret.mjs
 *   VERCEL_TOKEN=xxx node scripts/register-sc-vercel-erp-sync-secret.mjs --secret "your-secret"
 *
 * Optional env:
 *   VERCEL_TEAM_SLUG=tobilife
 *   VERCEL_PROJECT=teammillimeter-office
 */

const token = String(process.env.VERCEL_TOKEN || "").trim();
const teamSlug = String(process.env.VERCEL_TEAM_SLUG || "tobilife").trim();
const project = String(process.env.VERCEL_PROJECT || "teammillimeter-office").trim();

const secretArgIndex = process.argv.indexOf("--secret");
const secret =
  secretArgIndex >= 0
    ? String(process.argv[secretArgIndex + 1] || "").trim()
    : String(process.env.SC_SYNC_SECRET || process.env.ERP_SYNC_SECRET || "").trim();

if (!token) {
  console.error("VERCEL_TOKEN is required. Create one at https://vercel.com/account/tokens");
  process.exit(1);
}
if (!secret) {
  console.error("Provide --secret or set SC_SYNC_SECRET / ERP_SYNC_SECRET");
  process.exit(1);
}

const url = new URL(`https://api.vercel.com/v10/projects/${encodeURIComponent(project)}/env`);
url.searchParams.set("upsert", "true");
if (teamSlug) url.searchParams.set("slug", teamSlug);

const response = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    key: "ERP_SYNC_SECRET",
    value: secret,
    type: "encrypted",
    target: ["production", "preview"],
    comment: "ERP sc.teammillimeter.com schedule export auth",
  }),
});

const body = await response.text();
if (!response.ok) {
  console.error(`Vercel API ${response.status}: ${body}`);
  process.exit(1);
}

console.log("ERP_SYNC_SECRET registered on Vercel for", project);
console.log(JSON.stringify(JSON.parse(body), null, 2));

// Trigger production redeploy so new env is picked up
const deployUrl = new URL("https://api.vercel.com/v13/deployments");
if (teamSlug) deployUrl.searchParams.set("slug", teamSlug);
const deployRes = await fetch(deployUrl, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: project,
    project: project,
    target: "production",
    gitSource: {
      type: "github",
      repo: "teammillimeter-office",
      ref: "main",
      org: "tobilife",
    },
  }),
});
const deployBody = await deployRes.text();
if (!deployRes.ok) {
  console.warn(`Deploy trigger ${deployRes.status}: ${deployBody.slice(0, 300)}`);
  console.warn("Env saved � redeploy manually from Vercel dashboard if needed.");
  process.exit(0);
}
console.log("Production redeploy triggered.");
console.log(deployBody.slice(0, 500));
