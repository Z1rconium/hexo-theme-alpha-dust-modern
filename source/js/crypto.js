// Client half of the password-gate crypto. Decrypts the payloads produced by
// scripts/lib/webcrypto.js using the browser's native Web Crypto API:
// PBKDF2-HMAC-SHA256 key derivation + authenticated AES-256-GCM decryption.
//
// This replaces the ~219 KB unminified crypto-js bundle the site used to ship
// on every page containing a locked post, and is strictly stronger: GCM
// rejects tampered ciphertext and PBKDF2's 210k iterations make offline
// password guessing far more expensive. Requires a secure context (HTTPS),
// which the site already runs on.
//
// Two payload encodings are understood, matching the build side:
//   * string  -> base64url(JSON {v,it,s,iv,ct})  (post content/excerpt)
//   * ArrayBuffer/Uint8Array -> raw binary [u32 it][16B salt][12B iv][ct|tag]
var AlphaDustCrypto = (function () {

    var TEXT_DECODER = typeof TextDecoder === 'function' ? new TextDecoder() : null;
    var keyCache = {};

    function isSupported() {
        return typeof crypto !== 'undefined' &&
            !!crypto.subtle &&
            typeof crypto.subtle.decrypt === 'function' &&
            typeof TextEncoder === 'function' &&
            !!TEXT_DECODER;
    }

    function base64ToBytes(b64) {
        var bin = atob(b64);
        var out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    function base64UrlToBytes(value) {
        var b64 = value.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        return base64ToBytes(b64);
    }

    function bytesToBase64(bytes) {
        var bin = '';
        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }

    function parseStringPayload(payload) {
        var parsed = JSON.parse(TEXT_DECODER.decode(base64UrlToBytes(payload)));
        return {
            it: parsed.it,
            salt: base64UrlToBytes(parsed.s),
            iv: base64UrlToBytes(parsed.iv),
            data: base64UrlToBytes(parsed.ct)
        };
    }

    function parseBinaryPayload(buffer) {
        var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        // 4 (iterations) + 16 (salt) + 12 (iv) + 16 (tag) = 48 bytes minimum.
        if (bytes.length < 48) throw new Error('AlphaDustCrypto: truncated payload');
        var it = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
        return {
            it: it,
            salt: bytes.subarray(4, 20),
            iv: bytes.subarray(20, 32),
            data: bytes.subarray(32)
        };
    }

    function deriveKey(password, salt, iterations) {
        var cacheKey = iterations + ':' + bytesToBase64(salt) + ':' + password;
        if (keyCache[cacheKey]) return keyCache[cacheKey];

        var promise = crypto.subtle
            .importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
            .then(function (baseKey) {
                return crypto.subtle.deriveKey(
                    { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
                    baseKey,
                    { name: 'AES-GCM', length: 256 },
                    false,
                    ['decrypt']
                );
            });

        keyCache[cacheKey] = promise;
        return promise;
    }

    function decryptRaw(parsed, password) {
        return deriveKey(password, parsed.salt, parsed.it).then(function (key) {
            return crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: parsed.iv, tagLength: 128 },
                key,
                parsed.data
            );
        }).then(function (buf) {
            return new Uint8Array(buf);
        });
    }

    function decryptString(payload, password) {
        if (!isSupported() || !payload || !password) {
            return Promise.reject(new Error('AlphaDustCrypto: unsupported or missing input'));
        }
        var parsed;
        try {
            parsed = parseStringPayload(payload);
        } catch (e) {
            return Promise.reject(e);
        }
        return decryptRaw(parsed, password).then(function (bytes) {
            return TEXT_DECODER.decode(bytes);
        });
    }

    function decryptBytes(payload, password) {
        if (!isSupported() || !payload || !password) {
            return Promise.reject(new Error('AlphaDustCrypto: unsupported or missing input'));
        }
        var parsed;
        try {
            parsed = typeof payload === 'string' ? parseStringPayload(payload) : parseBinaryPayload(payload);
        } catch (e) {
            return Promise.reject(e);
        }
        return decryptRaw(parsed, password);
    }

    return {
        isSupported: isSupported,
        decryptString: decryptString,
        decryptBytes: decryptBytes
    };
}());

window.AlphaDustCrypto = AlphaDustCrypto;
