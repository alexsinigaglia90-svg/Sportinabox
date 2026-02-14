import { json, setCookie } from "../_util.js";
export async function onRequestPost(){
  const cookie = setCookie("sib_token", "", { httpOnly:true, secure:true, sameSite:"Lax", path:"/", maxAge: 0 });
  return json({ ok:true }, 200, { "Set-Cookie": cookie });
}
