import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { config } from "./config.mjs";
import { findUserByLoginId, findUserByEmail, parseSidebarHidden, parseSidebarOrder, parseAttendanceViewUserIds } from "./db.mjs";

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
    sidebarHidden: parseSidebarHidden(user.sidebar_hidden),
    attendanceViewUserIds: parseAttendanceViewUserIds(user.attendance_view_user_ids),
  };
}

export function authMiddleware(req, res, next) {
  const user = resolveRequestUser(req);
  if (!user) {
    res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
    return;
  }
  req.user = user;
  next();
}

export function resolveRequestUser(req) {
  const header = req.headers.authorization || "";
  let token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token && req.query?.token) token = String(req.query.token);
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    return { ...payload, id: payload.sub };
  } catch {
    return null;
  }
}

export function adminMiddleware(req, res, next) {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "??? ??? ?????." });
    return;
  }
  next();
}
