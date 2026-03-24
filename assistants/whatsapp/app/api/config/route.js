import { NextResponse } from "next/server";
import { readConfig, writeConfig } from "@/lib/config.js";

export async function GET() {
  try {
    const config = readConfig();
    // Redact sensitive keys for the UI
    const safe = { ...config };
    if (safe.llmKey) safe.llmKey = safe.llmKey.slice(0, 8) + "...";
    return NextResponse.json(safe);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    // Only allow updating known config keys
    const allowed = ["llmProvider", "llmKey", "whatsappHost", "whatsappToken"];
    const update = {};
    for (const key of allowed) {
      if (body[key] !== undefined && !body[key].endsWith("...")) {
        update[key] = body[key];
      }
    }
    writeConfig(update);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
