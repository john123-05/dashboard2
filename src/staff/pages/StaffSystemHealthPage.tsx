export default function SystemHealthPage() {
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2>System Health</h2>
        <p className="note">Geplante Seite für Monitoring, Uptime und Integrations-Checks.</p>
      </div>

      <div className="card coming-soon-card">
        <h3>Health Overview</h3>
        <ul className="help-list">
          <li>API/Edge Function Status</li>
          <li>Supabase Realtime und Database Health</li>
          <li>Storage Ingestion Queue</li>
          <li>Webhook-/Sync-Status (Support, Leads)</li>
        </ul>
        <span className="coming-soon-pill">Coming Soon</span>
      </div>
    </div>
  );
}
