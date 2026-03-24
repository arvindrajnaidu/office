"use client";

import { useState, useEffect } from "react";

export default function SettingsPage() {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    try {
      const res = await fetch("/api/config");
      if (!res.ok) throw new Error("Failed to load config");
      const data = await res.json();
      setConfig(data);
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const form = new FormData(e.target);
      const data = {
        llmProvider: form.get("llmProvider"),
        llmKey: form.get("llmKey"),
        whatsappHost: form.get("whatsappHost"),
        whatsappToken: form.get("whatsappToken"),
      };
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save config");
      setMessage({ type: "success", text: "Settings saved." });
      fetchConfig();
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading settings...</p>;

  return (
    <div>
      <h1>Settings</h1>

      {message && (
        <div style={{
          padding: 12, marginBottom: 16, borderRadius: 4,
          background: message.type === "error" ? "#fee" : "#efe",
          color: message.type === "error" ? "#c00" : "#060",
        }}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} style={{ background: "#fff", padding: 24, borderRadius: 8, maxWidth: 500 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>LLM Provider</label>
          <select name="llmProvider" defaultValue={config.llmProvider || "anthropic"} style={{ width: "100%", padding: 8 }}>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI (GPT)</option>
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>LLM API Key</label>
          <input name="llmKey" type="password" defaultValue={config.llmKey || ""} placeholder="sk-..." style={{ width: "100%", padding: 8, boxSizing: "border-box" }} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>WhatsApp Host URL</label>
          <input name="whatsappHost" type="text" defaultValue={config.whatsappHost || "http://localhost:3100"} style={{ width: "100%", padding: 8, boxSizing: "border-box" }} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>WhatsApp API Token</label>
          <input name="whatsappToken" type="password" defaultValue={config.whatsappToken || ""} placeholder="shared-secret" style={{ width: "100%", padding: 8, boxSizing: "border-box" }} />
        </div>

        <button type="submit" disabled={saving} style={{
          padding: "8px 24px", background: "#1a1a2e", color: "#fff", border: "none",
          borderRadius: 4, cursor: saving ? "wait" : "pointer", fontSize: 14,
        }}>
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </form>
    </div>
  );
}
