import { NextResponse } from "next/server";
import { getClient } from "@/lib/whatsapp-client.js";

export async function GET(request, { params }) {
  try {
    const { jid } = await params;
    const client = getClient();
    const persona = await client.getPersona(jid);
    return NextResponse.json(persona);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { jid } = await params;
    const body = await request.json();
    const client = getClient();
    const result = await client.setPersona(jid, body.groupName, body.content);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { jid } = await params;
    const client = getClient();
    const ok = await client.deletePersona(jid);
    return NextResponse.json({ ok });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
