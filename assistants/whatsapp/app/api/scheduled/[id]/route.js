import { NextResponse } from "next/server";
import { getClient } from "@/lib/whatsapp-client.js";

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const client = getClient();
    const ok = await client.cancelScheduled(parseInt(id));
    return NextResponse.json({ ok });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
