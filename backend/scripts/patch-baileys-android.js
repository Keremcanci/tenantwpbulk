const fs = require('fs');
const path = require('path');

// Android 2.26.26.70 - META-INF/IMPORTED.DSA (WhatsApp Inc. signed)
const CERT_B64 = 'MIIETgYJKoZIhvcNAQcCoIIEPzCCBDsCAQExDzANBglghkgBZQMEAgEFADALBgkqhkiG9w0BBwGgggM2MIIDMjCCAvCgAwIBAgIETCU2pDALBgcqhkjOOAQDBQAwfDELMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFDASBgNVBAcTC1NhbnRhIENsYXJhMRYwFAYDVQQKEw1XaGF0c0FwcCBJbmMuMRQwEgYDVQQLEwtFbmdpbmVlcmluZzEUMBIGA1UEAxMLQnJpYW4gQWN0b24wHhcNMTAwNjI1MjMwNzE2WhcNNDQwMjE1MjMwNzE2WjB8MQswCQYDVQQGEwJVUzETMBEGA1UECBMKQ2FsaWZvcm5pYTEUMBIGA1UEBxMLU2FudGEgQ2xhcmExFjAUBgNVBAoTDVdoYXRzQXBwIEluYy4xFDASBgNVBAsTC0VuZ2luZWVyaW5nMRQwEgYDVQQDEwtCcmlhbiBBY3RvbjCCAbgwggEsBgcqhkjOOAQBMIIBHwKBgQD9f1OBHXUSKVLfSpwu7OTn9hG3UjzvRADDHj+AtlEmaUVdQCJR+1k9jVj6v8X1ujD2y5tVbNeBO4AdNG/yZmC3a5lQpaSfn+gEexAiwk+7qdf+t8Yb+DtX58aophUPBPuD9tPFHsMCNVQTWhaRMvZ1864rYdcq7/IiAxmd0UgBxwIVAJdgUI8VIwvMspK5gqLrhAvwWBz1AoGBAPfhoIXWmz3ey7yrXDa4V7l5lK+7+jrqgvlXTAs9B4JnUVlXjrrUWU/mcQcQgYC0SRZxI+hMKBYTt88JMozIpuE8FnqLVHyNKOCjrh4rs6Z1kW6jfwv6ITVi8ftiegEkO8yk8b6oUZCJqIPf4VrlnwaSi2ZegHtVJWQBTDv+z0kqA4GFAAKBgQDRGYtLgWh7zyRtQainJfCpiaUbzjJuhMgo4fVWZIvXHaSHBU1t5w//S0lDK2hiqkj8KpMWGywVov9eZxZy37V26dEqr/c2m5qZ0E+ynSu7sqUD7kGx/zeIcGT0H+KAVgkGNQCo5Uc0koLRWYHNtYoIvt5R3X6YZylbPftF/8ayWTALBgcqhkjOOAQDBQADLwAwLAIUAKYCp0d6z4QQdyN74JDfQ2WCyi8CFDUM4CaNB+ceVXdKtOrNTQcc0e+tMYHdMIHaAgEBMIGEMHwxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpDYWxpZm9ybmlhMRQwEgYDVQQHEwtTYW50YSBDbGFyYTEWMBQGA1UEChMNV2hhdHNBcHAgSW5jLjEUMBIGA1UECxMLRW5naW5lZXJpbmcxFDASBgNVBAMTC0JyaWFuIEFjdG9uAgRMJTakMA0GCWCGSAFlAwQCAQUAMA0GCWCGSAFlAwQDAgUABDAwLgIVAIcE3KAWuqZbQwPVcrqyvImbT/uJAhUAlUUUk1X5IMOlhHUHH66zGkw2fv4=';
// classes.dex MD5 (16 bytes, base64): f63c28c7280ededf5bf8805f7cfbb53c
const CLASSES_MD5_B64 = '9jwoxygO3t9b+IBffPu1PA==';
// Android 2.26.26.70 User-Agent
const NEW_MOBILE_USERAGENT = 'WhatsApp/2.26.26.70 A';

// ── 1. Defaults/index.js: MOBILE_USERAGENT ─────────────────────────────────
const defaultsPath = path.join(
  __dirname,
  '../node_modules/@whiskeysockets/baileys/lib/Defaults/index.js'
);

if (!fs.existsSync(defaultsPath)) {
  console.error('[patch] Defaults/index.js not found');
  process.exit(1);
}

let defaults = fs.readFileSync(defaultsPath, 'utf8');

defaults = defaults.replace(
  /exports\.MOBILE_USERAGENT\s*=\s*'[^']+';/,
  `exports.MOBILE_USERAGENT = '${NEW_MOBILE_USERAGENT}';`
);

fs.writeFileSync(defaultsPath, defaults);
console.log('[patch] Defaults: MOBILE_USERAGENT set to Android 2.26.26.70');

// ── 2. registration.js: Android HMAC-SHA1 token, platform OLMADAN ──────────
const regPath = path.join(
  __dirname,
  '../node_modules/@whiskeysockets/baileys/lib/Socket/registration.js'
);

if (!fs.existsSync(regPath)) {
  console.log('[patch] registration.js not found, skipping');
  process.exit(0);
}

let reg = fs.readFileSync(regPath, 'utf8');

// Onceki Android patch varsa temizle
if (reg.includes('=== Android Registration Patch ===')) {
  reg = reg.replace(/\/\/ === Android Registration Patch ===[\s\S]*?\/\/ === End Android Patch ===/m, '');
  console.log('[patch] Old Android patch removed');
}

// platform: 'XXX' satiri varsa kaldir
if (/platform:\s*'[^']*',/.test(reg)) {
  reg = reg.replace(/\n?\s*platform:\s*'[^']*',/g, '');
  console.log('[patch] platform param removed');
}

// HMAC Android token inject
const ANDROID_PATCH = `
// === Android Registration Patch ===
const _nativeCrypto = require('crypto');
const _certBytes = Buffer.from('${CERT_B64}', 'base64');
const _classesMD5 = Buffer.from('${CLASSES_MD5_B64}', 'base64');
function _computeAndroidToken(phone) {
  const h = _nativeCrypto.createHmac('sha1', Buffer.from('Android'));
  h.update(_certBytes);
  h.update(_classesMD5);
  h.update(Buffer.from(phone, 'utf-8'));
  return h.digest('hex').toUpperCase().substring(0, 32);
}
// === End Android Patch ===
`;

// HMAC token satiri var mi zaten?
if (reg.includes('_computeAndroidToken')) {
  console.log('[patch] Android token already patched');
} else {
  // iOS MD5 token satirini HMAC ile degistir
  const iosMD5Pattern = /token:\s*\(0,\s*crypto_1\.md5\)\(Buffer\.concat\(\[Defaults_1\.MOBILE_TOKEN,\s*Buffer\.from\(params\.phoneNumberNationalNumber\)\]\)\)\.toString\('hex'\)/;

  if (iosMD5Pattern.test(reg)) {
    // Patch enjekte et: HMAC fonksiyonu dosyanin basina, token satiri degistirilir
    reg = reg.replace(
      /^(const crypto_1\s*=\s*require\([^)]+\);[^\n]*\n)/m,
      `$1${ANDROID_PATCH}\n`
    );

    reg = reg.replace(
      iosMD5Pattern,
      "token: _computeAndroidToken(params.phoneNumberNationalNumber)"
    );
    console.log('[patch] Android HMAC-SHA1 token injected');
  } else {
    // Alternatif pattern
    const altPattern = /token:\s*\(0,\s*crypto_1\.md5\)\([^)]+\)\.toString\('hex'\)/;
    if (altPattern.test(reg)) {
      reg = reg.replace(
        /^(const crypto_1\s*=\s*require\([^)]+\);[^\n]*\n)/m,
        `$1${ANDROID_PATCH}\n`
      );
      reg = reg.replace(
        altPattern,
        "token: _computeAndroidToken(params.phoneNumberNationalNumber)"
      );
      console.log('[patch] Android HMAC-SHA1 token injected (alt pattern)');
    } else {
      console.log('[patch] WARNING: token pattern not found in registration.js');
      // Tum token satirlarini goster
      const tokenLines = reg.split('\n').filter(l => l.includes('token:'));
      console.log('[patch] Token lines found:', tokenLines);
    }
  }
}

fs.writeFileSync(regPath, reg.trim() + '\n');
console.log('[patch] registration.js patched for Android (no platform param)');
console.log('[patch] Done.');
