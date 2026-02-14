// functions/api/me.js

function corsHeaders(req) {
  const origin = req.headers.get("Origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, OPTIONS",
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

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(";").forEach(part => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(rest.join("=") || "");
  });
  return out;
}

function b64UrlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToB64Url(bytes) {
  let s = "";
  bytes.forEach(b => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function verifyJwtHS256(token, secret) {
  const parts = (token || "").split(".");
  if (parts.length !== 3) return null;

  const [h, p, s] = parts;
  const data = `${h}.${p}`;

  const expectedSig = bytesToB64Url(await hmacSha256(secret, data));
  if (!timingSafeEqualStr(expectedSig, s)) return null;

  // decode payload
  const payloadJson = new TextDecoder().decode(b64UrlToBytes(p));
  const payload = JSON.parse(payloadJson);

  // exp check (seconds)
  const now = Math.floor(Date.now() / 1000);
  if (payload?.exp && now >= payload.exp) return null;

  return payload;
}

export async function onRequestOptions(context) {
  const headers = corsHeaders(context.request);
  return new Response(null, { status: 204, headers });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const headers = corsHeaders(request);

  try {
    if (!env?.AUTH_SECRET) {
      return json({ error: "Server misconfig: AUTH_SECRET missing" }, 500, headers);
    }
    if (!env?.DB) {
      return json({ error: "Server misconfig: DB binding missing (env.DB)" }, 500, headers);
    }

    const cookies = parseCookies(request.headers.get("cookie") || "");
    const token = cookies.sb_auth; // <-- MUST match login.js set-cookie name

    if (!token) {
      return json({ error: "Unauthorized" }, 401, headers);
    }

    const payload = await verifyJwtHS256(token, env.AUTH_SECRET);
    if (!payload?.sub) {
      return json({ error: "Unauthorized" }, 401, headers);
    }

    const user = await env.DB
      .prepare("SELECT id, email, name, created_at FROM users WHERE id = ? LIMIT 1")
      .bind(payload.sub)
      .first();

    if (!user?.id) {
      return json({ error: "Unauthorized" }, 401, headers);
    }

    return json({ ok: true, user }, 200, headers);
  } catch (err) {
    console.error("[api/me] ERROR:", err?.stack || String(err));
    return json({ error: "Internal Server Error", detail: String(err?.message || err) }, 500, headers);
  }
}
