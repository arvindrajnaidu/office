import { join } from "path";
import { unlinkSync, readFileSync, writeFileSync, statSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { getOutputDir } from "../../config.js";
import { downloadVideo, combineVideos, detectPlatform } from "videogaga";
import { downloadMediaMessage, normalizeMessageContent, extractMessageContent } from "@whiskeysockets/baileys";
import { extractBody } from "../../utils/formatters.js";

const execFileAsync = promisify(execFile);
const BOT_PREFIX = "\u{1F916} ";
const URL_REGEX = /https?:\/\/[^\s<>"']+/g;
const WHATSAPP_MAX_MB = 64;

function isVideoUrl(url) {
  try {
    return detectPlatform(url) !== "unknown";
  } catch {
    return /instagram\.com\/reel|youtube\.com\/shorts|youtu\.be|fb\.watch|tiktok\.com/i.test(url);
  }
}

function getVideoMessage(msg) {
  const normalized = normalizeMessageContent(msg.message);
  if (!normalized) return null;
  const extracted = extractMessageContent(normalized);
  const content = extracted || normalized;
  return content?.videoMessage || null;
}

async function inOutputDir(fn) {
  const prev = process.cwd();
  process.chdir(getOutputDir());
  try { return await fn(); } finally { process.chdir(prev); }
}

async function compressForWhatsApp(inputPath, outputPath) {
  await execFileAsync("ffmpeg", [
    "-y", "-i", inputPath,
    "-c:v", "libx264", "-preset", "medium", "-crf", "28",
    "-vf", "scale='min(720,iw)':-2",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    outputPath,
  ], { timeout: 300_000 });
}

/**
 * Create a video digest from messages. Returns { file, sizeMB, downloaded, failed }
 * or null if no videos found.
 */
export async function handleDigest(ctx, chatName, messages) {
  const { selfJid, safeSend } = ctx;

  async function progress(text) {
    try {
      await safeSend(selfJid, { text: BOT_PREFIX + text });
    } catch {
      // Socket may be reconnecting
    }
  }

  await progress(`Scanning ${chatName} for videos...`);

  // Collect video URLs from text messages
  const videoUrls = [];
  const seenUrls = new Set();

  // Collect video media attachments
  const videoMessages = [];

  for (const msg of messages) {
    // Check for video media attachment
    const videoMsg = getVideoMessage(msg);
    if (videoMsg) {
      videoMessages.push(msg);
    }

    // Check for video URLs in text/caption
    const body = extractBody(msg);
    if (!body) continue;
    const matches = body.match(URL_REGEX);
    if (!matches) continue;
    for (const url of matches) {
      const clean = url.replace(/[.,;:!?)]+$/, "");
      if (isVideoUrl(clean) && !seenUrls.has(clean)) {
        seenUrls.add(clean);
        videoUrls.push(clean);
      }
    }
  }

  const totalVideos = videoUrls.length + videoMessages.length;
  if (totalVideos === 0) return null;

  await progress(`Found ${totalVideos} video(s) (${videoMessages.length} attached, ${videoUrls.length} links). Downloading...`);

  const tmpPaths = [];
  let downloaded = 0;
  let failed = 0;

  // Download video attachments from WhatsApp
  for (const msg of videoMessages) {
    const tmpPath = join(getOutputDir(), `wa-digest-${Date.now()}-${downloaded}.mp4`);
    try {
      const buffer = await downloadMediaMessage(msg, "buffer", {});
      writeFileSync(tmpPath, buffer);
      tmpPaths.push(tmpPath);
      downloaded++;
      await progress(`Downloaded ${downloaded}/${totalVideos}...`);
    } catch {
      failed++;
    }
  }

  // Download videos from URLs
  for (const url of videoUrls) {
    const tmpPath = join(getOutputDir(), `wa-digest-${Date.now()}-${downloaded}.mp4`);
    try {
      await inOutputDir(() => downloadVideo(url, tmpPath));
      tmpPaths.push(tmpPath);
      downloaded++;
      await progress(`Downloaded ${downloaded}/${totalVideos}...`);
    } catch {
      failed++;
    }
  }

  if (tmpPaths.length === 0) {
    await progress("All downloads failed.");
    return null;
  }

  await progress(failed > 0
    ? `Downloaded ${downloaded}/${totalVideos} (${failed} failed). Combining...`
    : `All ${downloaded} downloaded. Combining...`);

  const ts = Date.now();
  const safeName = chatName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  const time = new Date(ts).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const rawPath = join(getOutputDir(), `wa-digest-${ts}-raw.mp4`);
  const outputPath = join(getOutputDir(), `${safeName}-${time}.mp4`);

  try {
    if (tmpPaths.length === 1) {
      await progress("Compressing for WhatsApp...");
      await compressForWhatsApp(tmpPaths[0], outputPath);
    } else {
      await inOutputDir(() => combineVideos(tmpPaths, rawPath, 3));
      await progress("Compressing for WhatsApp...");
      await compressForWhatsApp(rawPath, outputPath);
      try { unlinkSync(rawPath); } catch {}
    }

    const sizeMB = +(statSync(outputPath).size / (1024 * 1024)).toFixed(1);
    const fileName = outputPath.split("/").pop();

    return { file: fileName, sizeMB, downloaded, failed };
  } finally {
    // Clean up intermediate files, keep the final output
    for (const p of [...tmpPaths, rawPath]) {
      try { unlinkSync(p); } catch {}
    }
  }
}
