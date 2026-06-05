import { useState, useEffect, useRef } from "react";

const RAILWAY_URL = "https://enog-server-production.up.railway.app";

export default function Home() {
  const [convos, setConvos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("chats");
  const [manualMsg, setManualMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState(null);
  const [summarizing, setSummarizing] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    fetchConversations();
    fetchAnalytics();
    const interval = setInterval(fetchConversations, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selected]);

  useEffect(() => {
    setSummary(null);
  }, [selected?.id]);

  async function fetchConversations() {
    try {
      const res = await fetch(`${RAILWAY_URL}/api/conversations`);
      const data = await res.json();
      const validData = Array.isArray(data) ? data.filter(c => c && c.id) : [];
      setConvos(validData);
      if (selected) {
        const updated = validData.find(c => c.id === selected.id);
        if (updated) setSelected(updated);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAnalytics() {
    try {
      const res = await fetch(`${RAILWAY_URL}/api/analytics`);
      const data = await res.json();
      setAnalytics(data);
    } catch (e) {}
  }

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function sendReply() {
    if (!manualMsg.trim() || !selected || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${RAILWAY_URL}/api/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: selected.from, message: manualMsg, convId: selected.id }),
      });
      const data = await res.json();
      if (data.success) {
        setManualMsg("");
        showToast("✅ Message sent!");
        await fetchConversations();
      } else {
        showToast("Failed to send message", "error");
      }
    } catch (e) {
      showToast("Error sending message", "error");
    }
    setSending(false);
  }

  async function updateStatus(convId, status) {
    try {
      await fetch(`${RAILWAY_URL}/api/conversations/${convId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      showToast(`Marked as ${status.replace('_', ' ')}`);
      await fetchConversations();
    } catch (e) {}
  }

  async function toggleAI(convId, paused) {
    try {
      await fetch(`${RAILWAY_URL}/api/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ convId, paused }),
      });
      showToast(paused ? "🤚 AI paused — you're in control!" : "🤖 AI resumed!");
      await fetchConversations();
    } catch (e) {}
  }

  async function getSummary() {
    if (!selected || !selected.messages?.length) return;
    setSummarizing(true);
    try {
      const res = await fetch(`${RAILWAY_URL}/api/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: selected.messages }),
      });
      const data = await res.json();
      setSummary(data.summary);
    } catch (e) {
      setSummary("Could not generate summary");
    }
    setSummarizing(false);
  }

  function isOlderThan24h(lastActive) {
    if (!lastActive) return false;
    return Date.now() - lastActive > 24 * 60 * 60 * 1000;
  }

  const filtered = convos.filter(c =>
    (c.name || c.from || "").toLowerCase().includes(search.toLowerCase())
  );

  const needsReply = convos.filter(c => c.status === "needs_reply").length;
  const unpaid = convos.filter(c => c.status === "unpaid").length;
  const done = convos.filter(c => c.status === "done").length;

  function StatusPill({ status }) {
    const map = {
      needs_reply: { label: "Needs Reply", color: "#dc2626", bg: "#fff1f1" },
      follow_up: { label: "Follow Up", color: "#b45309", bg: "#fffbeb" },
      unpaid: { label: "Unpaid", color: "#7c3aed", bg: "#f5f3ff" },
      done: { label: "Done ✓", color: "#059669", bg: "#ecfdf5" },
    };
    const s = map[status] || map.done;
    return <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 20, background: s.bg, color: s.color, textTransform: "uppercase" }}>{s.label}</span>;
  }

  function formatTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "Georgia, serif", background: "#fdf6ee" }}>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: #d4a96a55; border-radius: 4px; } @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } } textarea:focus, input:focus { outline: none !important; }`}</style>

      {toast && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 9999, padding: "11px 20px", borderRadius: 12, fontWeight: 700, fontSize: 13, color: "#fff", background: toast.type === "error" ? "#991b1b" : "#065f46", boxShadow: "0 8px 32px rgba(0,0,0,0.2)", animation: "fadeUp 0.3s ease" }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#1c0a00,#3b1500,#5a2200)", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 58, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 26 }}>👑</span>
          <div>
            <div style={{ color: "#f0cc8a", fontWeight: 700, fontSize: 16 }}>Enog Braid Extensions</div>
            <div style={{ color: "#d4a96a88", fontSize: 10 }}>Live WhatsApp Dashboard • Auto-refreshes every 10s</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[{ id: "chats", label: "💬" }, { id: "stats", label: "📊" }].map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id === "stats") fetchAnalytics(); }}
              style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: tab === t.id ? "rgba(212,169,106,0.2)" : "transparent", color: tab === t.id ? "#f0cc8a" : "#d4a96a66", fontSize: 18, cursor: "pointer" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "chats" && (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Sidebar */}
          <div style={{ width: 280, background: "#fff", borderRight: "1px solid #ede5da", display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <div style={{ padding: 10, borderBottom: "1px solid #f5ede2" }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search customers..."
                style={{ width: "100%", padding: "7px 12px", borderRadius: 18, border: "1px solid #ede5da", fontSize: 12, background: "#fdf8f3", color: "#3b1500", fontFamily: "Georgia,serif" }} />
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loading && <div style={{ padding: 20, textAlign: "center", color: "#b59a7a", fontSize: 13 }}>Loading...</div>}
              {!loading && filtered.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: "#b59a7a", fontSize: 13 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
                  No conversations yet.<br />Messages appear here automatically!
                </div>
              )}
              {filtered.map(c => (
                <div key={c.id} onClick={() => setSelected(c)}
                  style={{ padding: "11px 12px", borderBottom: "1px solid #f5ede2", cursor: "pointer", background: selected?.id === c.id ? "#fdf3e7" : "#fff", borderLeft: selected?.id === c.id ? "3px solid #d4a96a" : "3px solid transparent" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#1c0a00" }}>{c.name || c.from}</div>
                        {c.aiPaused && <span style={{ fontSize: 9, background: "#fef3c7", color: "#92400e", padding: "1px 5px", borderRadius: 8, fontWeight: 700 }}>AI OFF</span>}
                      </div>
                      <StatusPill status={c.status} />
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 10, color: isOlderThan24h(c.lastActive) ? "#dc2626" : "#b59a7a" }}>
                        {formatTime(c.lastActive)}
                      </div>
                      {c.unread > 0 && <div style={{ width: 18, height: 18, background: "#25d366", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff", fontWeight: 800, marginLeft: "auto", marginTop: 3 }}>{c.unread}</div>}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#b59a7a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.messages?.[c.messages.length - 1]?.text || ""}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: "8px 12px", borderTop: "1px solid #f5ede2", display: "flex", justifyContent: "space-around", background: "#fdf8f3" }}>
              {[{ v: needsReply, l: "Reply", col: "#dc2626" }, { v: unpaid, l: "Unpaid", col: "#7c3aed" }, { v: done, l: "Done", col: "#059669" }].map(s => (
                <div key={s.l} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: s.col }}>{s.v}</div>
                  <div style={{ fontSize: 9, color: "#b59a7a", fontWeight: 700, textTransform: "uppercase" }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Chat window */}
          {!selected ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
              <span style={{ fontSize: 52 }}>👑</span>
              <div style={{ fontWeight: 700, fontSize: 17, color: "#5a2200" }}>Enog Braid Extensions</div>
              <div style={{ fontSize: 13, color: "#b59a7a" }}>Select a conversation to view and reply</div>
              <div style={{ fontSize: 12, color: "#d4a96a" }}>Auto-refreshes every 10 seconds</div>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Chat header */}
              <div style={{ background: "#fff", padding: "10px 16px", borderBottom: "1px solid #ede5da", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, background: "linear-gradient(135deg,#d4a96a,#f0cc8a)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>👩🏾</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#1c0a00" }}>{selected.name || selected.from}</div>
                      <div style={{ fontSize: 11, color: "#b59a7a" }}>{selected.from}</div>
                    </div>
                  </div>
                  {/* AI Takeover toggle */}
                  <button onClick={() => toggleAI(selected.id, !selected.aiPaused)}
                    style={{ padding: "6px 14px", borderRadius: 20, border: "none", background: selected.aiPaused ? "#dcfce7" : "#fef3c7", color: selected.aiPaused ? "#065f46" : "#92400e", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "Georgia,serif" }}>
                    {selected.aiPaused ? "🤖 Resume AI" : "🤚 Take Over"}
                  </button>
                </div>

                {/* 24h warning */}
                {isOlderThan24h(selected.lastActive) && (
                  <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "#dc2626", fontWeight: 600 }}>
                    ⚠️ Last message was over 24 hours ago. Customer must message first before you can reply.
                  </div>
                )}

                {/* AI paused warning */}
                {selected.aiPaused && (
                  <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "#92400e", fontWeight: 600, marginTop: 6 }}>
                    🤚 AI is paused — you are handling this conversation manually
                  </div>
                )}

                {/* Status buttons */}
                <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
                  {["needs_reply", "follow_up", "unpaid", "done"].map(s => (
                    <button key={s} onClick={() => updateStatus(selected.id, s)}
                      style={{ padding: "3px 8px", borderRadius: 8, border: `1px solid ${selected.status === s ? "#d4a96a" : "#ede5da"}`, background: selected.status === s ? "#fdf3e7" : "#fff", fontSize: 10, fontWeight: 600, color: selected.status === s ? "#5a2200" : "#b59a7a", cursor: "pointer", fontFamily: "Georgia,serif" }}>
                      {s.replace("_", " ")}
                    </button>
                  ))}
                  <button onClick={getSummary} disabled={summarizing}
                    style={{ padding: "3px 10px", borderRadius: 8, border: "1px solid #c4b5fd", background: "#f5f3ff", fontSize: 10, fontWeight: 600, color: "#6d28d9", cursor: "pointer", fontFamily: "Georgia,serif" }}>
                    {summarizing ? "..." : "✨ Summarize"}
                  </button>
                </div>

                {/* Summary box */}
                {summary && (
                  <div style={{ marginTop: 8, background: "#f5f3ff", border: "1px solid #c4b5fd", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#4c1d95", lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>✨ Conversation Summary:</div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{summary}</div>
                  </div>
                )}
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 7, background: "#fdf6ee" }}>
                {(!selected.messages || selected.messages.length === 0) && (
                  <div style={{ textAlign: "center", color: "#b59a7a", fontSize: 13, marginTop: 40 }}>No messages yet</div>
                )}
                {selected.messages?.map((m, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: m.from === "customer" ? "flex-start" : "flex-end" }}>
                    <div style={{ maxWidth: "72%", padding: "8px 12px 5px", borderRadius: m.from === "customer" ? "12px 12px 12px 3px" : "12px 12px 3px 12px", background: m.from === "customer" ? "#fff" : "#e7f8d8", fontSize: 13, lineHeight: 1.6, color: "#1c0a00", boxShadow: "0 1px 3px rgba(0,0,0,0.07)", whiteSpace: "pre-wrap" }}>
                      {m.text}
                      <div style={{ fontSize: 9, color: "#b59a7a", textAlign: "right", marginTop: 2 }}>{formatTime(m.time)}{m.from === "business" && " ✓✓"}</div>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Reply input */}
              <div style={{ background: "#fff", borderTop: "1px solid #ede5da", padding: "12px 14px", flexShrink: 0 }}>
                <div style={{ fontSize: 10, color: selected.aiPaused ? "#92400e" : "#b59a7a", marginBottom: 7, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {selected.aiPaused ? "🤚 YOU ARE IN CONTROL — AI is paused" : "💬 Reply manually (AI will also respond unless you take over)"}
                </div>
                <div style={{ display: "flex", gap: 7, alignItems: "flex-end" }}>
                  <textarea value={manualMsg} onChange={e => setManualMsg(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                    placeholder="Type your reply... (Enter to send)"
                    rows={2}
                    style={{ flex: 1, padding: "9px 13px", borderRadius: 12, border: "1px solid #ede5da", fontSize: 13, background: "#fdf8f3", color: "#1c0a00", fontFamily: "Georgia,serif", resize: "none" }} />
                  <button onClick={sendReply} disabled={sending || !manualMsg.trim()}
                    style={{ width: 42, height: 42, background: sending ? "#e5e7eb" : "#25d366", border: "none", borderRadius: "50%", color: "#fff", fontSize: 18, cursor: sending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    ➤
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      {tab === "stats" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1c0a00", marginBottom: 16 }}>📊 Live Analytics</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            {[
              { icon: "💬", label: "Total Chats", value: convos.length, col: "#1c0a00" },
              { icon: "⚡", label: "Need Reply", value: needsReply, col: "#dc2626" },
              { icon: "💸", label: "Unpaid", value: unpaid, col: "#7c3aed" },
              { icon: "✅", label: "Done", value: done, col: "#059669" },
            ].map(s => (
              <div key={s.label} style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #ede5da" }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>{s.icon}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: s.col }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "#b59a7a" }}>{s.label}</div>
              </div>
            ))}
          </div>
          {analytics && (
            <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #ede5da", marginBottom: 12 }}>
              <div style={{ fontWeight: 800, color: "#1c0a00", marginBottom: 12, fontSize: 13 }}>📈 This Week</div>
              {[
                { label: "Total Messages", value: analytics.totalMessages },
                { label: "Unique Customers", value: analytics.uniqueCustomers },
                { label: "Order Intentions", value: analytics.ordersMentioned },
                { label: "Top Products", value: analytics.topProducts },
                { label: "Busiest Day", value: analytics.busiestDay },
                { label: "Busiest Hour", value: analytics.busiestHour },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #fdf6ee", fontSize: 13 }}>
                  <span style={{ color: "#6b4c2a", fontWeight: 600 }}>{s.label}</span>
                  <span style={{ color: "#1c0a00", fontWeight: 700 }}>{s.value || "N/A"}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #ede5da" }}>
            <div style={{ fontWeight: 800, color: "#1c0a00", marginBottom: 10, fontSize: 13 }}>🔗 Quick Links</div>
            <div style={{ fontSize: 13, color: "#5a2200", lineHeight: 2.2 }}>
              <div>📱 Business WhatsApp: <strong>+2348061511729</strong></div>
              <div>📍 Address: <strong>124 Okigwe Road, Owerri</strong></div>
              <div>🌐 <a href="https://enogbeautycastle.bumpa.shop" target="_blank" rel="noreferrer" style={{ color: "#d4a96a" }}>enogbeautycastle.bumpa.shop</a></div>
              <div>📸 <a href="https://instagram.com/enogbeautycastle" target="_blank" rel="noreferrer" style={{ color: "#d4a96a" }}>@enogbeautycastle</a></div>
              <div>📋 <a href="https://wa.me/c/2347034562686" target="_blank" rel="noreferrer" style={{ color: "#d4a96a" }}>View Catalog</a></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
