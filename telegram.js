// Shared helpers for validating Telegram WebApp initData and building JSON responses.
// Used by functions/api/verify-open.js.
//
// Validation algorithm is Telegram's documented one:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//   secret_key = HMAC_SHA256(key="WebAppData", message=<bot_token>)
//   hash       = HEX( HMAC_SHA256(key=secret_key, message=<data_check_string>) )
// where data_check_string is every field except "hash", sorted by key,
// joined as "key=value" lines with "\n".

async function hmacSha256Raw(keyBytes, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

function bytesToHex(bytes) {
  var out = "";
  for (var i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

// Returns the parsed Telegram user object ({ id, first_name, username, ... })
// only if initData's signature is genuinely valid for this bot token and not
// stale. Returns null on any failure — callers must treat null as "untrusted".
async function validateInitData(initData, botToken, maxAgeSeconds) {
  if (!initData || !botToken) return null;

  var params;
  try {
    params = new URLSearchParams(initData);
  } catch (e) {
    return null;
  }

  var hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  var pairs = [];
  params.forEach(function (value, key) {
    pairs.push(key + "=" + value);
  });
  pairs.sort();
  var dataCheckString = pairs.join("\n");

  var secretKeyBytes = await hmacSha256Raw(new TextEncoder().encode("WebAppData"), botToken);
  var computedHashBytes = await hmacSha256Raw(secretKeyBytes, dataCheckString);
  var computedHash = bytesToHex(computedHashBytes);

  if (computedHash !== hash) return null;

  var authDate = parseInt(params.get("auth_date") || "0", 10);
  var maxAge = typeof maxAgeSeconds === "number" ? maxAgeSeconds : 86400;
  var nowSeconds = Math.floor(Date.now() / 1000);
  if (!authDate || (nowSeconds - authDate) > maxAge) return null;

  var userJson = params.get("user");
  if (!userJson) return null;

  var user;
  try {
    user = JSON.parse(userJson);
  } catch (e) {
    return null;
  }
  if (!user || !user.id) return null;

  return user;
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json" }
  });
}

export { validateInitData, jsonResponse };
