// functions/api/auth/login.js

const PBKDF2_ITER = 100000;          // must be <= 100000 on Cloudflare
const PBKDF2_HASH = "SHA-256";
const PBKDF2_KEYLEN_BITS = 256;      // 32 bytes

function corsHeaders(req) {
  const origin = req.headers.get("Origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "vary": "Origin",
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function bytesToHex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function timingSafeEqualHex(a, b) {
  // Constant-time-ish compare for same-length hex strings
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function pbkdf2Hash(password, saltBytes, secret) {
  const input = `${secret}:${password}`;
  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(input),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: PBKDF2_ITER,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    PBKDF2_KEYLEN_BITS
  );

  return new Uint8Array(bits);
}

// --- minimal JWT (HS256) without deps ---
function base64UrlEncodeBytes(bytes) {
  let s = "";
  bytes.forEach(b => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeJson(obj) {
  const jsonStr = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(jsonStr);
  return base64UrlEncodeBytes(bytes);
}

async function hmacSha256(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

async function signJwtHS256(payload, secret, expiresInSeconds = 60 * 60 * 24 * 7) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds };

  const h = base64UrlEncodeJson(header);
  const p = base64UrlEncodeJson(fullPayload);
  const data = `${h}.${p}`;
  const sigBytes = await hmacSha256(secret, data);
  const s = base64UrlEncodeBytes(sigBytes);
  return `${data}.${s}`;
}

function makeCookie(name, value, opts = {}) {
  const parts = [`${name}=${value}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join("; ");
}

export async function onRequestOptions(context) {
  const headers = corsHeaders(context.request);
  return new Response(null, { status: 204, headers });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = corsHeaders(request);

  console.log("[auth/login] INVOKED");

  try {
    const body = await request.json().catch(() => null);
    if (!body) return json({ error: "Invalid JSON" }, 400, headers);

    const email = (body.email || "").trim().toLowerCase();
    const password = (body.password || "").trim();

    console.log("[auth/login] BODY keys:", Object.keys(body || {}));
    console.log("[auth/login] email:", email);

    if (!env?.DB) return json({ error: "Server misconfig: DB binding missing (env.DB)" }, 500, headers);
    if (!env?.AUTH_SECRET) return json({ error: "Server misconfig: AUTH_SECRET missing" }, 500, headers);

    if (!email || !password) return json({ error: "Email and password are required" }, 400, headers);

    const user = await env.DB
      .prepare("SELECT id, email, name, password_hash, salt, created_at FROM users WHERE email = ? LIMIT 1")
      .bind(email)
      .first();

    if (!user?.id) return json({ error: "Invalid credentials" }, 401, headers);
    if (!user.salt || !user.password_hash) return json({ error: "Account invalid (missing salt/hash)" }, 500, headers);

    const saltBytes = b64ToBytes(user.salt);
    const hashBytes = await pbkdf2Hash(password, saltBytes, env.AUTH_SECRET);
    const computedHex = bytesToHex(hashBytes);

    if (!timingSafeEqualHex(computedHex, user.password_hash)) {
      return json({ error: "Invalid credentials" }, 401, headers);
    }

    // Create JWT + set cookie
    const token = await signJwtHS256(
      { sub: user.id, email: user.email, name: user.name || null },
      env.AUTH_SECRET,
      60 * 60 * 24 * 7 // 7 days
    );

    const cookie = makeCookie("sb_auth", token, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      maxAge: 60 * 60 * 24 * 7,
    });

    console.log("[auth/login] OK", { userId: user.id });

    return json(
      { ok: true, user: { id: user.id, email: user.email, name: user.name || null, created_at: user.created_at } },
      200,
      { ...headers, "set-cookie": cookie }
    );
  } catch (err) {
    console.error("[auth/login] ERROR:", err?.stack || String(err));
    return json({ error: "Internal Server Error", detail: String(err?.message || err) }, 500, headers);
  }
}
