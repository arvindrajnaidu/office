import { NextResponse } from "next/server";
import { getClient } from "@/lib/whatsapp-client.js";

export async function GET() {
  try {
    const client = getClient();
    const groups = await client.getGroups();
    return NextResponse.json({ groups });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
