export const metadata = {
  title: "WhatsApp Assistant Admin",
  description: "Admin dashboard for WhatsApp AI assistant",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div style={{ display: "flex", minHeight: "100vh" }}>
          <nav style={{
            width: 220,
            background: "#1a1a2e",
            color: "#fff",
            padding: "20px 0",
            flexShrink: 0,
          }}>
            <div style={{ padding: "0 20px 20px", borderBottom: "1px solid #333", marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>WhatsApp Assistant</h2>
            </div>
            <NavLink href="/" label="Dashboard" />
            <NavLink href="/personas" label="Personas" />
            <NavLink href="/groups" label="Groups" />
            <NavLink href="/conversations" label="Conversations" />
            <NavLink href="/scheduled" label="Scheduled" />
            <NavLink href="/settings" label="Settings" />
          </nav>
          <main style={{ flex: 1, padding: 24, background: "#f5f5f5" }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

function NavLink({ href, label }) {
  return (
    <a
      href={href}
      style={{
        display: "block",
        padding: "10px 20px",
        color: "#ccc",
        textDecoration: "none",
        fontSize: 14,
      }}
    >
      {label}
    </a>
  );
}
