// Standards-compliant Web Push Encryption (RFC 8291 + RFC 8188 `aes128gcm`)
// and VAPID ES256 Authentication (RFC 8292) implemented strictly with Node's
// built-in `node:crypto` so Hatchable serverless functions require zero npm packages.

import crypto from 'node:crypto';

const RECORD_SIZE = 4096;
const MAX_PLAINTEXT_BYTES = 3072; // Keeps encrypted body well under 4 KB push limit

export function toBase64Url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function fromBase64Url(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(str.trim())) {
    throw new Error('Invalid base64url encoding.');
  }
  const normalized = str.trim().replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64');
}

export function generateVapidKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pubJwk = publicKey.export({ format: 'jwk' });
  const privJwk = privateKey.export({ format: 'jwk' });
  const uncompressedPub = Buffer.concat([
    Buffer.from([0x04]),
    fromBase64Url(pubJwk.x),
    fromBase64Url(pubJwk.y)
  ]);
  return {
    publicKey: toBase64Url(uncompressedPub),
    privateKey: privJwk.d
  };
}

export function validateVapidKeyPair(publicKeyB64Url, privateKeyB64Url) {
  const pubBytes = fromBase64Url(publicKeyB64Url);
  const privBytes = fromBase64Url(privateKeyB64Url);
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    throw new Error('VAPID public key must be a 65-byte uncompressed P-256 point.');
  }
  if (privBytes.length !== 32) {
    throw new Error('VAPID private key must be a 32-byte P-256 scalar.');
  }
  const x = toBase64Url(pubBytes.subarray(1, 33));
  const y = toBase64Url(pubBytes.subarray(33, 65));
  const d = toBase64Url(privBytes);
  const keyObj = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', x, y, d },
    format: 'jwk'
  });
  const derivedPub = crypto.createPublicKey(keyObj).export({ format: 'jwk' });
  if (derivedPub.x !== x || derivedPub.y !== y) {
    throw new Error('VAPID public and private keys do not match.');
  }
  return { keyObj, x, y };
}

export function createVapidHeaders({
  endpointUrl,
  subject,
  publicKey,
  privateKey,
  nowSec = Math.floor(Date.now() / 1000),
  ttlSec = 12 * 3600
}) {
  if (typeof subject !== 'string' || !/^(mailto:[^@\s]+@[^@\s]+|https:\/\/[^\s]+)$/i.test(subject.trim())) {
    throw new Error('VAPID subject must be a mailto: or https:// URI.');
  }
  if (!Number.isInteger(ttlSec) || ttlSec < 60 || ttlSec > 24 * 3600) {
    throw new Error('VAPID expiration window must be between 60 seconds and 24 hours.');
  }

  const aud = new URL(endpointUrl).origin;
  const { keyObj } = validateVapidKeyPair(publicKey, privateKey);

  const headerB64 = toBase64Url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' }), 'utf8'));
  const payloadB64 = toBase64Url(
    Buffer.from(
      JSON.stringify({
        aud,
        exp: nowSec + ttlSec,
        sub: subject.trim()
      }),
      'utf8'
    )
  );
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = crypto.sign('sha256', Buffer.from(signingInput, 'utf8'), {
    key: keyObj,
    dsaEncoding: 'ieee-p1363'
  });
  const jwt = `${signingInput}.${toBase64Url(sig)}`;
  const cleanPub = toBase64Url(fromBase64Url(publicKey));

  return {
    Authorization: `vapid t=${jwt}, k=${cleanPub}`,
    jwt
  };
}

export function verifyVapidJwt(jwt, publicKeyB64Url) {
  const parts = String(jwt || '').split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformed_jwt' };
  const pubBytes = fromBase64Url(publicKeyB64Url);
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) return { valid: false, reason: 'invalid_pubkey' };
  const pubKeyObj = crypto.createPublicKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: toBase64Url(pubBytes.subarray(1, 33)),
      y: toBase64Url(pubBytes.subarray(33, 65))
    },
    format: 'jwk'
  });
  const signingInput = `${parts[0]}.${parts[1]}`;
  const sig = fromBase64Url(parts[2]);
  const ok = crypto.verify('sha256', Buffer.from(signingInput, 'utf8'), { key: pubKeyObj, dsaEncoding: 'ieee-p1363' }, sig);
  if (!ok) return { valid: false, reason: 'bad_signature' };
  const claims = JSON.parse(fromBase64Url(parts[1]).toString('utf8'));
  return { valid: true, claims };
}

export function validateSubscriberKeys(p256dhB64Url, authB64Url) {
  let uaPublic;
  let authSecret;
  try {
    uaPublic = fromBase64Url(p256dhB64Url);
    authSecret = fromBase64Url(authB64Url);
  } catch {
    return { ok: false, error: 'Subscription keys must be valid base64url strings.' };
  }
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) {
    return { ok: false, error: 'Subscription p256dh key must be a 65-byte uncompressed P-256 public key.' };
  }
  if (authSecret.length !== 16) {
    return { ok: false, error: 'Subscription auth secret must be 16 bytes.' };
  }
  // Verify point lies on P-256 curve via ECDH computeSecret probe
  try {
    const probe = crypto.createECDH('prime256v1');
    probe.generateKeys();
    probe.computeSecret(uaPublic);
  } catch {
    return { ok: false, error: 'Subscription p256dh key is not a valid P-256 curve point.' };
  }
  return {
    ok: true,
    p256dhNormalized: toBase64Url(uaPublic),
    authNormalized: toBase64Url(authSecret),
    uaPublic,
    authSecret
  };
}

/**
 * Encrypts a UTF-8 JSON/string payload per RFC 8291 (`aes128gcm` content coding, RFC 8188).
 */
export function encryptWebPushPayload(plaintext, p256dhB64Url, authB64Url, saltOverride = null) {
  const plainBuf = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(String(plaintext), 'utf8');
  if (plainBuf.length > MAX_PLAINTEXT_BYTES) {
    throw new Error(`Push payload exceeds ${MAX_PLAINTEXT_BYTES}-byte safety limit.`);
  }

  const keyCheck = validateSubscriberKeys(p256dhB64Url, authB64Url);
  if (!keyCheck.ok) {
    throw new Error(keyCheck.error);
  }
  const { uaPublic, authSecret } = keyCheck;

  const salt = saltOverride ? Buffer.from(saltOverride) : crypto.randomBytes(16);
  if (salt.length !== 16) throw new Error('Salt must be 16 bytes.');

  const asEcdh = crypto.createECDH('prime256v1');
  const asPublic = asEcdh.generateKeys();
  const ecdhSecret = asEcdh.computeSecret(uaPublic);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\x00', 'ascii'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', ecdhSecret, authSecret, keyInfo, 32));

  const cekInfo = Buffer.from('Content-Encoding: aes128gcm\x00', 'ascii');
  const nonceInfo = Buffer.from('Content-Encoding: nonce\x00', 'ascii');
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, cekInfo, 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, nonceInfo, 12));

  // RFC 8188 §2: final record delimiter 0x02
  const paddedRecord = Buffer.concat([plainBuf, Buffer.from([0x02])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(paddedRecord), cipher.final()]);
  const tag = cipher.getAuthTag();

  // RFC 8188 §2.1: salt (16) || rs (4, uint32BE) || idlen (1, uint8=65) || keyid (65, asPublic)
  const rsBuf = Buffer.alloc(4);
  rsBuf.writeUInt32BE(RECORD_SIZE, 0);
  const idLenBuf = Buffer.from([asPublic.length]);
  const header = Buffer.concat([salt, rsBuf, idLenBuf, asPublic]);

  return Buffer.concat([header, encrypted, tag]);
}

/**
 * Decrypts an `aes128gcm` Web Push body using the subscriber's ECDH P-256 object and auth secret
 * (used by integration tests to verify wire-level RFC 8291 compatibility).
 */
export function decryptWebPushPayload(bodyBuffer, uaEcdh, authSecretBuf) {
  const buf = Buffer.from(bodyBuffer);
  if (buf.length < 86 + 17) throw new Error('Encrypted body too short.');
  const salt = buf.subarray(0, 16);
  const idLen = buf[20];
  if (idLen !== 65) throw new Error(`Unexpected keyid length ${idLen}`);
  const asPublic = buf.subarray(21, 21 + idLen);
  const ciphertextAndTag = buf.subarray(21 + idLen);
  const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - 16);
  const authTag = ciphertextAndTag.subarray(ciphertextAndTag.length - 16);

  const uaPublic = uaEcdh.getPublicKey();
  const ecdhSecret = uaEcdh.computeSecret(asPublic);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\x00', 'ascii'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', ecdhSecret, authSecretBuf, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\x00', 'ascii'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\x00', 'ascii'), 12));

  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(authTag);
  const padded = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  // Strip trailing zero padding up to 0x02 delimiter
  let delimIdx = padded.length - 1;
  while (delimIdx >= 0 && padded[delimIdx] === 0x00) delimIdx--;
  if (delimIdx < 0 || padded[delimIdx] !== 0x02) {
    throw new Error('Missing RFC 8188 0x02 record delimiter.');
  }
  return padded.subarray(0, delimIdx).toString('utf8');
}
