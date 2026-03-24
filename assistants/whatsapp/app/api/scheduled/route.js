import { NextResponse } from "next/server";
import { getClient } from "@/lib/whatsapp-client.js";

export async function GET() {
  try {
    const client = getClient();
    const scheduled = await client.getScheduled();
    return NextResponse.json({ scheduled });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
