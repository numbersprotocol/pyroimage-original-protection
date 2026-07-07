import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const DEFAULT_MAX_IMAGE_BYTES = 2_000_000;

export function bitsToHex(bits) {
  let value = 0n;
  bits.forEach((bit) => {
    value = (value << 1n) | BigInt(bit ? 1 : 0);
  });
  return value.toString(16).padStart(Math.ceil(bits.length / 4), "0");
}

export function hammingDistance(hexA, hexB) {
  let value = BigInt(`0x${hexA}`) ^ BigInt(`0x${hexB}`);
  let count = 0;
  while (value > 0n) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
}

export function hashPixels(gray9x8) {
  if (gray9x8.length !== 72) {
    throw new Error(`Expected 72 grayscale bytes from ffmpeg, got ${gray9x8.length}`);
  }

  const pixels8x8 = [];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      pixels8x8.push(gray9x8[y * 9 + x]);
    }
  }

  const average = pixels8x8.reduce((sum, pixel) => sum + pixel, 0) / pixels8x8.length;
  const ahashBits = pixels8x8.map((pixel) => pixel >= average);

  const dhashBits = [];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      dhashBits.push(gray9x8[y * 9 + x] > gray9x8[y * 9 + x + 1]);
    }
  }

  return {
    ahash64: bitsToHex(ahashBits),
    dhash64: bitsToHex(dhashBits),
  };
}

export function fingerprintFile(filePath) {
  const probeRaw = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,codec_name",
      "-of",
      "json",
      filePath,
    ],
    { encoding: "utf8" },
  );
  const probe = JSON.parse(probeRaw);
  const stream = probe.streams?.[0] || {};

  const gray9x8 = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", filePath, "-vf", "scale=9:8:flags=lanczos,format=gray", "-f", "rawvideo", "pipe:1"],
    { encoding: "buffer", maxBuffer: 1024 * 1024 },
  );
  const hashes = hashPixels(gray9x8);

  return {
    ...hashes,
    image_width_px: Number(stream.width || 0),
    image_height_px: Number(stream.height || 0),
    codec_name: stream.codec_name || "",
  };
}

export function fingerprintBuffer(buffer, options = {}) {
  const tempDir = options.tempDir || fs.mkdtempSync(path.join(os.tmpdir(), "ttd-fingerprint-"));
  const ownsTempDir = !options.tempDir;
  const extension = options.extension || "jpg";
  const tempFile = path.join(tempDir, `${options.prefix || "candidate"}.${extension}`);

  try {
    fs.writeFileSync(tempFile, buffer);
    return fingerprintFile(tempFile);
  } finally {
    fs.rmSync(tempFile, { force: true });
    if (ownsTempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

export function reencodeImageBuffer(buffer, options = {}) {
  const tempDir = options.tempDir || fs.mkdtempSync(path.join(os.tmpdir(), "ttd-reencode-"));
  const ownsTempDir = !options.tempDir;
  const inputExtension = options.inputExtension || "jpg";
  const inputFile = path.join(tempDir, `${options.prefix || "source"}.${inputExtension}`);

  try {
    fs.writeFileSync(inputFile, buffer);
    return execFileSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        inputFile,
        "-vf",
        options.filter || "scale=160:-2:flags=lanczos",
        "-q:v",
        String(options.quality || 7),
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "pipe:1",
      ],
      { encoding: "buffer", maxBuffer: options.maxImageBytes || DEFAULT_MAX_IMAGE_BYTES },
    );
  } finally {
    fs.rmSync(inputFile, { force: true });
    if (ownsTempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

export function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function inferImageExtension(contentType = "") {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}

export function redactUrl(value) {
  if (typeof value !== "string" || value.length === 0) return "";
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return value.split("?")[0];
  }
}

export function redactSignedQueryInText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/https?:\/\/[^\s"')<>]+/g, (match) => {
    try {
      const parsed = new URL(match);
      const hasSignedQuery = [...parsed.searchParams.keys()].some((key) => {
        const normalized = key.toLowerCase();
        return (
          normalized === "expires" ||
          normalized === "signature" ||
          normalized === "key-pair-id" ||
          normalized === "policy" ||
          normalized.startsWith("x-amz-")
        );
      });
      return hasSignedQuery ? redactUrl(match) : match;
    } catch {
      return match;
    }
  });
}
