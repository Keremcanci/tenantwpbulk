const fs = require('fs');
const path = require('path');

// iOS 25.27.73 binary MD5 from decrypted IPA
const NEW_MOBILE_TOKEN = '0a1mLfGUIBVrMKF1RdvLI5lkRBvof6vn0fD2QRSM340c2d9ee4f3b7caca06c08abcdc686b';
const NEW_MOBILE_USERAGENT = 'WhatsApp/25.27.73 iOS/17.5.1 Device/Apple-iPhone15,3';

// ── 1. Defaults/index.js: MOBILE_TOKEN + MOBILE_USERAGENT ──────────────────
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
  /exports\.MOBILE_TOKEN\s*=\s*Buffer\.from\([^)]+\);/,
  `exports.MOBILE_TOKEN = Buffer.from('${NEW_MOBILE_TOKEN}');`
);

defaults = defaults.replace(
  /exports\.MOBILE_USERAGENT\s*=\s*'[^']+';/,
  `exports.MOBILE_USERAGENT = '${NEW_MOBILE_USERAGENT}';`
);

fs.writeFileSync(defaultsPath, defaults);
console.log('[patch] Defaults/index.js: MOBILE_TOKEN + MOBILE_USERAGENT updated for iOS 25.27.73');

// ── 2. registration.js: Android patch varsa temizle ────────────────────────
const regPath = path.join(
  __dirname,
  '../node_modules/@whiskeysockets/baileys/lib/Socket/registration.js'
);

if (!fs.existsSync(regPath)) {
  console.log('[patch] registration.js not found, skipping cleanup');
  process.exit(0);
}

let reg = fs.readFileSync(regPath, 'utf8');

// Android header varsa kaldir
if (reg.includes('=== Android Registration Patch ===')) {
  reg = reg.replace(/\/\/ === Android Registration Patch ===[\s\S]*?\/\/ === End Android Patch ===/m, '');
  console.log('[patch] Android header removed from registration.js');
}

// Android token satiri varsa geri al
if (reg.includes('_computeAndroidToken')) {
  reg = reg.replace(
    /token:\s*_computeAndroidToken\(params\.phoneNumberNationalNumber\)/,
    "token: (0, crypto_1.md5)(Buffer.concat([Defaults_1.MOBILE_TOKEN, Buffer.from(params.phoneNumberNationalNumber)])).toString('hex')"
  );
  console.log('[patch] Android token replaced back to iOS MD5');
}

// platform: 'XXX' satirini kaldir (Android icin eklenmisti)
if (/platform:\s*'[^']*',/.test(reg)) {
  reg = reg.replace(/\n?\s*platform:\s*'[^']*',/g, '');
  console.log('[patch] platform param removed from registration.js');
}

fs.writeFileSync(regPath, reg.trim() + '\n');
console.log('[patch] registration.js cleaned for iOS');
console.log('[patch] Done. iOS 25.27.73 ready.');
