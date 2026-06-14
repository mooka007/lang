import crypto from "node:crypto";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function createSignature(input) {
  return crypto
    .createHmac("sha256", env.jwtSecret)
    .update(input)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    teamIds: user.teamMemberships?.map((membership) => membership.teamId) || []
  };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validatePassword(password) {
  if (String(password || "").length < 8) {
    const error = new Error("Password must be at least 8 characters.");
    error.status = 400;
    throw error;
  }
}

export function signToken(user) {
  const header = {
    alg: "HS256",
    typ: "JWT"
  };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    iat: now,
    exp: now + env.jwtExpiresInSeconds
  };
  const body = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  return `${body}.${createSignature(body)}`;
}

export function verifyToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, signature] = parts;
  const expectedSignature = createSignature(`${header}.${payload}`);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const decoded = JSON.parse(base64UrlDecode(payload));
    if (!decoded.sub || Number(decoded.exp || 0) < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export async function hashPassword(password) {
  validatePassword(password);
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey.toString("hex"));
    });
  });
  return `scrypt:${salt}:${hash}`;
}

export async function verifyPassword(password, passwordHash) {
  const [, salt, storedHash] = String(passwordHash || "").split(":");
  if (!salt || !storedHash) {
    return false;
  }

  const candidateHash = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey.toString("hex"));
    });
  });
  const storedBuffer = Buffer.from(storedHash, "hex");
  const candidateBuffer = Buffer.from(candidateHash, "hex");
  return storedBuffer.length === candidateBuffer.length && crypto.timingSafeEqual(storedBuffer, candidateBuffer);
}

export async function registerUser({ name, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !String(name || "").trim()) {
    const error = new Error("Name and email are required.");
    error.status = 400;
    throw error;
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      email: normalizedEmail
    }
  });
  if (existingUser) {
    const error = new Error("An account already exists for this email.");
    error.status = 409;
    throw error;
  }

  const user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash: await hashPassword(password),
      role: "user"
    },
    include: {
      teamMemberships: true
    }
  });

  return {
    user: publicUser(user),
    token: signToken(user)
  };
}

export async function loginUser({ email, password }) {
  const user = await prisma.user.findUnique({
    where: {
      email: normalizeEmail(email)
    },
    include: {
      teamMemberships: true
    }
  });
  const isValid = user ? await verifyPassword(String(password || ""), user.passwordHash) : false;

  if (!user || !isValid) {
    const error = new Error("Invalid email or password.");
    error.status = 401;
    throw error;
  }

  return {
    user: publicUser(user),
    token: signToken(user)
  };
}

export async function getUserById(userId) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId
    },
    include: {
      teamMemberships: true
    }
  });
  return user ? publicUser(user) : null;
}
