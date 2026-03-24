"use client";

import { useState, useEffect } from "react";

export default function ScheduledPage() {
  const [scheduled, setScheduled] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchScheduled();
  }, []);

  async function fetchScheduled() {
    try {
      const res = await fetch("/api/scheduled");
      if (!res.ok) throw new Error("Failed to load scheduled sends");
      const data = await res.json();
      setScheduled(data.scheduled || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(id) {
    if (!confirm("Cancel this scheduled message?")) return;
    try {
      await fetch(`/api/scheduled/${id}`, { method: "DELETE" });
      fetchScheduled();
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <p>Loading scheduled messages...</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;

  return (
    <div>
      <h1>Scheduled Messages</h1>

      {scheduled.length === 0 ? (
        <p>No pending scheduled messages.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
              <th style={{ padding: 12 }}>ID</th>
              <th style={{ padding: 12 }}>Chat</th>
              <th style={{ padding: 12 }}>Message</th>
              <th style={{ padding: 12 }}>Scheduled At</th>
              <th style={{ padding: 12 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {scheduled.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: 12 }}>{s.id}</td>
                <td style={{ padding: 12 }}>{s.chatName || s.jid}</td>
                <td style={{ padding: 12 }}>{s.content?.slice(0, 80)}</td>
                <td style={{ padding: 12 }}>{s.scheduledAt}</td>
                <td style={{ padding: 12 }}>
                  <button
                    onClick={() => handleCancel(s.id)}
                    style={{ padding: "4px 12px", cursor: "pointer", color: "red", border: "1px solid red", borderRadius: 4, background: "transparent" }}
                  >
                    Cancel
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
