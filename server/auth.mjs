import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { config } from "./config.mjs";
import { findUserByEmail } from "./db.mjs";

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    config.jwtSecret,
    { expiresIn: config.tokenExpiresIn }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export function authenticateUser(email, password) {
  const user = findUserByEmail(email);
  if (!user) return null;
  const ok = bcrypt.compareSync(String(password || ""), user.password_hash);
  if (!ok) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
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
