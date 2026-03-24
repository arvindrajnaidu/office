"use client";

import { useState, useEffect } from "react";

export default function PersonasPage() {
  const [personas, setPersonas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPersonas();
  }, []);

  async function fetchPersonas() {
    try {
      const res = await fetch("/api/personas");
      if (!res.ok) throw new Error("Failed to load personas");
      const data = await res.json();
      setPersonas(data.personas || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(jid) {
    if (!confirm("Deactivate this persona?")) return;
    try {
      await fetch(`/api/personas/${encodeURIComponent(jid)}`, { method: "DELETE" });
      fetchPersonas();
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <p>Loading personas...</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;

  return (
    <div>
      <h1>Personas</h1>
      <p>Manage bot personas for groups and DM contacts.</p>

      {personas.length === 0 ? (
        <p>No active personas. Use the self-chat to activate groups.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
              <th style={{ padding: 12 }}>Name</th>
              <th style={{ padding: 12 }}>Type</th>
              <th style={{ padding: 12 }}>JID</th>
              <th style={{ padding: 12 }}>Persona</th>
              <th style={{ padding: 12 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {personas.map((p) => (
              <tr key={p.jid} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: 12 }}>{p.groupName}</td>
                <td style={{ padding: 12 }}>{p.type}</td>
                <td style={{ padding: 12, fontSize: 12, color: "#666" }}>{p.jid}</td>
                <td style={{ padding: 12, fontSize: 13 }}>{p.personaSummary || "—"}</td>
                <td style={{ padding: 12 }}>
                  <button
                    onClick={() => handleDelete(p.jid)}
                    style={{ padding: "4px 12px", cursor: "pointer", color: "red", border: "1px solid red", borderRadius: 4, background: "transparent" }}
                  >
                    Deactivate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
