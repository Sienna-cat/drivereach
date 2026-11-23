import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInitialState } from './data.mjs';

export function createRepository(path = ':memory:') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, type TEXT, occurred_at TEXT, lead_id TEXT, payload TEXT);
    CREATE TABLE IF NOT EXISTS callbacks (id TEXT PRIMARY KEY, lead_id TEXT, agreed_at TEXT, status TEXT);
    CREATE TABLE IF NOT EXISTS call_tasks (id TEXT PRIMARY KEY, lead_id TEXT, status TEXT, channel TEXT);`);
  function load() { return JSON.parse(db.prepare('SELECT value FROM snapshots WHERE id=1').get()?.value || 'null'); }
  function save(state) {
    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO snapshots VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(state));
      db.exec('DELETE FROM events; DELETE FROM callbacks; DELETE FROM call_tasks;');
      const e = db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?)');
      for (const event of state.events) e.run(event.id, event.type, event.occurredAt, event.payload?.leadId || null, JSON.stringify(event.payload));
      const c = db.prepare('INSERT INTO callbacks VALUES (?, ?, ?, ?)');
      for (const row of state.callbacks) c.run(row.id, row.leadId, row.agreedAt, row.status);
      const t = db.prepare('INSERT INTO call_tasks VALUES (?, ?, ?, ?)');
      for (const row of state.callTasks) t.run(row.id, row.leadId, row.status, row.channel);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  if (!load()) save(createInitialState());
  function metrics() {
    const state = load();
    const counts = db.prepare('SELECT status, COUNT(*) AS count FROM call_tasks GROUP BY status').all();
    return { counts, totalLeads: state.leads.length,
      connectedLeads: new Set(state.conversations.map(c => c.leadId)).size,
      suppressedLeads: state.leads.filter(l => l.status === 'suppressed').length,
      handoffAccepted: state.handoffs.filter(h => h.status === 'accepted').length,
      scheduledCallbacks: db.prepare("SELECT COUNT(*) AS count FROM callbacks WHERE status='scheduled'").get().count,
      eventCounts: db.prepare('SELECT type, COUNT(*) AS count FROM events GROUP BY type ORDER BY count DESC').all(),
      // ISO timestamps are normalized through SQLite datetime rather than lexical comparison.
      overdueCallbacks: db.prepare("SELECT id, lead_id, agreed_at FROM callbacks WHERE status='scheduled' AND datetime(agreed_at)<datetime(?)").all('2026-11-19T03:08:00+08:00'),
    };
  }
  return { load, save, metrics, close: () => db.close() };
}
