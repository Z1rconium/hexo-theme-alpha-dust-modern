'use strict';

// Build-time half of the password-gate crypto. Mirrors the client-side
// implementation in themes/alpha-dust/source/js/crypto.js: PBKDF2-HMAC-SHA256
// key derivation + AES-256-GCM authenticated encryption. Keeping both sides in
// lock-step is what makes the browser able to decrypt what the build produced.
//
// GCM (not CBC) gives us authentication, so tampered ciphertext fails loudly
// instead of decrypting to garbage, and PBKDF2 with a high iteration count
// replaces crypto-js's single-round OpenSSL EVP_BytesToKey(MD5) derivation.
//
// Two output encodings share the same primitives:
//   * encryptString -> base64url(JSON), small and safe to place inside an HTML
//     attribute (used for post content/excerpt).
//   * encryptBytes  -> raw binary [u32 iterations][16B salt][12B iv][ct|tag],
//     ~44% smaller than base64 for large attachments (used for PDFs).
var crypto = require('crypto');

// OWASP's 2023 floor for PBKDF2-HMAC-SHA256. Bump this and old ciphertext
// still decrypts because the count travels inside each payload.
var ITERATIONS = 210000;
var KEY_BYTES = 32; // AES-256
var SALT_BYTES = 16;
var IV_BYTES = 12; // 96-bit nonce, the AES-GCM native size
var TAG_BYTES = 16;

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(Buffer.from(String(password), 'utf8'), salt, ITERATIONS, KEY_BYTES, 'sha256');
}

function encryptRaw(plain, password) {
  var buf = Buffer.isBuffer(plain) ? plain : Buffer.from(plain);
  var salt = crypto.randomBytes(SALT_BYTES);
  var iv = crypto.randomBytes(IV_BYTES);
  var cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(password, salt), iv);
  var ciphertext = Buffer.concat([cipher.update(buf), cipher.final()]);
  var tag = cipher.getAuthTag();
  return {
    // ciphertext || auth tag, exactly what Web Crypto's AES-GCM decrypt expects.
    data: Buffer.concat([ciphertext, tag]),
    salt: salt,
    iv: iv
  };
}

function encryptString(str, password) {
  var raw = encryptRaw(Buffer.from(String(str), 'utf8'), password);
  var payload = {
    v: 1,
    it: ITERATIONS,
    s: raw.salt.toString('base64'),
    iv: raw.iv.toString('base64'),
    ct: raw.data.toString('base64')
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function encryptBytes(plain, password) {
  var raw = encryptRaw(plain, password);
  var header = Buffer.alloc(4);
  header.writeUInt32BE(ITERATIONS, 0);
  return Buffer.concat([header, raw.salt, raw.iv, raw.data]);
}

module.exports = {
  ITERATIONS: ITERATIONS,
  TAG_BYTES: TAG_BYTES,
  encryptBytes: encryptBytes,
  encryptString: encryptString
};
