// Private Account-Backed Photo Verification, Metadata Stripping & Persistent Storage (`lib/photo-storage.js`)
//
// Security & Reliability Invariants:
//   1. Content-Based Verification: Validates raw byte bounds (<= 5 MB), inspects magic-byte
//      signatures (JPEG, PNG, WebP only), rejects HTML/SVG/PDF/GIF/polyglot payloads and declared
//      MIME mismatches, and decodes the complete image bitstream via `sharp` (`failOn: 'error'`,
//      `limitInputPixels: 25_000_000`, max `6000x6000`).
//   2. Orientation Normalization & Metadata Removal: Applies EXIF orientation correction (`.rotate()`)
//      and re-encodes WITHOUT `.withMetadata()`, stripping GPS coordinates, EXIF camera serials,
//      XMP, IPTC, ICC profiles, and textual comments.
//   3. Persistent Private Storage Outside Web Root: Writes safe CSPRNG-named files
//      (`<2-hex-shard>/pht_<32hex>_main.<ext>` and `<2-hex-shard>/pht_<32hex>_thumb.webp`) with `0600`
//      permissions inside `BITESHARK_PHOTO_STORAGE_DIR`, strictly confined via `fs.realpathSync`.
//   4. Atomic Write + Disk Headroom Guard: Checks available filesystem space (`fs.statfsSync`) before
//      writing temp files, `fsync`s before atomic `rename`, and cleans up both main + thumbnail files
//      on rollback or user deletion.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { readEnvCompat } from './env-compat.js';

// Bound libvips memory footprint on 1-vCPU / 961 MiB VPS
sharp.cache(false);
sharp.concurrency(1);

export const MAX_PHOTO_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MiB (5,242,880 bytes)
export const MAX_PHOTO_JSON_BODY_BYTES = 8 * 1024 * 1024; // 8 MiB JSON envelope for 5 MiB base64 payload
export const MAX_ACTIVE_PHOTOS_PER_USER = 12;
export const MAX_PHOTO_DIMENSION_PX = 6000;
export const MAX_PHOTO_INPUT_PIXELS = 25_000_000;
export const DEFAULT_MIN_FREE_DISK_BYTES = 64 * 1024 * 1024; // 64 MiB safety floor

export const SUPPORTED_PHOTO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export class PhotoStorageError extends Error {
  constructor(message, { status = 400, code = 'INVALID_PHOTO', retryable = false } = {}) {
    super(message);
    this.name = 'PhotoStorageError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export function resolvePhotoStorageRoot(envObj = process.env) {
  const configured = readEnvCompat('PHOTO_STORAGE_DIR', {
    securityCritical: false,
    defaultValue: '',
    envObj
  });
  if (configured) {
    return path.resolve(configured);
  }
  const envName = readEnvCompat('ENV', { securityCritical: false, defaultValue: 'development', envObj }).toLowerCase();
  if (envName === 'staging' || envName === 'production') {
    return '/var/lib/truckly-staging/customer-photos';
  }
  return path.join(os.tmpdir(), 'biteshark-dev-customer-photos');
}

export function resolvePhotoMinFreeBytes(envObj = process.env) {
  const raw = readEnvCompat('PHOTO_MIN_FREE_BYTES', {
    securityCritical: false,
    defaultValue: '',
    envObj
  });
  if (!raw) return DEFAULT_MIN_FREE_DISK_BYTES;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_MIN_FREE_DISK_BYTES;
  return parsed;
}

export function detectImageSignature(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { format: 'jpeg', mime: 'image/jpeg', ext: 'jpg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { format: 'png', mime: 'image/png', ext: 'png' };
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return { format: 'webp', mime: 'image/webp', ext: 'webp' };
  }

  return null;
}

export function decodeBase64PhotoPayload(rawBase64) {
  if (typeof rawBase64 !== 'string' || rawBase64.trim().length === 0) {
    throw new PhotoStorageError('Choose a JPEG, PNG, or WebP photo to upload.', {
      status: 400,
      code: 'PHOTO_MISSING_DATA'
    });
  }

  // Strip optional data URL prefix if present (`data:image/jpeg;base64,...`)
  let cleaned = rawBase64.trim();
  let embeddedMime = '';
  if (cleaned.startsWith('data:')) {
    const commaIdx = cleaned.indexOf(',');
    if (commaIdx === -1) {
      throw new PhotoStorageError('Malformed photo upload data.', {
        status: 400,
        code: 'PHOTO_INVALID_BASE64'
      });
    }
    const header = cleaned.slice(5, commaIdx);
    if (!/;base64$/i.test(header)) {
      throw new PhotoStorageError('Photo upload must use base64 encoding.', {
        status: 400,
        code: 'PHOTO_INVALID_BASE64'
      });
    }
    embeddedMime = header.slice(0, -';base64'.length).trim().toLowerCase();
    cleaned = cleaned.slice(commaIdx + 1).trim();
  }

  const compact = cleaned.replace(/[\r\n\s]+/g, '');
  // Pre-check approximate decoded size before allocating Buffer
  const approxBytes = Math.floor((compact.length * 3) / 4);
  if (approxBytes > MAX_PHOTO_UPLOAD_BYTES + 8) {
    throw new PhotoStorageError('Choose a photo smaller than 5 MB.', {
      status: 413,
      code: 'PHOTO_TOO_LARGE'
    });
  }

  if (compact.length < 16 || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    throw new PhotoStorageError('Malformed base64 photo data.', {
      status: 400,
      code: 'PHOTO_INVALID_BASE64'
    });
  }

  const buffer = Buffer.from(compact, 'base64');
  if (buffer.length === 0) {
    throw new PhotoStorageError('Uploaded photo file is empty.', {
      status: 400,
      code: 'PHOTO_EMPTY'
    });
  }
  if (buffer.length > MAX_PHOTO_UPLOAD_BYTES) {
    throw new PhotoStorageError('Choose a photo smaller than 5 MB.', {
      status: 413,
      code: 'PHOTO_TOO_LARGE'
    });
  }

  return { buffer, embeddedMime };
}

export async function verifyAndNormalizeUploadedPhoto({ dataBase64, declaredMimeType = '' } = {}) {
  const { buffer: rawBuffer, embeddedMime } = decodeBase64PhotoPayload(dataBase64);

  const normalizedDeclared = String(declaredMimeType || embeddedMime || '')
    .trim()
    .toLowerCase();
  if (normalizedDeclared && !SUPPORTED_PHOTO_MIMES.has(normalizedDeclared)) {
    throw new PhotoStorageError('Only JPEG, PNG, and WebP photos are supported.', {
      status: 415,
      code: 'UNSUPPORTED_PHOTO_FORMAT'
    });
  }

  const sig = detectImageSignature(rawBuffer);
  if (!sig) {
    throw new PhotoStorageError('File contents do not match a valid JPEG, PNG, or WebP image.', {
      status: 415,
      code: 'UNSUPPORTED_PHOTO_FORMAT'
    });
  }

  if (normalizedDeclared && normalizedDeclared !== sig.mime) {
    throw new PhotoStorageError(
      `Declared file type (${normalizedDeclared}) does not match actual image contents (${sig.mime}).`,
      {
        status: 400,
        code: 'PHOTO_MIME_MISMATCH'
      }
    );
  }

  let metadata;
  try {
    metadata = await sharp(rawBuffer, {
      failOn: 'error',
      limitInputPixels: MAX_PHOTO_INPUT_PIXELS,
      sequentialRead: true
    }).metadata();
  } catch (err) {
    const msg = String(err?.message || '');
    if (/pixel limit/i.test(msg)) {
      throw new PhotoStorageError(
        `Photo dimensions exceed the maximum allowed size (${MAX_PHOTO_DIMENSION_PX}×${MAX_PHOTO_DIMENSION_PX} px).`,
        { status: 422, code: 'PHOTO_DIMENSIONS_EXCEEDED' }
      );
    }
    throw new PhotoStorageError('That file could not be decoded as a valid photo. Please choose another image.', {
      status: 422,
      code: 'CORRUPT_PHOTO_DATA'
    });
  }

  if (!metadata || metadata.format !== sig.format) {
    throw new PhotoStorageError('Image container did not match decoded format.', {
      status: 422,
      code: 'CORRUPT_PHOTO_DATA'
    });
  }

  const srcWidth = Number(metadata.width || 0);
  const srcHeight = Number(metadata.height || 0);
  if (
    !Number.isInteger(srcWidth) ||
    !Number.isInteger(srcHeight) ||
    srcWidth < 1 ||
    srcHeight < 1 ||
    srcWidth > MAX_PHOTO_DIMENSION_PX ||
    srcHeight > MAX_PHOTO_DIMENSION_PX ||
    srcWidth * srcHeight > MAX_PHOTO_INPUT_PIXELS
  ) {
    throw new PhotoStorageError(
      `Photo dimensions must be between 1×1 and ${MAX_PHOTO_DIMENSION_PX}×${MAX_PHOTO_DIMENSION_PX} pixels.`,
      { status: 422, code: 'PHOTO_DIMENSIONS_EXCEEDED' }
    );
  }

  try {
    // `.rotate()` auto-orients pixels using EXIF Orientation (`1..8`), and omitting `.withMetadata()`
    // strips all EXIF (including GPS coordinates), XMP, IPTC, ICC, and comment chunks.
    let mainPipeline = sharp(rawBuffer, {
      failOn: 'error',
      limitInputPixels: MAX_PHOTO_INPUT_PIXELS,
      sequentialRead: true
    })
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true
      });

    if (sig.format === 'jpeg') {
      mainPipeline = mainPipeline.jpeg({ quality: 84, mozjpeg: true });
    } else if (sig.format === 'png') {
      mainPipeline = mainPipeline.png({ compressionLevel: 8 });
    } else {
      mainPipeline = mainPipeline.webp({ quality: 82 });
    }

    const mainOut = await mainPipeline.toBuffer({ resolveWithObject: true });

    const thumbOut = await sharp(mainOut.data, {
      failOn: 'error',
      limitInputPixels: MAX_PHOTO_INPUT_PIXELS
    })
      .resize({
        width: 320,
        height: 320,
        fit: 'cover',
        position: 'centre'
      })
      .webp({ quality: 78 })
      .toBuffer({ resolveWithObject: true });

    const sha256Hex = crypto.createHash('sha256').update(mainOut.data).digest('hex');

    return {
      mimeType: sig.mime,
      ext: sig.ext,
      mainBuffer: mainOut.data,
      byteSize: mainOut.data.length,
      width: mainOut.info.width,
      height: mainOut.info.height,
      thumbBuffer: thumbOut.data,
      thumbByteSize: thumbOut.data.length,
      sha256Hex,
      orientationCorrected: Number(metadata.orientation || 1) > 1
    };
  } catch (err) {
    if (err instanceof PhotoStorageError) throw err;
    throw new PhotoStorageError('That file could not be safely processed as a photo. Please try another image.', {
      status: 422,
      code: 'CORRUPT_PHOTO_DATA'
    });
  }
}

function ensureAndResolveStorageRoot(storageRoot, { createIfDev = true } = {}) {
  if (!storageRoot || typeof storageRoot !== 'string') {
    throw new PhotoStorageError('Private photo storage is not configured.', {
      status: 503,
      code: 'PHOTO_STORAGE_UNAVAILABLE',
      retryable: true
    });
  }
  const resolved = path.resolve(storageRoot);
  if (!fs.existsSync(resolved)) {
    const envName = readEnvCompat('ENV', { securityCritical: false, defaultValue: 'development' }).toLowerCase();
    if (!createIfDev || envName === 'staging' || envName === 'production') {
      throw new PhotoStorageError('Private photo storage is temporarily unavailable.', {
        status: 503,
        code: 'PHOTO_STORAGE_UNAVAILABLE',
        retryable: true
      });
    }
    try {
      fs.mkdirSync(resolved, { recursive: true, mode: 0o700 });
    } catch {
      throw new PhotoStorageError('Private photo storage could not be initialized.', {
        status: 503,
        code: 'PHOTO_STORAGE_UNAVAILABLE',
        retryable: true
      });
    }
  }

  let realRoot;
  try {
    const st = fs.lstatSync(resolved);
    if (!st.isDirectory() || st.isSymbolicLink()) {
      throw new Error('storage_root_not_directory');
    }
    realRoot = fs.realpathSync(resolved);
  } catch {
    throw new PhotoStorageError('Private photo storage is temporarily unavailable.', {
      status: 503,
      code: 'PHOTO_STORAGE_UNAVAILABLE',
      retryable: true
    });
  }
  return realRoot;
}

function resolveConfinedPath(realRoot, relPath) {
  if (typeof relPath !== 'string' || !/^[a-f0-9]{2}\/pht_[a-f0-9]{24,40}_(main\.(jpg|png|webp)|thumb\.webp)$/.test(relPath)) {
    throw new PhotoStorageError('Invalid internal photo storage reference.', {
      status: 500,
      code: 'PHOTO_INVALID_STORAGE_PATH'
    });
  }
  const target = path.resolve(realRoot, ...relPath.split('/'));
  if (target !== realRoot && !target.startsWith(realRoot + path.sep)) {
    throw new PhotoStorageError('Photo path escaped storage root.', {
      status: 500,
      code: 'PHOTO_INVALID_STORAGE_PATH'
    });
  }
  return target;
}

function writeAtomicFile(filePath, dataBuffer) {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
  let fd = null;
  try {
    fd = fs.openSync(tmpPath, 'wx', 0o600);
    fs.writeFileSync(fd, dataBuffer);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
    if (err?.code === 'ENOSPC') {
      throw new PhotoStorageError('Photo storage is temporarily full. Please try again later.', {
        status: 507,
        code: 'PHOTO_STORAGE_LOW_DISK',
        retryable: false
      });
    }
    throw new PhotoStorageError('Private photo storage is temporarily unavailable.', {
      status: 503,
      code: 'PHOTO_STORAGE_UNAVAILABLE',
      retryable: true
    });
  }
}

export function writePhotoDerivativesAtomically({
  storageRoot,
  photoId,
  ext,
  mainBuffer,
  thumbBuffer,
  minFreeBytes = resolvePhotoMinFreeBytes()
}) {
  if (!/^pht_[a-f0-9]{24,40}$/.test(String(photoId || ''))) {
    throw new PhotoStorageError('Invalid generated photo identifier.', {
      status: 500,
      code: 'PHOTO_INVALID_ID'
    });
  }

  const realRoot = ensureAndResolveStorageRoot(storageRoot);

  // Disk-pressure guard via `fs.statfsSync`
  const requiredBytes = Math.max(minFreeBytes, mainBuffer.length + thumbBuffer.length + 1024 * 1024);
  if (typeof fs.statfsSync === 'function') {
    try {
      const statfs = fs.statfsSync(realRoot);
      const availBytes = Number(statfs.bavail) * Number(statfs.bsize);
      if (Number.isFinite(availBytes) && availBytes < requiredBytes) {
        throw new PhotoStorageError('Server photo storage does not have enough free space right now.', {
          status: 507,
          code: 'PHOTO_STORAGE_LOW_DISK',
          retryable: false
        });
      }
    } catch (err) {
      if (err instanceof PhotoStorageError) throw err;
    }
  }

  const shard = photoId.slice(4, 6);
  const storageRelPath = `${shard}/${photoId}_main.${ext}`;
  const thumbRelPath = `${shard}/${photoId}_thumb.webp`;
  const mainAbsPath = resolveConfinedPath(realRoot, storageRelPath);
  const thumbAbsPath = resolveConfinedPath(realRoot, thumbRelPath);
  const shardDir = path.dirname(mainAbsPath);

  try {
    fs.mkdirSync(shardDir, { recursive: true, mode: 0o700 });
  } catch {
    throw new PhotoStorageError('Private photo storage is not writable.', {
      status: 503,
      code: 'PHOTO_STORAGE_UNAVAILABLE',
      retryable: true
    });
  }

  try {
    writeAtomicFile(mainAbsPath, mainBuffer);
    writeAtomicFile(thumbAbsPath, thumbBuffer);
  } catch (err) {
    try {
      fs.unlinkSync(mainAbsPath);
    } catch {}
    try {
      fs.unlinkSync(thumbAbsPath);
    } catch {}
    throw err;
  }

  return { storageRelPath, thumbRelPath };
}

export function deletePhotoFilesSafely({ storageRoot, storageRelPath, thumbRelPath }) {
  let realRoot;
  try {
    realRoot = ensureAndResolveStorageRoot(storageRoot, { createIfDev: false });
  } catch {
    return { deletedMain: false, deletedThumb: false };
  }
  let deletedMain = false;
  let deletedThumb = false;
  for (const [rel, isThumb] of [
    [storageRelPath, false],
    [thumbRelPath, true]
  ]) {
    if (!rel) continue;
    try {
      const abs = resolveConfinedPath(realRoot, rel);
      const lst = fs.lstatSync(abs);
      if (lst.isFile() && !lst.isSymbolicLink()) {
        fs.unlinkSync(abs);
        if (isThumb) deletedThumb = true;
        else deletedMain = true;
      }
    } catch (err) {
      if (err?.code === 'ENOENT') {
        if (isThumb) deletedThumb = true;
        else deletedMain = true;
      }
    }
  }
  return { deletedMain, deletedThumb };
}

export function readPhotoDerivativeSafely({ storageRoot, relPath }) {
  const realRoot = ensureAndResolveStorageRoot(storageRoot, { createIfDev: false });
  const abs = resolveConfinedPath(realRoot, relPath);
  let lst;
  try {
    lst = fs.lstatSync(abs);
  } catch (err) {
    if (err?.code === 'ENOENT') {
      throw new PhotoStorageError('Saved photo file is missing from storage.', {
        status: 404,
        code: 'PHOTO_FILE_MISSING',
        retryable: false
      });
    }
    throw new PhotoStorageError('Private photo storage could not be read.', {
      status: 503,
      code: 'PHOTO_STORAGE_UNAVAILABLE',
      retryable: true
    });
  }
  if (!lst.isFile() || lst.isSymbolicLink()) {
    throw new PhotoStorageError('Invalid photo file entry.', {
      status: 404,
      code: 'PHOTO_FILE_MISSING',
      retryable: false
    });
  }
  return fs.readFileSync(abs);
}
