// functions/api/auth/register.js
// Sportinabox - Pages Function
// Creates a user in D1 and sets an auth cookie.
// Expects env.DB (D1 binding) + env.AUTH_SECRET (string)

export async function onRequest(context) {
  const { request, env } = context;

  // ---- basic request guard ----
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  console.log("[auth/register] INVOKED");

  // ---- parse body safely ----
  let body;
  try {
    body = await request.json();
  } catch (e) {
    console.error("[auth/register] Invalid JSON:", e);
    return json({ error: "Invalid JSON body" }, 400);
  }

  console.log("[auth/register] BODY keys:", Object.keys(body || {}));
  console.log("[auth/register] ENV keys:", Object.keys(env || {}));

  // ---- validate env ----
  if (!env || !env.DB) {
    console.error("[auth/register] Missing D1 binding env.DB");
    return json({ error: "Server misconfigured (DB binding missing)" }, 500);
  }
  if (!env.AUTH_SECRET || typeof env.AUTH_SECRET !== "string") {
    console.error("[auth/register] Missing env.AUTH_SECRET");
    return json({ error: "Server misconfigured (AUTH_SECRET missing)" }, 500);
  }

  // ---- validate input ----
  const name = (body?.name ?? "").toString().trim();
  const email = (body?.email ?? "").toString().trim().toLowerCase();
  const password = (body?.password ?? "").toString();
  const phone = (body?.phone ?? "").toString().trim();

  if (!email || !isValidEmail(email)) return json({ error: "Invalid email" }, 400);
  if (!password || password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

  // ---- create user ----
  const userId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  try {
    // Check if already exists
    const existing = await env.DB
      .prepare("SELECT id FROM users WHERE email = ? LIMIT 1")
      .bind(email)
      .first();

    if (existing?.id) {
      return json({ error: "Email already in use" }, 409);
    }

    // Hash password
    const salt = randomBase64Url(16);
    const passwordHash = await pbkdf2Hash(password, salt);

    // Insert
    await env.DB
      .prepare(
        `INSERT INTO users (id, email, password_hash, salt, name, phone, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(userId, email, passwordHash, salt, name || null, phone || null, createdAt)
      .run();

    console.log("[auth/register] User created:", userId, email);

    // Issue signed session token (HMAC)
    const session = await createSessionToken({
      uid: userId,
      email,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14, // 14 days
    }, env.AUTH_SECRET);

    const cookie = buildCookie("sb_session", session, {
      maxAge: 60 * 60 * 24 * 14,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
    });

    return new Response(
      JSON.stringify({
        ok: true,
        user: { id: userId, email, name: name || null, phone: phone || null, created_at: createdAt },
      }),
      {
        status: 201,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "set-cookie": cookie,
          "cache-control": "no-store",
        },
      }
    );
  } catch (e) {
    console.error("[auth/register] ERROR:", e?.stack || e);
    return json({ error: "Internal Server Error", detail: String(e?.message || e) }, 500);
  }
}

// ---------------- helpers ----------------

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function isValidEmail(email) {
  // simple, robust-enough validator
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function randomBase64Url(byteLen) {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function pbkdf2Hash(password, saltB64Url) {
  const enc = new TextEncoder();
  const saltBytes = base64UrlDecode(saltB64Url);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 150_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  return base64UrlEncode(new Uint8Array(bits));
}

async function createSessionToken(payloadObj, secret) {
  // token = base64url(JSON(payload)) + "." + base64url(HMAC_SHA256(payloadPart))
  const enc = new TextEncoder();
  const payloadPart = base64UrlEncode(enc.encode(JSON.stringify(payloadObj)));
  const sig = await hmacSha256(payloadPart, secret);
  return `${payloadPart}.${sig}`;
}

async function hmacSha256(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return base64UrlEncode(new Uint8Array(sigBuf));
}

function buildCookie(name, value, opts) {
  const parts = [`${name}=${value}`];

  if (opts?.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts?.path) parts.push(`Path=${opts.path}`);
  if (opts?.httpOnly) parts.push("HttpOnly");
  if (opts?.secure) parts.push("Secure");
  if (opts?.sameSite) parts.push(`SameSite=${opts.sameSite}`);

  return parts.join("; ");
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
