// functions/api/auth/register.js

const PBKDF2_ITER = 100000;          // Cloudflare limit (must be <= 100000)
const PBKDF2_HASH = "SHA-256";
const PBKDF2_KEYLEN_BITS = 256;      // 32 bytes
const SALT_BYTES = 16;

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

function bytesToB64(bytes) {
  let s = "";
  bytes.forEach(b => (s += String.fromCharCode(b)));
  return btoa(s);
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function pbkdf2Hash(password, saltBytes, secret) {
  // Mix server-side secret into the password input
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

export async function onRequestOptions(context) {
  const headers = corsHeaders(context.request);
  return new Response(null, { status: 204, headers });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = corsHeaders(request);

  console.log("[auth/register] INVOKED");

  try {
    const body = await request.json().catch(() => null);
    if (!body) return json({ error: "Invalid JSON" }, 400, headers);

    const { name, email, password } = body;

    console.log("[auth/register] BODY keys:", Object.keys(body || {}));
    console.log("[auth/register] ENV keys:", Object.keys(env || {}));

    if (!env?.DB) return json({ error: "Server misconfig: DB binding missing (env.DB)" }, 500, headers);
    if (!env?.AUTH_SECRET) return json({ error: "Server misconfig: AUTH_SECRET missing" }, 500, headers);

    const cleanName = (name || "").trim();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanPassword = (password || "").trim();

    if (!cleanEmail || !cleanPassword) {
      return json({ error: "Email and password are required" }, 400, headers);
    }
    if (cleanPassword.length < 6) {
      return json({ error: "Password must be at least 6 characters" }, 400, headers);
    }

    // Check existing
    const existing = await env.DB
      .prepare("SELECT id FROM users WHERE email = ? LIMIT 1")
      .bind(cleanEmail)
      .first();

    if (existing?.id) {
      return json({ error: "Email already registered" }, 409, headers);
    }

    // Generate salt
    const saltBytes = crypto.getRandomValues(new Uint8Array(SALT_BYTES));

    // Hash password with PBKDF2 (iterations <= 100000!)
    const hashBytes = await pbkdf2Hash(cleanPassword, saltBytes, env.AUTH_SECRET);

    const userId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    // Store base64 salt + hex hash (simple & portable)
    const salt_b64 = bytesToB64(saltBytes);
    const password_hash = bytesToHex(hashBytes);

    await env.DB
      .prepare(
        `INSERT INTO users (id, email, password_hash, salt, name, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(userId, cleanEmail, password_hash, salt_b64, cleanName || null, createdAt)
      .run();

    console.log("[auth/register] OK", { userId, email: cleanEmail });

    return json(
      { ok: true, user: { id: userId, email: cleanEmail, name: cleanName || null, created_at: createdAt } },
      201,
      headers
    );
  } catch (err) {
    console.error("[auth/register] ERROR:", err?.stack || String(err));
    return json(
      { error: "Internal Server Error", detail: String(err?.message || err) },
      500,
      headers
    );
  }
}
