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

function expireCookie(name) {
  // Must match Path=/ from login cookie
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

export async function onRequestPost(context) {
  const headers = corsHeaders(context.request);

  // Expire both names to be safe
  const setCookie = [
    expireCookie("sb_auth"),
    expireCookie("sb_session"),
  ].join(", ");

  return json({ ok: true }, 200, { ...headers, "set-cookie": setCookie });
}
