"use client";

import { useState, useEffect } from "react";

export default function GroupsPage() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchGroups();
  }, []);

  async function fetchGroups() {
    try {
      const res = await fetch("/api/groups");
      if (!res.ok) throw new Error("Failed to load groups");
      const data = await res.json();
      setGroups(data.groups || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <p>Loading groups...</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;

  return (
    <div>
      <h1>Groups</h1>
      <p>{groups.length} groups found on the WhatsApp transport.</p>

      <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
            <th style={{ padding: 12 }}>Name</th>
            <th style={{ padding: 12 }}>Members</th>
            <th style={{ padding: 12 }}>JID</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 12 }}>{g.name}</td>
              <td style={{ padding: 12 }}>{g.memberCount || "—"}</td>
              <td style={{ padding: 12, fontSize: 12, color: "#666" }}>{g.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
