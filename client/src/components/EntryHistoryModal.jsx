import React, { useState, useEffect } from 'react';
import { X, Clock, User, ChevronDown, ChevronUp, ArrowRight, Pencil, Plus, RefreshCw } from 'lucide-react';
import api from '../api';

/**
 * EntryHistoryModal
 * Props:
 *   entry     — { id, type }
 *   userRole  — 'FIRM' | 'AGENT' | 'ADMIN'
 *   onClose   — callback
 */

// ── Normalise values for comparison (mirrors server logic) ─────────────────────
// Prevents old DB logs (before the server fix) from showing as real changes.
function normalise(raw) {
  const s = (raw ?? '').toString().trim();
  if (s !== '' && !isNaN(Number(s))) return String(parseFloat(s));
  // DD/MM/YYYY → DD/MM/YY
  const m = s.match(/^(\d{2}\/\d{2}\/)20(\d{2})$/);
  if (m) return m[1] + m[2];
  return s;
}

function isRealChange(c) {
  return normalise(c.oldValue) !== normalise(c.newValue);
}

// ── Merge Product Added + Product Removed pairs → Product Changed ─────────────
function mergeProductSwaps(changes) {
  const added   = changes.filter(c => c.fieldName === 'Product Added');
  const removed = changes.filter(c => c.fieldName === 'Product Removed');
  const rest    = changes.filter(c => c.fieldName !== 'Product Added' && c.fieldName !== 'Product Removed');

  const merged = [];

  // Pair each removed with an added → "Product Changed"
  // Server stores: Product Removed { oldValue: productName, newValue: null }
  //                Product Added   { oldValue: null,        newValue: productName }
  const maxPairs = Math.min(added.length, removed.length);
  for (let i = 0; i < maxPairs; i++) {
    merged.push({
      ...added[i],
      fieldName: 'Product Changed',
      oldValue:  removed[i].oldValue,   // the product that was replaced
      newValue:  added[i].newValue,     // the product that replaced it
    });
  }
  // Any leftovers (unpaired add/remove) stay as-is
  for (let i = maxPairs; i < added.length;   i++) merged.push(added[i]);
  for (let i = maxPairs; i < removed.length; i++) merged.push(removed[i]);

  return [...rest, ...merged];
}

function groupIntoSessions(logs) {
  if (!logs.length) return [];

  const sessions = [];
  let current = null;

  for (const log of logs) {
    const ts = new Date(log.changedAt).getTime();

    if (
      current &&
      log.changedById === current.changedById &&
      Math.abs(ts - current.latestTs) <= 3000
    ) {
      current.changes.push(log);
      current.latestTs = ts;
    } else {
      current = {
        key: log.id,
        changedAt: log.changedAt,
        changedById: log.changedById,
        changedByName: log.changedByName,
        changedByRole: log.changedByRole,
        latestTs: ts,
        changes: [log],
      };
      sessions.push(current);
    }
  }

  return sessions
    .map(s => ({
      ...s,
      changes: mergeProductSwaps(
        s.changes.filter(c => c.fieldName === 'Entry Created' || isRealChange(c))
      ),
    }))
    .filter(s => s.changes.length > 0);
}


export default function EntryHistoryModal({ entry, userRole, onClose }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [open, setOpen]         = useState({});

  useEffect(() => {
    if (!entry?.id) return;
    setLoading(true);
    setError('');

    const path =
      userRole === 'ADMIN' ? `/admin/entries/${entry.id}/history`
      : userRole === 'AGENT' ? `/agent/entries/${entry.id}/history`
      : `/firm/entries/${entry.id}/history`;

    api.get(path)
      .then(logs => {
        const grouped = groupIntoSessions(logs);
        setSessions(grouped);
        if (grouped.length > 0) setOpen({ [grouped[0].key]: true });
      })
      .catch(err => setError(err.message || 'Failed to load history'))
      .finally(() => setLoading(false));
  }, [entry?.id, userRole]);

  // ── Group logs into "edit sessions" ────────────────────────────────────────
  // Logs within 3 seconds of each other by the same person = same session.
  /*
  function groupIntoSessions(logs) {
    if (!logs.length) return [];

    // logs are already sorted DESC by changedAt from server
    const sessions = [];
    let current = null;

    for (const log of logs) {
      const ts = new Date(log.changedAt).getTime();

      if (
        current &&
        log.changedById === current.changedById &&
        Math.abs(ts - current.latestTs) <= 3000
      ) {
        current.changes.push(log);
        current.latestTs = ts;
      } else {
        current = {
          key: log.id,
          changedAt: log.changedAt,
          changedById: log.changedById,
          changedByName: log.changedByName,
          changedByRole: log.changedByRole,
          latestTs: ts,
          changes: [log],
        };
        sessions.push(current);
      }
    }

    // Post-process each session:
    //   1. Remove rows that are not real changes (old DB artefacts like 10.0000→10)
    //   2. Merge Product Added + Product Removed pairs → Product Changed
    return sessions
      .map(s => ({
        ...s,
        changes: mergeProductSwaps(
          s.changes.filter(c => c.fieldName === 'Entry Created' || isRealChange(c))
        ),
      }))
      // Drop sessions that have no real changes after filtering
      .filter(s => s.changes.length > 0);
  }

  */
  const toggle = (key) => setOpen(prev => ({ ...prev, [key]: !prev[key] }));

  // ── Formatting helpers ──────────────────────────────────────────────────────
  const fmtTime = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  };

  const roleMeta = {
    FIRM:  { label: 'Firm',  bg: '#EFF6FF', color: '#1D4ED8' },
    AGENT: { label: 'Agent', bg: '#FFFBEB', color: '#D97706' },
    ADMIN: { label: 'Admin', bg: '#F5F3FF', color: '#6D28D9' },
  };

  const RoleBadge = ({ role }) => {
    const { label, bg, color } = roleMeta[role] || { label: role, bg: '#F1F5F9', color: '#475569' };
    return (
      <span style={{ background: bg, color, fontSize: 10, fontWeight: 900,
        padding: '2px 7px', borderRadius: 5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </span>
    );
  };

  const isCreation = (s) => s.changes.length === 1 && s.changes[0].fieldName === 'Entry Created';

  // ── Summary line for a session (collapsed state) ────────────────────────────
  const sessionSummary = (s) => {
    if (isCreation(s)) return 'Entry created';
    const fields = s.changes.map(c => c.fieldName);
    if (fields.length === 1) return `Changed: ${fields[0]}`;
    if (fields.length <= 3) return `Changed: ${fields.join(', ')}`;
    return `Changed ${fields.length} fields`;
  };

  const totalChanges = sessions.reduce((n, s) => n + (isCreation(s) ? 0 : 1), 0);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, background: 'rgba(15,23,42,0.45)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 20, boxShadow: '0 25px 60px rgba(0,0,0,0.18)',
          width: '100%', maxWidth: 600, maxHeight: '85vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'slideUp .18s ease',
        }}
      >
        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: '#F1F5F9',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={16} color="#64748B" />
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 15, color: '#0F172A', lineHeight: 1.2 }}>Edit History</div>
              <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                {entry?.type} · #{String(entry?.id || '').slice(-6).toUpperCase()}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none',
            background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#94A3B8' }}>
            <X size={16} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>

          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#94A3B8', fontSize: 13, fontWeight: 600 }}>
              Loading history…
            </div>
          )}

          {error && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#EF4444', fontSize: 13, fontWeight: 600 }}>
              {error}
            </div>
          )}

          {!loading && !error && sessions.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <Clock size={28} color="#E2E8F0" style={{ margin: '0 auto 10px' }} />
              <div style={{ color: '#94A3B8', fontSize: 13, fontWeight: 600 }}>No history for this entry.</div>
              <div style={{ color: '#CBD5E1', fontSize: 12, marginTop: 4 }}>History is recorded from the next edit onwards.</div>
            </div>
          )}

          {sessions.map((session) => {
            const creation = isCreation(session);
            const expanded = !!open[session.key];

            return (
              <div
                key={session.key}
                style={{
                  border: `1.5px solid ${creation ? '#BBF7D0' : '#E2E8F0'}`,
                  borderRadius: 12,
                  background: creation ? '#F0FDF4' : '#FAFAFA',
                  overflow: 'hidden',
                }}
              >
                {/* Session header (always visible) */}
                <button
                  onClick={() => !creation && toggle(session.key)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '11px 14px', border: 'none', background: 'transparent',
                    cursor: creation ? 'default' : 'pointer', textAlign: 'left',
                  }}
                >
                  {/* Icon */}
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: creation ? '#BBF7D0' : '#EFF6FF',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {creation
                      ? <Plus size={13} color="#16A34A" strokeWidth={2.5} />
                      : <Pencil size={12} color="#2563EB" strokeWidth={2.5} />
                    }
                  </div>

                  {/* Who + when */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <User size={11} color="#94A3B8" />
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#0F172A' }}>
                        {session.changedByName}
                      </span>
                      <RoleBadge role={session.changedByRole} />
                    </div>
                    <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                      {fmtTime(session.changedAt)}
                      {!creation && (
                        <span style={{ marginLeft: 8, color: '#64748B' }}>· {sessionSummary(session)}</span>
                      )}
                      {creation && (
                        <span style={{ marginLeft: 8, color: '#16A34A', fontWeight: 700 }}>✦ Entry Created</span>
                      )}
                    </div>
                  </div>

                  {/* Expand toggle (only for edits) */}
                  {!creation && (
                    <div style={{ color: '#CBD5E1', flexShrink: 0 }}>
                      {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </div>
                  )}
                </button>

                {/* Expanded change table */}
                {!creation && expanded && (
                  <div style={{ borderTop: '1px solid #E2E8F0', background: '#fff' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC' }}>
                          <th style={thStyle}>Field</th>
                          <th style={thStyle}>Old Value</th>
                          <th style={{ ...thStyle, width: 20 }}></th>
                          <th style={thStyle}>New Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {session.changes.map((c, i) => {
                          const isSwap = c.fieldName === 'Product Changed';
                          return (
                            <tr key={c.id} style={{ background: isSwap ? '#FFFBEB' : (i % 2 === 0 ? '#fff' : '#FAFAFA') }}>
                              <td style={{ ...tdBold, color: isSwap ? '#B45309' : '#1E293B' }}>
                                {isSwap ? '⇄ Product Changed' : c.fieldName}
                              </td>
                              <td style={tdMuted}>{c.oldValue || <span style={{ color: '#CBD5E1' }}>—</span>}</td>
                              <td style={{ padding: '7px 4px', textAlign: 'center' }}>
                                <ArrowRight size={11} color={isSwap ? '#D97706' : '#CBD5E1'} />
                              </td>
                              <td style={{ ...tdNew, color: isSwap ? '#92400E' : '#0F172A' }}>
                                {c.newValue || <span style={{ color: '#CBD5E1' }}>—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid #F1F5F9',
          background: '#FAFAFA', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 11, color: '#94A3B8' }}>
            {sessions.length > 0
              ? `${sessions.length} session${sessions.length !== 1 ? 's' : ''} · ${totalChanges} edit${totalChanges !== 1 ? 's' : ''}`
              : ''}
            {sessions.length > 0 ? ' · Read-only audit trail' : 'Read-only audit trail'}
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '7px 18px', background: '#0F172A', color: '#fff',
              fontSize: 12, fontWeight: 800, borderRadius: 10, border: 'none',
              cursor: 'pointer', letterSpacing: '0.04em',
            }}
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ── Shared cell styles ──────────────────────────────────────────────────────
const thStyle = {
  padding: '6px 12px', textAlign: 'left',
  fontSize: 10, fontWeight: 800, color: '#94A3B8',
  textTransform: 'uppercase', letterSpacing: '0.07em',
};

const tdBold = {
  padding: '7px 12px', fontWeight: 700, color: '#1E293B',
};

const tdMuted = {
  padding: '7px 12px', color: '#64748B', fontWeight: 500,
};

const tdNew = {
  padding: '7px 12px', fontWeight: 700, color: '#0F172A',
};
