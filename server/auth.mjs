import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { config } from "./config.mjs";
import { findUserByLoginId, findUserByEmail, parseSidebarOrder } from "./db.mjs";

function publicEmail(email) {
  const value = String(email || "").trim();
  if (!value || value.endsWith("@local.teammillimeter")) return null;
  return value;
}

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      loginId: user.loginId,
      email: user.email || "",
      name: user.name,
      role: user.role,
    },
    config.jwtSecret,
    { expiresIn: config.tokenExpiresIn },
  );
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export function authenticateUser(identifier, password) {
  let user = findUserByLoginId(identifier);
  if (!user && String(identifier || "").includes("@")) {
    user = findUserByEmail(identifier);
  }
  if (!user) return null;
  if (!user.is_active) return null;
  const ok = bcrypt.compareSync(String(password || ""), user.password_hash);
  if (!ok) return null;
  return {
    id: user.id,
    loginId: user.login_id,
    email: publicEmail(user.email),
    name: user.name,
    phone: user.phone || null,
    role: user.role,
    allowedPages: (() => {
      if (!user.allowed_pages) return null;
      try {
        const parsed = JSON.parse(String(user.allowed_pages));
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    })(),
    sidebarOrder: parseSidebarOrder(user.sidebar_order),
  };
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "로그인이 필요합니다." });
    return;
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "세션이 만료되었습니다. 다시 로그인해 주세요." });
  }
}

export function adminMiddleware(req, res, next) {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "관리자 권한이 필요합니다." });
    return;
  }
  next();
}
