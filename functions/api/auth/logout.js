// functions/api/auth/logout.js

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

function expiredCookie(name) {
  // Expire immediately (and match Path=/ used at login)
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

export async function onRequestPost(context) {
  const headers = corsHeaders(context.request);

  // Expire BOTH possible cookie names (safe)
  const setCookie = [
    expiredCookie("sb_auth"),
    expiredCookie("sb_session"),
  ];

  return json(
    { ok: true },
    200,
    { ...headers, "set-cookie": setCookie.join(", ") }
  );
}
