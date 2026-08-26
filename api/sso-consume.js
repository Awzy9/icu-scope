"use strict";
const crypto = require("crypto");
const EXPECTED_AUDIENCE = "scope";

function keyFromSecret(secret) {
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}
function openToken(token, secret) {
  const raw = Buffer.from(String(token || ""), "base64url");
  if (raw.length < 29) throw new Error("Malformed handoff");
  const iv = raw.subarray(0,12), tag = raw.subarray(12,28), encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
}
module.exports = function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });
  res.setHeader("Cache-Control", "no-store");
  const secret = process.env.ICU_SSO_SECRET || "";
  if (secret.length < 32) return res.status(503).json({ ok:false, error:"SSO not configured" });
  try {
    const payload = openToken(req.body && req.body.token, secret);
    const now = Math.floor(Date.now()/1000);
    if (payload.v !== 1 || payload.aud !== EXPECTED_AUDIENCE || !payload.exp || payload.exp < now || payload.iat > now + 10) {
      return res.status(401).json({ ok:false, error:"Expired or invalid handoff" });
    }
    return res.status(200).json({ ok:true, accessToken:payload.access_token, refreshToken:payload.refresh_token });
  } catch (e) {
    return res.status(401).json({ ok:false, error:"Invalid handoff" });
  }
};
