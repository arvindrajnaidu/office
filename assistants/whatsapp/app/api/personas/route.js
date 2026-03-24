import { NextResponse } from "next/server";
import { getClient } from "@/lib/whatsapp-client.js";

export async function GET() {
  try {
    const client = getClient();
    const personas = await client.getPersonas();
    return NextResponse.json({ personas });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
