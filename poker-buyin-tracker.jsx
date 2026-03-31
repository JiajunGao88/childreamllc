import { useState, useEffect, useCallback, useRef } from "react";

const CHIP_VALUES = [5, 25, 100, 1000, 5000];
const AUTH_USER = "sjl";
const AUTH_PASS = "8888";

// Storage helpers
const saveData = async (key, value) => {
  try { await window.storage.set(key, JSON.stringify(value)); } catch (e) { console.error(e); }
};
const loadData = async (key) => {
  try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : null; } catch (e) { return null; }
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const fmt = (n) => {
  if (n === 0) return "0";
  return (n > 0 ? "+" : "") + n.toLocaleString();
};

const fmtTime = (iso) => new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
const fmtDate = (iso) => new Date(iso).toLocaleString("zh-CN");

// Chip component
function Chip({ value, count, onClick }) {
  const colors = {
    5: { bg: "#1a4a3c", border: "#2ecc71", text: "#2ecc71" },
    25: { bg: "#1a3a6b", border: "#3498db", text: "#3498db" },
    100: { bg: "#6b1a1a", border: "#e74c3c", text: "#e74c3c" },
    1000: { bg: "#4a1a6b", border: "#9b59b6", text: "#9b59b6" },
    5000: { bg: "#6b5a1a", border: "#c8b568", text: "#c8b568" },
  };
  const c = colors[value] || colors[100];
  return (
    <div onClick={onClick} style={{
      width: 48, height: 48, borderRadius: "50%",
      background: `radial-gradient(circle at 35% 35%, ${c.bg}, #0a0a0a)`,
      border: `3px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center",
      cursor: onClick ? "pointer" : "default", position: "relative",
      boxShadow: `0 2px 8px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.1)`,
      transition: "transform 0.15s, box-shadow 0.15s", userSelect: "none",
    }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.transform = "scale(1.15)"; } }}
      onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      <span style={{ color: c.text, fontSize: value >= 1000 ? 10 : 12, fontWeight: 800, fontFamily: "'Oswald', sans-serif" }}>
        {value >= 1000 ? (value / 1000 + "K") : value}
      </span>
      {count > 0 && (
        <span style={{
          position: "absolute", top: -6, right: -6, background: "#e74c3c",
          color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 10,
          padding: "1px 5px", minWidth: 16, textAlign: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
        }}>{count}</span>
      )}
    </div>
  );
}

// Settlement calculator
function calcSettlement(playersData) {
  const winners = playersData.filter(r => r.net > 0).sort((a, b) => b.net - a.net);
  const losers = playersData.filter(r => r.net < 0).sort((a, b) => a.net - b.net);
  const transfers = [];
  let wi = 0, li = 0;
  const wR = winners.map(w => w.net);
  const lR = losers.map(l => -l.net);
  while (wi < winners.length && li < losers.length) {
    const amt = Math.min(wR[wi], lR[li]);
    if (amt > 0) transfers.push({ from: losers[li].name, to: winners[wi].name, amount: amt });
    wR[wi] -= amt; lR[li] -= amt;
    if (wR[wi] <= 0) wi++;
    if (lR[li] <= 0) li++;
  }
  return transfers;
}

// ======================== MAIN APP ========================
export default function PokerBuyInTracker() {
  // Auth
  const [loggedIn, setLoggedIn] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");

  // App state
  const [session, setSession] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [players, setPlayers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [view, setView] = useState("home"); // home | session | detail
  const [detailSession, setDetailSession] = useState(null);

  // UI state
  const [newPlayerName, setNewPlayerName] = useState("");
  const [chipCounts, setChipCounts] = useState({});
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [showBuyIn, setShowBuyIn] = useState(false);
  const [showCashOut, setShowCashOut] = useState(false);
  const [buyInMode, setBuyInMode] = useState("quick");
  const [cashOutMode, setCashOutMode] = useState("quick");
  const [quickAmount, setQuickAmount] = useState("");
  const [cashOutAmount, setCashOutAmount] = useState("");
  const [cashOutChipCounts, setCashOutChipCounts] = useState({});
  const [defaultBuyIn, setDefaultBuyIn] = useState(500);
  const [newDefaultBuyIn, setNewDefaultBuyIn] = useState("500");
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [toast, setToast] = useState(null);
  const [animateCard, setAnimateCard] = useState(null);
  const [sessionName, setSessionName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const loaded = useRef(false);

  // ---- Auth ----
  useEffect(() => {
    (async () => {
      const auth = await loadData("poker-auth");
      if (auth && auth.user === AUTH_USER && auth.loggedIn) {
        setLoggedIn(true);
      }
      setAuthLoading(false);
    })();
  }, []);

  const doLogin = () => {
    if (loginUser === AUTH_USER && loginPass === AUTH_PASS) {
      setLoggedIn(true);
      setLoginError("");
      saveData("poker-auth", { user: AUTH_USER, loggedIn: true });
    } else {
      setLoginError("账号或密码错误");
    }
  };

  const doLogout = () => {
    setLoggedIn(false);
    saveData("poker-auth", null);
  };

  // ---- Data loading ----
  useEffect(() => {
    if (!loggedIn) return;
    (async () => {
      const s = await loadData("poker-sessions");
      const cur = await loadData("poker-current-session");
      const cfg = await loadData("poker-config");
      if (s) setSessions(s);
      if (cfg?.defaultBuyIn) { setDefaultBuyIn(cfg.defaultBuyIn); setNewDefaultBuyIn(String(cfg.defaultBuyIn)); }
      if (cur) {
        setSession(cur.session);
        setPlayers(cur.players || []);
        setTransactions(cur.transactions || []);
        setSessionName(cur.session?.name || "");
        setView("session");
      }
      loaded.current = true;
    })();
  }, [loggedIn]);

  useEffect(() => {
    if (!loaded.current) return;
    if (session) saveData("poker-current-session", { session, players, transactions });
  }, [session, players, transactions]);

  useEffect(() => {
    if (!loaded.current) return;
    saveData("poker-sessions", sessions);
  }, [sessions]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  // ---- Session ----
  const createSession = () => {
    const name = `牌局 ${new Date().toLocaleDateString("zh-CN")}`;
    const s = { id: uid(), date: new Date().toISOString(), name, status: "active" };
    setSession(s);
    setSessionName(name);
    setPlayers([]);
    setTransactions([]);
    setView("session");
    setConfirmEnd(false);
    setShowSettings(false);
    setShowHistory(false);
    showToast("🃏 新牌局已开始！");
  };

  const updateSessionName = (n) => {
    if (!n.trim()) return;
    setSessionName(n);
    setSession(prev => ({ ...prev, name: n }));
    setEditingName(false);
    showToast("牌局名称已更新");
  };

  // ---- Players ----
  const addPlayer = () => {
    if (!newPlayerName.trim()) return;
    if (players.find(p => p.name === newPlayerName.trim())) { showToast("该玩家已存在", "error"); return; }
    const p = { id: uid(), name: newPlayerName.trim(), color: `hsl(${Math.random() * 360}, 60%, 50%)` };
    setPlayers(prev => [...prev, p]);
    setNewPlayerName("");
    showToast(`${p.name} 入座！`);
    setAnimateCard(p.id);
    setTimeout(() => setAnimateCard(null), 600);
  };

  const removePlayer = (pid) => {
    if (transactions.some(t => t.playerId === pid)) { showToast("该玩家已有记录，无法移除", "error"); return; }
    setPlayers(prev => prev.filter(p => p.id !== pid));
    showToast("玩家已移除");
  };

  // ---- Transactions ----
  const doBuyIn = (playerId, amount) => {
    if (amount <= 0) return;
    setTransactions(prev => [...prev, { id: uid(), playerId, type: "buyin", amount, time: new Date().toISOString() }]);
    showToast(`${players.find(x => x.id === playerId)?.name} 买入 ${amount.toLocaleString()}`);
    setShowBuyIn(false); setSelectedPlayer(null); setChipCounts({}); setQuickAmount("");
  };

  const doCashOut = (playerId, amount) => {
    setTransactions(prev => [...prev, { id: uid(), playerId, type: "cashout", amount: Number(amount), time: new Date().toISOString() }]);
    showToast(`${players.find(x => x.id === playerId)?.name} 结算 ${Number(amount).toLocaleString()} 筹码`);
    setShowCashOut(false); setSelectedPlayer(null); setCashOutAmount(""); setCashOutChipCounts({});
  };

  const undoLast = (playerId) => {
    const ptx = transactions.filter(t => t.playerId === playerId);
    if (!ptx.length) return;
    setTransactions(prev => prev.filter(t => t.id !== ptx[ptx.length - 1].id));
    showToast("已撤销上一笔操作", "warn");
  };

  // ---- Stats ----
  const getPlayerStats = useCallback((playerId) => {
    const txs = transactions.filter(t => t.playerId === playerId);
    const totalBuyIn = txs.filter(t => t.type === "buyin").reduce((s, t) => s + t.amount, 0);
    const buyInCount = txs.filter(t => t.type === "buyin").length;
    const cashOut = txs.filter(t => t.type === "cashout").reduce((s, t) => s + t.amount, 0);
    const hasCashedOut = txs.some(t => t.type === "cashout");
    return { totalBuyIn, buyInCount, cashOut, hasCashedOut, profit: hasCashedOut ? cashOut - totalBuyIn : 0 };
  }, [transactions]);

  const totalPot = transactions.filter(t => t.type === "buyin").reduce((s, t) => s + t.amount, 0);
  const totalCashOut = transactions.filter(t => t.type === "cashout").reduce((s, t) => s + t.amount, 0);
  const chipTotal = Object.entries(chipCounts).reduce((s, [v, c]) => s + Number(v) * c, 0);
  const cashOutChipTotal = Object.entries(cashOutChipCounts).reduce((s, [v, c]) => s + Number(v) * c, 0);

  // ---- End session ----
  const endSession = () => {
    const pData = players.map(p => ({ ...p, ...getPlayerStats(p.id) }));
    const pDataNet = pData.map(p => ({ ...p, net: p.cashOut - p.totalBuyIn }));
    const transfers = calcSettlement(pDataNet);
    const ended = {
      ...session, status: "ended", endDate: new Date().toISOString(),
      players: pData, transactions, totalPot, totalCashOut, transfers,
    };
    setSessions(prev => [ended, ...prev]);
    setSession(null); setPlayers([]); setTransactions([]); setView("home"); setConfirmEnd(false);
    saveData("poker-current-session", null);
    showToast("牌局已结束！");
  };

  const deleteSession = (sid) => {
    setSessions(prev => prev.filter(s => s.id !== sid));
    setConfirmDeleteId(null);
    showToast("牌局已删除");
    if (detailSession?.id === sid) { setDetailSession(null); setView("home"); }
  };

  // ---- Buy-in quick amounts ----
  const buyInQuickAmounts = [defaultBuyIn, defaultBuyIn * 2, 10000, 20000, 50000];

  // ========== STYLES ==========
  const S = {
    page: {
      minHeight: "100vh",
      background: "linear-gradient(170deg, #0a0f0a 0%, #0d1a0d 30%, #0a1a12 60%, #050a05 100%)",
      color: "#e8e0d0", fontFamily: "'Noto Sans SC', 'Oswald', sans-serif", position: "relative", overflow: "hidden",
    },
    felt: {
      position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", opacity: 0.6,
      background: `radial-gradient(ellipse at 50% 30%, rgba(30,80,40,0.15) 0%, transparent 60%),
        repeating-conic-gradient(rgba(255,255,255,0.01) 0% 25%, transparent 0% 50%) 0 0 / 4px 4px`,
    },
    container: { position: "relative", zIndex: 1, maxWidth: 520, margin: "0 auto", padding: "0 16px 40px" },
    goldText: {
      background: "linear-gradient(135deg, #c8b568, #f0e6a0, #c8b568)",
      WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
    },
    card: {
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(200,181,104,0.1)",
      borderRadius: 12, padding: "14px 16px", marginBottom: 10,
    },
    btnPrimary: {
      padding: "10px 18px", background: "linear-gradient(135deg, #c8b568, #a0903e)",
      border: "none", borderRadius: 8, color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
    },
    btnGreen: {
      width: "100%", padding: "18px 24px", background: "linear-gradient(135deg, #1a6b3c, #0d4a24)",
      border: "1px solid #2ecc7144", borderRadius: 12, color: "#e8e0d0",
      fontSize: 18, fontWeight: 700, cursor: "pointer", fontFamily: "'Oswald', sans-serif", letterSpacing: 2,
      boxShadow: "0 4px 20px rgba(46,204,113,0.15)", transition: "all 0.3s",
    },
    input: {
      flex: 1, padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(200,181,104,0.15)",
      borderRadius: 8, color: "#e8e0d0", fontSize: 14, outline: "none",
    },
    smallBtn: (bg, border, color) => ({
      padding: "7px 14px", background: bg, border: `1px solid ${border}`,
      borderRadius: 6, color, fontSize: 12, fontWeight: 600, cursor: "pointer",
    }),
    modal: {
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    },
    tag: (profit) => ({
      fontSize: 11, padding: "2px 8px", borderRadius: 20,
      background: profit > 0 ? "rgba(46,204,113,0.15)" : profit < 0 ? "rgba(231,76,60,0.15)" : "rgba(255,255,255,0.05)",
      color: profit > 0 ? "#2ecc71" : profit < 0 ? "#e74c3c" : "#999",
      border: `1px solid ${profit > 0 ? "#2ecc7133" : profit < 0 ? "#e74c3c33" : "#ffffff11"}`,
    }),
  };

  // ==================== RENDER ====================

  // Loading
  if (authLoading) return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={S.felt} /><span style={{ fontSize: 40, animation: "pulse 1.5s infinite" }}>♠</span>
      <style>{`@keyframes pulse { 0%,100% { opacity:0.3; } 50% { opacity:0.8; } } * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
    </div>
  );

  // ===== LOGIN SCREEN =====
  if (!loggedIn) return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
      <div style={S.felt} />
      <div style={{ position: "fixed", top: 20, left: 24, fontSize: 120, opacity: 0.04, fontFamily: "serif" }}>♠</div>
      <div style={{ position: "fixed", bottom: 20, right: 24, fontSize: 120, opacity: 0.04, fontFamily: "serif", color: "#e74c3c" }}>♥</div>
      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 360, padding: "0 20px" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 28, opacity: 0.7 }}>♠</span>
            <h1 style={{ fontSize: 28, fontWeight: 900, fontFamily: "'Oswald'", letterSpacing: 4, margin: 0, ...S.goldText }}>POKER LEDGER</h1>
            <span style={{ fontSize: 28, opacity: 0.7, color: "#e74c3c" }}>♥</span>
          </div>
          <p style={{ fontSize: 12, color: "#c8b56888", letterSpacing: 6, fontFamily: "'Oswald'" }}>德州扑克 · 买入记账</p>
        </div>
        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(200,181,104,0.15)",
          borderRadius: 16, padding: "28px 24px",
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#c8b568", textAlign: "center", marginBottom: 20 }}>局头登录</div>
          <input value={loginUser} onChange={e => setLoginUser(e.target.value)} placeholder="账号"
            onKeyDown={e => e.key === "Enter" && doLogin()}
            style={{ ...S.input, width: "100%", marginBottom: 12, boxSizing: "border-box", padding: "12px 16px", fontSize: 15 }} />
          <input value={loginPass} onChange={e => setLoginPass(e.target.value)} placeholder="密码" type="password"
            onKeyDown={e => e.key === "Enter" && doLogin()}
            style={{ ...S.input, width: "100%", marginBottom: 16, boxSizing: "border-box", padding: "12px 16px", fontSize: 15 }} />
          {loginError && <div style={{ color: "#e74c3c", fontSize: 13, textAlign: "center", marginBottom: 12 }}>{loginError}</div>}
          <button onClick={doLogin} style={{ ...S.btnGreen, marginBottom: 0 }}>登 录</button>
        </div>
      </div>
      <style>{`
        @keyframes pulse { 0%,100% { opacity:0.3; } 50% { opacity:0.8; } }
        input::placeholder { color: #555; }
        input:focus { border-color: rgba(200,181,104,0.4) !important; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>
    </div>
  );

  // ===== DETAIL VIEW (history single session) =====
  if (view === "detail" && detailSession) {
    const ds = detailSession;
    const dPlayers = ds.players || [];
    const dTx = ds.transactions || [];
    const dTransfers = ds.transfers || [];
    const dTotalPot = ds.totalPot || 0;
    const dTotalCashOut = ds.totalCashOut || dPlayers.reduce((s, p) => s + (p.cashOut || 0), 0);
    return (
      <div style={S.page}>
        <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
        <div style={S.felt} />
        <div style={S.container}>
          {/* Back button */}
          <button onClick={() => { setView("home"); setDetailSession(null); }} style={{
            background: "none", border: "none", color: "#c8b568", fontSize: 14, cursor: "pointer",
            padding: "20px 0 10px", fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
          }}>← 返回历史牌局</button>

          {/* Title */}
          <div style={{ textAlign: "center", padding: "10px 0 24px" }}>
            <h2 style={{ fontSize: 22, fontWeight: 900, fontFamily: "'Oswald'", letterSpacing: 2, margin: 0, ...S.goldText }}>{ds.name}</h2>
            <div style={{ fontSize: 12, color: "#888", marginTop: 6 }}>
              {fmtDate(ds.date)}{ds.endDate ? ` → ${fmtDate(ds.endDate)}` : ""}
            </div>
          </div>

          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
            {[
              { label: "总买入", value: dTotalPot.toLocaleString(), icon: "💰" },
              { label: "玩家数", value: dPlayers.length, icon: "👥" },
              { label: "总结算", value: dTotalCashOut.toLocaleString(), icon: "🏧" },
            ].map((s, i) => (
              <div key={i} style={{ ...S.card, textAlign: "center", padding: "12px 8px" }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#c8b568", fontFamily: "'Oswald'" }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "#888" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Balance check */}
          <div style={{
            textAlign: "center", fontSize: 13, marginBottom: 16, padding: "8px 12px", borderRadius: 8,
            background: dTotalPot === dTotalCashOut ? "rgba(46,204,113,0.08)" : "rgba(231,76,60,0.08)",
            color: dTotalPot === dTotalCashOut ? "#2ecc71" : "#e74c3c",
          }}>
            {dTotalPot === dTotalCashOut ? "✅ 账目平衡" : `⚠️ 差额 ${Math.abs(dTotalPot - dTotalCashOut).toLocaleString()}`}
          </div>

          {/* Player results */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, color: "#c8b568", fontFamily: "'Oswald'", letterSpacing: 2, marginBottom: 10 }}>🏆 玩家盈亏</h3>
            {[...dPlayers].sort((a, b) => (b.profit || 0) - (a.profit || 0)).map(p => (
              <div key={p.id} style={{ ...S.card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: `linear-gradient(135deg, ${p.color}, ${p.color}88)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 800, color: "#fff", border: "2px solid rgba(255,255,255,0.1)",
                  }}>{p.name[0]}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>买入 {p.buyInCount}次 · 共 {(p.totalBuyIn || 0).toLocaleString()} → 结算 {(p.cashOut || 0).toLocaleString()}</div>
                  </div>
                </div>
                <div style={{
                  padding: "4px 12px", borderRadius: 20, fontSize: 15, fontWeight: 700, fontFamily: "'Oswald'",
                  background: (p.profit || 0) >= 0 ? "rgba(46,204,113,0.15)" : "rgba(231,76,60,0.15)",
                  color: (p.profit || 0) >= 0 ? "#2ecc71" : "#e74c3c",
                }}>{fmt(p.profit || 0)}</div>
              </div>
            ))}
          </div>

          {/* Settlement transfers */}
          {dTransfers.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, color: "#c8b568", fontFamily: "'Oswald'", letterSpacing: 2, marginBottom: 10 }}>💸 转账方案</h3>
              {dTransfers.map((t, i) => (
                <div key={i} style={{
                  ...S.card, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 14,
                }}>
                  <span style={{ color: "#e74c3c", fontWeight: 600 }}>{t.from}</span>
                  <span style={{ color: "#666" }}>→</span>
                  <span style={{
                    fontWeight: 700, color: "#c8b568", fontFamily: "'Oswald'", fontSize: 17,
                    padding: "2px 10px", background: "rgba(200,181,104,0.1)", borderRadius: 6,
                  }}>{t.amount.toLocaleString()}</span>
                  <span style={{ color: "#666" }}>→</span>
                  <span style={{ color: "#2ecc71", fontWeight: 600 }}>{t.to}</span>
                </div>
              ))}
            </div>
          )}

          {/* Transaction log */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, color: "#c8b568", fontFamily: "'Oswald'", letterSpacing: 2, marginBottom: 10 }}>📋 全部交易记录</h3>
            <div style={{ ...S.card, padding: "10px 14px" }}>
              {dTx.length === 0 && <div style={{ color: "#555", fontSize: 13, textAlign: "center", padding: 10 }}>暂无记录</div>}
              {dTx.map((tx, i) => {
                const pName = dPlayers.find(x => x.id === tx.playerId)?.name || "未知";
                return (
                  <div key={tx.id || i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "7px 0", borderBottom: i < dTx.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", fontSize: 13,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: tx.type === "buyin" ? "#2ecc71" : "#e74c3c", flexShrink: 0 }} />
                      <span style={{ color: "#ccc" }}>{pName}</span>
                      <span style={{ color: "#888" }}>{tx.type === "buyin" ? "买入" : "结算"}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontWeight: 600, fontFamily: "'Oswald'", color: tx.type === "buyin" ? "#2ecc71" : "#e74c3c" }}>
                        {tx.type === "buyin" ? "+" : ""}{tx.amount.toLocaleString()}
                      </span>
                      <span style={{ color: "#555", fontSize: 11 }}>{fmtTime(tx.time)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      </div>
    );
  }

  // ===== MAIN LOGGED-IN VIEW =====
  return (
    <div style={S.page}>
      <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
      <div style={S.felt} />
      <div style={{ position: "fixed", top: 20, left: 24, fontSize: 120, opacity: 0.04, fontFamily: "serif" }}>♠</div>
      <div style={{ position: "fixed", bottom: 20, right: 24, fontSize: 120, opacity: 0.04, fontFamily: "serif", color: "#e74c3c" }}>♥</div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 1000,
          padding: "10px 24px", borderRadius: 8,
          background: toast.type === "error" ? "#c0392b" : toast.type === "warn" ? "#d4a017" : "#1a6b3c",
          color: "#fff", fontSize: 14, fontWeight: 600,
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)", animation: "fadeInDown 0.3s ease",
          border: `1px solid ${toast.type === "error" ? "#e74c3c" : toast.type === "warn" ? "#f1c40f" : "#2ecc71"}44`,
        }}>{toast.msg}</div>
      )}

      <div style={S.container}>
        {/* Header */}
        <header style={{ textAlign: "center", padding: "28px 0 16px", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 4 }}>
            <span style={{ fontSize: 24, opacity: 0.7 }}>♠</span>
            <h1 style={{ fontSize: 24, fontWeight: 900, fontFamily: "'Oswald'", letterSpacing: 4, margin: 0, ...S.goldText }}>POKER LEDGER</h1>
            <span style={{ fontSize: 24, opacity: 0.7, color: "#e74c3c" }}>♥</span>
          </div>
          <p style={{ fontSize: 11, color: "#c8b56888", letterSpacing: 6, fontFamily: "'Oswald'", margin: 0 }}>德州扑克 · 买入记账</p>
          <button onClick={doLogout} style={{
            position: "absolute", top: 28, right: 0, background: "none", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 6, padding: "4px 10px", color: "#666", fontSize: 11, cursor: "pointer",
          }}>退出</button>
        </header>

        {/* ===== HOME ===== */}
        {view === "home" && (
          <div>
            <button onClick={createSession} style={{ ...S.btnGreen, marginBottom: 20 }}>🃏 开始新牌局</button>

            {sessions.length > 0 && (
              <div>
                <h3 style={{ fontSize: 14, color: "#c8b568", fontFamily: "'Oswald'", letterSpacing: 2, marginBottom: 12 }}>历史牌局</h3>
                {sessions.map(s => (
                  <div key={s.id} style={{ ...S.card, position: "relative" }}>
                    <div onClick={() => { setDetailSession(s); setView("detail"); }} style={{ cursor: "pointer" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ flex: 1, paddingRight: 30 }}>
                          <div style={{ fontSize: 15, fontWeight: 600 }}>{s.name}</div>
                          <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                            {fmtDate(s.date)} · {s.players?.length || 0}人
                          </div>
                        </div>
                        <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: 10 }}>
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: "#c8b568", fontFamily: "'Oswald'" }}>
                              {(s.totalPot || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: 11, color: "#888" }}>总买入</div>
                          </div>
                          <span style={{ color: "#555", fontSize: 16 }}>›</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                        {s.players?.map(p => (
                          <span key={p.id} style={S.tag(p.profit || 0)}>{p.name} {fmt(p.profit || 0)}</span>
                        ))}
                      </div>
                    </div>
                    {/* Delete button */}
                    {confirmDeleteId === s.id ? (
                      <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
                        <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }} style={{
                          padding: "5px 14px", background: "#c0392b", border: "none", borderRadius: 6,
                          color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
                        }}>确认删除</button>
                        <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }} style={{
                          padding: "5px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 6, color: "#aaa", fontSize: 12, cursor: "pointer",
                        }}>取消</button>
                      </div>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(s.id); }} style={{
                        position: "absolute", top: 12, right: 12, background: "none",
                        border: "none", color: "#555", fontSize: 14, cursor: "pointer", padding: "4px 8px", zIndex: 2,
                      }} title="删除牌局">✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {sessions.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: "#555" }}>
                <div style={{ fontSize: 60, marginBottom: 16 }}>🎰</div>
                <div style={{ fontSize: 14 }}>还没有历史记录</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>开始第一场牌局吧</div>
              </div>
            )}
          </div>
        )}

        {/* ===== SESSION ===== */}
        {view === "session" && session && (
          <div>
            {/* Session info */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "rgba(200,181,104,0.06)", border: "1px solid rgba(200,181,104,0.12)",
              borderRadius: 10, padding: "10px 14px", marginBottom: 16,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "#c8b56888", letterSpacing: 1 }}>当前牌局</div>
                {editingName ? (
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <input value={sessionName} onChange={e => setSessionName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") updateSessionName(sessionName); if (e.key === "Escape") setEditingName(false); }}
                      autoFocus
                      style={{ ...S.input, padding: "4px 8px", fontSize: 14, flex: 1 }} />
                    <button onClick={() => updateSessionName(sessionName)} style={{
                      padding: "4px 10px", background: "#1a6b3c", border: "none", borderRadius: 6,
                      color: "#e8e0d0", fontSize: 12, cursor: "pointer",
                    }}>✓</button>
                  </div>
                ) : (
                  <div onClick={() => setEditingName(true)} style={{ fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {session.name} <span style={{ fontSize: 11, color: "#c8b56866" }}>✎</span>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button onClick={() => setShowSettings(!showSettings)} style={{
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8, padding: "6px 10px", color: "#aaa", fontSize: 12, cursor: "pointer",
                }}>⚙️</button>
                <button onClick={() => setShowHistory(!showHistory)} style={{
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8, padding: "6px 10px", color: "#aaa", fontSize: 12, cursor: "pointer",
                }}>📋</button>
              </div>
            </div>

            {/* Settings */}
            {showSettings && (
              <div style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(200,181,104,0.15)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#c8b568", marginBottom: 10 }}>牌局设置</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <label style={{ fontSize: 13, color: "#aaa", whiteSpace: "nowrap" }}>默认买入额：</label>
                  <input value={newDefaultBuyIn} onChange={e => setNewDefaultBuyIn(e.target.value)}
                    style={{ width: 80, padding: "6px 10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(200,181,104,0.2)", borderRadius: 6, color: "#e8e0d0", fontSize: 14, textAlign: "center" }} />
                  <button onClick={() => {
                    const v = Number(newDefaultBuyIn);
                    if (v > 0) { setDefaultBuyIn(v); saveData("poker-config", { defaultBuyIn: v }); showToast(`默认买入设为 ${v}`); }
                  }} style={{ padding: "6px 14px", background: "#1a6b3c", border: "1px solid #2ecc7144", borderRadius: 6, color: "#e8e0d0", fontSize: 12, cursor: "pointer" }}>确认</button>
                </div>
              </div>
            )}

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
              {[
                { label: "总买入", value: totalPot.toLocaleString(), icon: "💰" },
                { label: "玩家数", value: players.length, icon: "👥" },
                { label: "已结算", value: totalCashOut.toLocaleString(), icon: "🏧" },
              ].map((s, i) => (
                <div key={i} style={{ ...S.card, textAlign: "center", padding: "12px 10px" }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#c8b568", fontFamily: "'Oswald'" }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Add player */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addPlayer()} placeholder="输入玩家名..."
                style={S.input} />
              <button onClick={addPlayer} style={S.btnPrimary}>+ 入座</button>
            </div>

            {/* Players */}
            {players.map(player => {
              const stats = getPlayerStats(player.id);
              return (
                <div key={player.id} style={{
                  ...S.card, border: `1px solid ${stats.hasCashedOut ? "rgba(46,204,113,0.2)" : "rgba(200,181,104,0.1)"}`,
                  animation: animateCard === player.id ? "slideIn 0.5s ease" : "none",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: "50%",
                        background: `linear-gradient(135deg, ${player.color}, ${player.color}88)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, fontWeight: 800, color: "#fff", border: "2px solid rgba(255,255,255,0.1)",
                      }}>{player.name[0]}</div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{player.name}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>买入 {stats.buyInCount} 次 · 共 {stats.totalBuyIn.toLocaleString()}</div>
                      </div>
                    </div>
                    {stats.hasCashedOut ? (
                      <div style={{
                        padding: "4px 10px", borderRadius: 20, fontSize: 13, fontWeight: 700, fontFamily: "'Oswald'",
                        background: stats.profit >= 0 ? "rgba(46,204,113,0.15)" : "rgba(231,76,60,0.15)",
                        color: stats.profit >= 0 ? "#2ecc71" : "#e74c3c",
                      }}>{fmt(stats.profit)}</div>
                    ) : (
                      <div style={{
                        padding: "4px 10px", borderRadius: 20, fontSize: 11,
                        background: "rgba(200,181,104,0.1)", color: "#c8b568",
                      }}>进行中</div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {!stats.hasCashedOut && (
                      <>
                        <button onClick={() => doBuyIn(player.id, defaultBuyIn)}
                          style={S.smallBtn("rgba(26,107,60,0.4)", "#2ecc7133", "#2ecc71")}>
                          +{defaultBuyIn.toLocaleString()} 买入
                        </button>
                        <button onClick={() => { setSelectedPlayer(player.id); setShowBuyIn(true); setBuyInMode("quick"); setQuickAmount(""); setChipCounts({}); }}
                          style={S.smallBtn("rgba(200,181,104,0.1)", "rgba(200,181,104,0.15)", "#c8b568")}>
                          自定义买入
                        </button>
                        <button onClick={() => { setSelectedPlayer(player.id); setShowCashOut(true); setCashOutMode("quick"); setCashOutAmount(""); setCashOutChipCounts({}); }}
                          style={S.smallBtn("rgba(231,76,60,0.15)", "#e74c3c33", "#e74c3c")}>
                          💰 结算
                        </button>
                      </>
                    )}
                    {stats.buyInCount > 0 && (
                      <button onClick={() => undoLast(player.id)} style={S.smallBtn("rgba(255,255,255,0.04)", "rgba(255,255,255,0.08)", "#888")}>
                        ↩ 撤销
                      </button>
                    )}
                    {stats.buyInCount === 0 && (
                      <button onClick={() => removePlayer(player.id)} style={S.smallBtn("rgba(255,255,255,0.04)", "rgba(255,255,255,0.08)", "#666")}>
                        ✕ 移除
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Transaction history */}
            {showHistory && transactions.length > 0 && (
              <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(200,181,104,0.1)", borderRadius: 10, padding: 16, marginTop: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#c8b568", marginBottom: 10 }}>交易记录</div>
                {[...transactions].reverse().map(tx => {
                  const p = players.find(x => x.id === tx.playerId);
                  return (
                    <div key={tx.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 12,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: tx.type === "buyin" ? "#2ecc71" : "#e74c3c" }} />
                        <span style={{ color: "#ccc" }}>{p?.name}</span>
                        <span style={{ color: "#888" }}>{tx.type === "buyin" ? "买入" : "结算"}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontWeight: 600, fontFamily: "'Oswald'", color: tx.type === "buyin" ? "#2ecc71" : "#e74c3c" }}>
                          {tx.type === "buyin" ? "+" : ""}{tx.amount.toLocaleString()}
                        </span>
                        <span style={{ color: "#555", fontSize: 10 }}>{fmtTime(tx.time)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Settlement */}
            {players.length > 0 && players.every(p => getPlayerStats(p.id).hasCashedOut) && (() => {
              const pData = players.map(p => ({ ...p, ...getPlayerStats(p.id), net: getPlayerStats(p.id).cashOut - getPlayerStats(p.id).totalBuyIn }));
              const transfers = calcSettlement(pData);
              return (
                <div style={{
                  background: "linear-gradient(135deg, rgba(200,181,104,0.08), rgba(200,181,104,0.02))",
                  border: "1px solid rgba(200,181,104,0.2)", borderRadius: 12, padding: 18, marginTop: 16,
                }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#c8b568", fontFamily: "'Oswald'", letterSpacing: 2, marginBottom: 14, textAlign: "center" }}>
                    🏆 结算方案
                  </div>
                  <div style={{
                    textAlign: "center", fontSize: 12, marginBottom: 12,
                    color: totalPot === totalCashOut ? "#2ecc71" : "#e74c3c",
                  }}>
                    {totalPot === totalCashOut ? "✅ 账目平衡" : `⚠️ 差额 ${Math.abs(totalPot - totalCashOut).toLocaleString()} (买入: ${totalPot.toLocaleString()}, 结算: ${totalCashOut.toLocaleString()})`}
                  </div>
                  {transfers.length === 0 ? <div style={{ textAlign: "center", color: "#888", fontSize: 13 }}>无需转账</div> :
                    transfers.map((t, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "8px 0", fontSize: 14 }}>
                        <span style={{ color: "#e74c3c", fontWeight: 600 }}>{t.from}</span>
                        <span style={{ color: "#666" }}>→</span>
                        <span style={{ fontWeight: 700, color: "#c8b568", fontFamily: "'Oswald'", fontSize: 16, padding: "2px 10px", background: "rgba(200,181,104,0.1)", borderRadius: 6 }}>
                          {t.amount.toLocaleString()}
                        </span>
                        <span style={{ color: "#666" }}>→</span>
                        <span style={{ color: "#2ecc71", fontWeight: 600 }}>{t.to}</span>
                      </div>
                    ))
                  }
                </div>
              );
            })()}

            {/* End session */}
            <div style={{ marginTop: 24, textAlign: "center" }}>
              {!confirmEnd ? (
                <button onClick={() => setConfirmEnd(true)} style={{
                  padding: "10px 28px", background: "rgba(231,76,60,0.15)",
                  border: "1px solid #e74c3c33", borderRadius: 8,
                  color: "#e74c3c", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>结束牌局</button>
              ) : (
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button onClick={endSession} style={{
                    padding: "10px 24px", background: "#c0392b", border: "none", borderRadius: 8,
                    color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
                  }}>确认结束</button>
                  <button onClick={() => setConfirmEnd(false)} style={{
                    padding: "10px 24px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8, color: "#aaa", fontSize: 13, cursor: "pointer",
                  }}>取消</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===== BUY-IN MODAL ===== */}
      {showBuyIn && selectedPlayer && (
        <div style={S.modal} onClick={e => { if (e.target === e.currentTarget) { setShowBuyIn(false); setSelectedPlayer(null); } }}>
          <div style={{
            width: "100%", maxWidth: 520, background: "linear-gradient(180deg, #1a2a1a, #0d150d)",
            borderTop: "1px solid rgba(200,181,104,0.2)", borderRadius: "20px 20px 0 0",
            padding: "24px 20px 32px", animation: "slideUp 0.3s ease",
          }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#c8b568" }}>
                {players.find(p => p.id === selectedPlayer)?.name} · 买入
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, justifyContent: "center" }}>
              {[{ key: "quick", label: "快捷输入" }, { key: "chip", label: "筹码计数" }].map(m => (
                <button key={m.key} onClick={() => setBuyInMode(m.key)} style={{
                  padding: "6px 18px", borderRadius: 20,
                  background: buyInMode === m.key ? "rgba(200,181,104,0.2)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${buyInMode === m.key ? "rgba(200,181,104,0.3)" : "rgba(255,255,255,0.08)"}`,
                  color: buyInMode === m.key ? "#c8b568" : "#888", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>{m.label}</button>
              ))}
            </div>
            {buyInMode === "quick" ? (
              <div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14, justifyContent: "center" }}>
                  {buyInQuickAmounts.map((v, i) => (
                    <button key={i} onClick={() => setQuickAmount(String(v))} style={{
                      padding: "10px 16px", borderRadius: 8,
                      background: Number(quickAmount) === v ? "rgba(46,204,113,0.2)" : "rgba(255,255,255,0.05)",
                      border: `1px solid ${Number(quickAmount) === v ? "#2ecc7144" : "rgba(255,255,255,0.08)"}`,
                      color: Number(quickAmount) === v ? "#2ecc71" : "#ccc",
                      fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Oswald'",
                    }}>{v.toLocaleString()}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
                  <input value={quickAmount} onChange={e => setQuickAmount(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="自定义金额"
                    style={{ width: 160, padding: "10px 14px", textAlign: "center", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(200,181,104,0.2)", borderRadius: 8, color: "#e8e0d0", fontSize: 18, fontFamily: "'Oswald'", outline: "none" }} />
                </div>
                <button onClick={() => doBuyIn(selectedPlayer, Number(quickAmount))}
                  disabled={!quickAmount || Number(quickAmount) <= 0}
                  style={{
                    width: "100%", marginTop: 16, padding: "14px",
                    background: quickAmount && Number(quickAmount) > 0 ? "linear-gradient(135deg, #1a6b3c, #0d4a24)" : "rgba(255,255,255,0.04)",
                    border: "1px solid #2ecc7133", borderRadius: 10,
                    color: quickAmount && Number(quickAmount) > 0 ? "#e8e0d0" : "#555",
                    fontSize: 16, fontWeight: 700, cursor: quickAmount ? "pointer" : "default", fontFamily: "'Oswald'", letterSpacing: 1,
                  }}>确认买入 {quickAmount ? Number(quickAmount).toLocaleString() : ""}</button>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 16 }}>
                  {CHIP_VALUES.map(v => (
                    <div key={v} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <Chip value={v} count={chipCounts[v] || 0} onClick={() => setChipCounts(p => ({ ...p, [v]: (p[v] || 0) + 1 }))} />
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <button onClick={() => setChipCounts(p => ({ ...p, [v]: Math.max(0, (p[v] || 0) - 1) }))}
                          style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#999", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>-</button>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#ccc", minWidth: 20, textAlign: "center" }}>{chipCounts[v] || 0}</span>
                        <button onClick={() => setChipCounts(p => ({ ...p, [v]: (p[v] || 0) + 1 }))}
                          style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#999", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ textAlign: "center", fontSize: 20, fontWeight: 700, color: "#c8b568", fontFamily: "'Oswald'", marginBottom: 12 }}>
                  合计：{chipTotal.toLocaleString()}
                </div>
                <button onClick={() => doBuyIn(selectedPlayer, chipTotal)} disabled={chipTotal <= 0}
                  style={{
                    width: "100%", padding: "14px",
                    background: chipTotal > 0 ? "linear-gradient(135deg, #1a6b3c, #0d4a24)" : "rgba(255,255,255,0.04)",
                    border: "1px solid #2ecc7133", borderRadius: 10,
                    color: chipTotal > 0 ? "#e8e0d0" : "#555",
                    fontSize: 16, fontWeight: 700, cursor: chipTotal > 0 ? "pointer" : "default", fontFamily: "'Oswald'", letterSpacing: 1,
                  }}>确认买入 {chipTotal > 0 ? chipTotal.toLocaleString() : ""}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== CASH OUT MODAL ===== */}
      {showCashOut && selectedPlayer && (
        <div style={S.modal} onClick={e => { if (e.target === e.currentTarget) { setShowCashOut(false); setSelectedPlayer(null); } }}>
          <div style={{
            width: "100%", maxWidth: 520, background: "linear-gradient(180deg, #2a1a1a, #150d0d)",
            borderTop: "1px solid rgba(231,76,60,0.3)", borderRadius: "20px 20px 0 0",
            padding: "24px 20px 32px", animation: "slideUp 0.3s ease",
          }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#e74c3c" }}>
                💰 {players.find(p => p.id === selectedPlayer)?.name} · 结算
              </div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                总买入：{getPlayerStats(selectedPlayer).totalBuyIn.toLocaleString()}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, justifyContent: "center" }}>
              {[{ key: "quick", label: "快捷输入" }, { key: "chip", label: "筹码计数" }].map(m => (
                <button key={m.key} onClick={() => setCashOutMode(m.key)} style={{
                  padding: "6px 18px", borderRadius: 20,
                  background: cashOutMode === m.key ? "rgba(231,76,60,0.2)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${cashOutMode === m.key ? "rgba(231,76,60,0.3)" : "rgba(255,255,255,0.08)"}`,
                  color: cashOutMode === m.key ? "#e74c3c" : "#888", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>{m.label}</button>
              ))}
            </div>
            {cashOutMode === "quick" ? (
              <div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14, justifyContent: "center" }}>
                  {[0, 100, 200, 300, 500, 1000, 1500, 2000].map(v => (
                    <button key={v} onClick={() => setCashOutAmount(String(v))} style={{
                      padding: "10px 16px", borderRadius: 8,
                      background: Number(cashOutAmount) === v && cashOutAmount !== "" ? "rgba(231,76,60,0.2)" : "rgba(255,255,255,0.05)",
                      border: `1px solid ${Number(cashOutAmount) === v && cashOutAmount !== "" ? "#e74c3c44" : "rgba(255,255,255,0.08)"}`,
                      color: Number(cashOutAmount) === v && cashOutAmount !== "" ? "#e74c3c" : "#ccc",
                      fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Oswald'",
                    }}>{v === 0 ? "清零" : v.toLocaleString()}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
                  <input value={cashOutAmount} onChange={e => setCashOutAmount(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="输入剩余筹码数"
                    style={{ width: 160, padding: "10px 14px", textAlign: "center", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(231,76,60,0.2)", borderRadius: 8, color: "#e8e0d0", fontSize: 18, fontFamily: "'Oswald'", outline: "none" }} />
                </div>
                {cashOutAmount !== "" && (
                  <div style={{ textAlign: "center", marginTop: 10, fontSize: 13 }}>
                    <span style={{ color: "#888" }}>盈亏：</span>
                    <span style={{ fontWeight: 700, fontSize: 16, fontFamily: "'Oswald'", color: Number(cashOutAmount) - getPlayerStats(selectedPlayer).totalBuyIn >= 0 ? "#2ecc71" : "#e74c3c" }}>
                      {fmt(Number(cashOutAmount) - getPlayerStats(selectedPlayer).totalBuyIn)}
                    </span>
                  </div>
                )}
                <button onClick={() => { if (cashOutAmount !== "" && Number(cashOutAmount) >= 0) doCashOut(selectedPlayer, Number(cashOutAmount)); }}
                  disabled={cashOutAmount === ""} style={{
                    width: "100%", marginTop: 16, padding: "14px",
                    background: cashOutAmount !== "" ? "linear-gradient(135deg, #a93226, #6b1a1a)" : "rgba(255,255,255,0.04)",
                    border: "1px solid #e74c3c33", borderRadius: 10,
                    color: cashOutAmount !== "" ? "#e8e0d0" : "#555",
                    fontSize: 16, fontWeight: 700, cursor: cashOutAmount !== "" ? "pointer" : "default", fontFamily: "'Oswald'", letterSpacing: 1,
                  }}>确认结算 {cashOutAmount !== "" ? Number(cashOutAmount).toLocaleString() : ""}</button>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 16 }}>
                  {CHIP_VALUES.map(v => (
                    <div key={v} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <Chip value={v} count={cashOutChipCounts[v] || 0} onClick={() => setCashOutChipCounts(p => ({ ...p, [v]: (p[v] || 0) + 1 }))} />
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <button onClick={() => setCashOutChipCounts(p => ({ ...p, [v]: Math.max(0, (p[v] || 0) - 1) }))}
                          style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#999", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>-</button>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#ccc", minWidth: 20, textAlign: "center" }}>{cashOutChipCounts[v] || 0}</span>
                        <button onClick={() => setCashOutChipCounts(p => ({ ...p, [v]: (p[v] || 0) + 1 }))}
                          style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#999", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ textAlign: "center", fontSize: 20, fontWeight: 700, color: "#e74c3c", fontFamily: "'Oswald'", marginBottom: 6 }}>
                  合计：{cashOutChipTotal.toLocaleString()}
                </div>
                {cashOutChipTotal > 0 && (
                  <div style={{ textAlign: "center", marginBottom: 12, fontSize: 13 }}>
                    <span style={{ color: "#888" }}>盈亏：</span>
                    <span style={{ fontWeight: 700, fontSize: 16, fontFamily: "'Oswald'", color: cashOutChipTotal - getPlayerStats(selectedPlayer).totalBuyIn >= 0 ? "#2ecc71" : "#e74c3c" }}>
                      {fmt(cashOutChipTotal - getPlayerStats(selectedPlayer).totalBuyIn)}
                    </span>
                  </div>
                )}
                <button onClick={() => { if (cashOutChipTotal >= 0) doCashOut(selectedPlayer, cashOutChipTotal); }}
                  disabled={cashOutChipTotal <= 0 && Object.values(cashOutChipCounts).every(v => v === 0)}
                  style={{
                    width: "100%", padding: "14px",
                    background: cashOutChipTotal > 0 ? "linear-gradient(135deg, #a93226, #6b1a1a)" : "rgba(255,255,255,0.04)",
                    border: "1px solid #e74c3c33", borderRadius: 10,
                    color: cashOutChipTotal > 0 ? "#e8e0d0" : "#555",
                    fontSize: 16, fontWeight: 700, cursor: cashOutChipTotal > 0 ? "pointer" : "default", fontFamily: "'Oswald'", letterSpacing: 1,
                  }}>确认结算 {cashOutChipTotal > 0 ? cashOutChipTotal.toLocaleString() : ""}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes fadeInDown { from { opacity: 0; transform: translate(-50%, -20px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:0.3; } 50% { opacity:0.8; } }
        input::placeholder { color: #555; }
        input:focus { border-color: rgba(200,181,104,0.4) !important; }
        button:active { transform: scale(0.97); }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
      `}</style>
    </div>
  );
}
