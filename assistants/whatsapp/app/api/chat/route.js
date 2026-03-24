import { NextResponse } from "next/server";
import { processMessage, processGroupMessage } from "@/lib/brain/conversation.js";
import { WhatsAppClient } from "@/lib/whatsapp-client.js";
import { getWhatsAppHost, getWhatsAppToken } from "@/lib/config.js";

/**
 * POST /api/chat
 *
 * Receives an envelope from core's dispatcher:
 * { type, jid, groupName, persona, senderName, text, history, quotedContext, meta }
 *
 * Returns: { text?, actions? }
 */
export async function POST(request) {
  try {
    const envelope = await request.json();
    const { type, jid, groupName, persona, senderName, text, quotedContext, meta } = envelope;

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const client = new WhatsAppClient(getWhatsAppHost(), getWhatsAppToken());
    const selfJid = meta?.selfJid || jid;

    let reply;

    if (type === "self_chat") {
      reply = await processMessage(text, client, selfJid);
    } else {
      // group or dm
      reply = await processGroupMessage(
        text,
        jid,
        groupName || jid,
        persona || "You are a helpful assistant. Be concise.",
        senderName || "Unknown",
        client,
        selfJid,
        quotedContext || null,
      );
    }

    return NextResponse.json({ text: reply });
  } catch (err) {
    console.error("[/api/chat] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
