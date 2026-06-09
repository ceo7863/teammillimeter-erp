import { loadEnv } from "../server/loadEnv.mjs";
import { resolveAlimtalkLogoBannerPath, uploadAlimtalkTemplateImage } from "../server/alimtalkSolapi.mjs";

loadEnv();

const banner = resolveAlimtalkLogoBannerPath("/home/ubuntu/teammillimeter-erp");
const imageId = await uploadAlimtalkTemplateImage(banner);
console.log("imageId:", imageId);
