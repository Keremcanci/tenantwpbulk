const fs = require('fs');
const path = require('path');

const regPath = path.join(__dirname, '../node_modules/@whiskeysockets/baileys/lib/Socket/registration.js');

if (!fs.existsSync(regPath)) {
  console.log('[patch] registration.js not found, skipping');
  process.exit(0);
}

let content = fs.readFileSync(regPath, 'utf8');

if (content.includes('_computeAndroidToken')) {
  console.log('[patch] Already patched, skipping');
  process.exit(0);
}

// Android token constants (WhatsApp Android 2.26.26.70)
const ANDROID_HEADER = `
// === Android Registration Patch ===
const _crypto = require('crypto');
const _androidKey = Buffer.from('eQV5aq/Cg63Gsq1sshN9T3gh+UUp0wIw0xgHYT1bnCjEqOJQKCRrWxdAe2yvsDeCJL+Y4G3PRD2HUF7oUgiGo8vGlNJOaux26k+A2F3hj8A=', 'base64');
const _androidCert = Buffer.from('MIIDMjCCAvCgAwIBAgIETCU2pDALBgcqhkjOOAQDBQAwfDELMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFDASBgNVBAcTC1NhbnRhIENsYXJhMRYwFAYDVQQKEw1XaGF0c0FwcCBJbmMuMRQwEgYDVQQLEwtFbmdpbmVlcmluZzEUMBIGA1UEAxMLQnJpYW4gQWN0b24wHhcNMTAwNjI1MjMwNzE2WhcNNDQwMjE1MjMwNzE2WjB8MQswCQYDVQQGEwJVUzETMBEGA1UECBMKQ2FsaWZvcm5pYTEUMBIGA1UEBxMLU2FudGEgQ2xhcmExFjAUBgNVBAoTDVdoYXRzQXBwIEluYy4xFDASBgNVBAsTC0VuZ2luZWVyaW5nMRQwEgYDVQQDEwtCcmlhbiBBY3RvbjCCAbgwggEsBgcqhkjOOAQBMIIBHwKBgQD9f1OBHXUSKVLfSpwu7OTn9hG3UjzvRADDHj+AtlEmaUVdQCJR+1k9jVj6v8X1ujD2y5tVbNeBO4AdNG/yZmC3a5lQpaSfn+gEexAiwk+7qdf+t8Yb+DtX58aophUPBPuD9tPFHsMCNVQTWhaRMvZ1864rYdcq7/IiAxmd0UgBxwIVAJdgUI8VIwvMspK5gqLrhAvwWBz1AoGBAPfhoIXWmz3ey7yrXDa4V7l5lK+7+jrqgvlXTAs9B4JnUVlXjrrUWU/mcQcQgYC0SRZxI+hMKBYTt88JMozIpuE8FnqLVHyNKOCjrh4rs6Z1kW6jfwv6ITVi8ftiegEkO8yk8b6oUZCJqIPf4VrlnwaSi2ZegHtVJWQBTDv+z0kqA4GFAAKBgQDRGYtLgWh7zyRtQainJfCpiaUbzjJuhMgo4fVWZIvXHaSHBU1t5w//S0lDK2hiqkj8KpMWGywVov9eZxZy37V26dEqr/c2m5qZ0E+ynSu7sqUD7kGx/zeIcGT0H+KAVgkGNQCo5Uc0koLRWYHNtYoIvt5R3X6YZylbPftF/8ayWTALBgcqhkjOOAQDBQADLwAwLAIUAKYCp0d6z4QQdyN74JDfQ2WCyi8CFDUM4CaNB+ceVXdKtOrNTQcc0e+t', 'base64');
const _androidClassesMD5 = Buffer.from('9jwoxygO3t9b+IBffPu1PA==', 'base64');
function _computeAndroidToken(phone) {
    const data = Buffer.concat([_androidCert, _androidClassesMD5, Buffer.from(String(phone))]);
    return _crypto.createHmac('sha1', _androidKey).update(data).digest('base64');
}
// === End Android Patch ===
`;

// Replace token computation — handle different compiled forms
const patterns = [
  // Standard Baileys 6.5.0 compiled form
  /token:\s*\(0,\s*crypto_1\.md5\)\(Buffer\.concat\(\[Defaults_1\.MOBILE_TOKEN,\s*Buffer\.from\(params\.phoneNumberNationalNumber\)\]\)\)\.toString\('hex'\)/,
  // Alternative form without IIFE wrapper
  /token:\s*crypto_1\.md5\(Buffer\.concat\(\[Defaults_1\.MOBILE_TOKEN,\s*Buffer\.from\(params\.phoneNumberNationalNumber\)\]\)\)\.toString\('hex'\)/,
  // Direct md5 reference
  /token:\s*\(0,\s*[\w_]+\.md5\)\(Buffer\.concat\(\[[\w_]+\.MOBILE_TOKEN,\s*Buffer\.from\(params\.phoneNumberNationalNumber\)\]\)\)\.toString\('hex'\)/,
];

let patched = false;
for (const pattern of patterns) {
  if (pattern.test(content)) {
    content = content.replace(pattern, "token: _computeAndroidToken(params.phoneNumberNationalNumber)");
    patched = true;
    console.log('[patch] Token line replaced with Android HMAC-SHA1');
    break;
  }
}

if (!patched) {
  // Last resort: find and replace by searching for the token field
  const idx = content.indexOf('.MOBILE_TOKEN, Buffer.from(params.phoneNumberNationalNumber)');
  if (idx !== -1) {
    // Find start of 'token:' before this
    const start = content.lastIndexOf('token:', idx);
    const end = content.indexOf("'hex')", idx) + "'hex')".length;
    if (start !== -1 && end > start) {
      content = content.slice(0, start) + "token: _computeAndroidToken(params.phoneNumberNationalNumber)" + content.slice(end);
      patched = true;
      console.log('[patch] Token line replaced (fallback method)');
    }
  }
}

if (!patched) {
  console.error('[patch] FAILED: Could not find token line in registration.js');
  console.error('[patch] Content preview:', content.slice(0, 500));
  process.exit(1);
}

// Also add platform:'android' after hasinrc field
// Try multiple patterns for hasinrc field
const hasinrcPatterns = [
  /hasinrc:\s*'1',/,
  /hasinrc:\s*"1",/,
];

let platformPatched = false;
for (const p of hasinrcPatterns) {
  if (p.test(content)) {
    content = content.replace(p, (m) => m + "\n        platform: 'android',");
    platformPatched = true;
    console.log('[patch] platform:android added');
    break;
  }
}
if (!platformPatched) {
  // Fallback: add before token field
  content = content.replace("token: _computeAndroidToken(", "platform: 'android',\n        token: _computeAndroidToken(");
  console.log('[patch] platform:android added (fallback before token)');
}

// Prepend the Android header
content = ANDROID_HEADER + '\n' + content;

fs.writeFileSync(regPath, content);
console.log('[patch] registration.js patched successfully for Android');
