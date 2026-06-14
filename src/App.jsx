import { useState, useEffect, useCallback } from "react";

const TEACHER_PASSWORD_HASH_DEFAULT = "5c41f012fdd06347a4fbaa72acf267d26add7b768dad69cc7aea940abcc786de";

async function hashPassword(password) {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}
const CODE_DURATION_MS = 45 * 60 * 1000;

const JSONBIN_MASTER_KEY = "$2a$10$w1eddOdHjGxbra57XkiF1e2HA1wyQpxjX4hAZ7O2qQdNFMihQF38q";
const JSONBIN_ACCESS_KEY = "$2a$10$4fmn1W3us6T5IwbaNI5t8uJjw2Xs/m5hocaKtfaHYLQ..p/U8Cn2a";
const JSONBIN_BIN_NAME = "lesson-access-data";

const DEFAULT_FOLDERS = [
  { id: "excel", name: "Excel", emoji: "📊", url: "" },
  { id: "python", name: "Python", emoji: "🐍", url: "" },
  { id: "html", name: "HTML/CSS", emoji: "🌐", url: "" },
  { id: "databases", name: "Bazy danych", emoji: "🗄️", url: "" },
];

const EMOJI_LIST = ["📊","🐍","🌐","🗄️","🎨","📐","🔬","💻","📝","🧮","🎯","📁","🖥️","⚙️","🔧","📚"];

const DEFAULT_STATE = {
  activeCodes: {},
  folders: DEFAULT_FOLDERS,
  teacherPasswordHash: TEACHER_PASSWORD_HASH_DEFAULT,
};

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    if (i === 3) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(ms) {
  if (ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ─── JSONBin API ──────────────────────────────────────────────────────────────
const JSONBIN_BIN_ID = "6a2e843af5f4af5e29efa2f9";

async function getBinId() {
  return JSONBIN_BIN_ID;
}

async function loadState() {
  try {
    const id = await getBinId();
    if (!id) return DEFAULT_STATE;
    const res = await fetch(`https://api.jsonbin.io/v3/b/${id}/latest`, {
      headers: { "X-Access-Key": JSONBIN_ACCESS_KEY },
    });
    const data = await res.json();
    return { ...DEFAULT_STATE, ...data.record };
  } catch { return DEFAULT_STATE; }
}

async function saveState(state) {
  try {
    const id = await getBinId();
    if (!id) return;
    await fetch(`https://api.jsonbin.io/v3/b/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": JSONBIN_MASTER_KEY,
      },
      body: JSON.stringify(state),
    });
  } catch { console.error("Save failed"); }
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("student");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(true);

  const [folders, setFolders] = useState(DEFAULT_FOLDERS);
  const [activeCodes, setActiveCodes] = useState({});
  const [teacherPasswordHash, setTeacherPasswordHash] = useState(TEACHER_PASSWORD_HASH_DEFAULT);
  const [now, setNow] = useState(Date.now());

  // Student state
  const [studentCode, setStudentCode] = useState("");
  const [studentResult, setStudentResult] = useState(null);

  // Teacher state
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [generatedCode, setGeneratedCode] = useState(null);
  const [editingFolder, setEditingFolder] = useState(null);
  const [saving, setSaving] = useState(false);

  // New folder form
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderUrl, setNewFolderUrl] = useState("");
  const [newFolderEmoji, setNewFolderEmoji] = useState("📁");

  // Change password
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState(null);

  // Load state from JSONBin
  useEffect(() => {
    (async () => {
      setLoading(true);
      const state = await loadState();
      setFolders(state.folders || DEFAULT_FOLDERS);
      setActiveCodes(state.activeCodes || {});
      setTeacherPasswordHash(state.teacherPasswordHash || TEACHER_PASSWORD_HASH_DEFAULT);
      setLoading(false);
    })();
  }, []);

  // Tick every second
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Cleanup expired codes
  useEffect(() => {
    const expired = Object.entries(activeCodes).filter(([, v]) => v.expiresAt < now);
    if (expired.length > 0) {
      const updated = { ...activeCodes };
      expired.forEach(([k]) => delete updated[k]);
      setActiveCodes(updated);
      saveState({ activeCodes: updated, folders, teacherPasswordHash });
    }
  }, [now]);

  const persistState = async (newActiveCodes, newFolders, newPassword) => {
    setSaving(true);
    await saveState({
      activeCodes: newActiveCodes ?? activeCodes,
      folders: newFolders ?? folders,
      teacherPasswordHash: newPassword ?? teacherPasswordHash,
    });
    setSaving(false);
  };

  const handleLogin = async () => {
    const hash = await hashPassword(loginPassword);
    if (hash === teacherPasswordHash) {
      setView("teacher");
      setLoginError("");
      setLoginPassword("");
    } else {
      setLoginError("Nieprawidłowe hasło");
    }
  };

  const generateNewCode = useCallback(async () => {
    if (!selectedFolder) return;
    const code = generateCode();
    const expiresAt = Date.now() + CODE_DURATION_MS;
    const updated = { ...activeCodes, [code]: { folderId: selectedFolder, expiresAt } };
    setActiveCodes(updated);
    setGeneratedCode(code);
    await persistState(updated, null, null);
  }, [selectedFolder, activeCodes, folders, teacherPasswordHash]);

  const revokeCode = useCallback(async (code) => {
    const updated = { ...activeCodes };
    delete updated[code];
    setActiveCodes(updated);
    if (generatedCode === code) setGeneratedCode(null);
    await persistState(updated, null, null);
  }, [activeCodes, generatedCode, folders, teacherPasswordHash]);

  const checkStudentCode = () => {
    const clean = studentCode.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    const entry = activeCodes[clean];
    if (!entry) { setStudentResult("invalid"); return; }
    if (entry.expiresAt < Date.now()) { setStudentResult("expired"); return; }
    const folder = folders.find(f => f.id === entry.folderId);
    setStudentResult({ folder, expiresAt: entry.expiresAt });
  };

  const addFolder = async () => {
    if (!newFolderName.trim() || !newFolderUrl.trim()) return;
    const newFolder = { id: generateId(), name: newFolderName.trim(), emoji: newFolderEmoji, url: newFolderUrl.trim() };
    const updated = [...folders, newFolder];
    setFolders(updated);
    await persistState(null, updated, null);
    setNewFolderName(""); setNewFolderUrl(""); setNewFolderEmoji("📁");
    setShowAddFolder(false);
  };

  const deleteFolder = async (id) => {
    const updated = folders.filter(f => f.id !== id);
    setFolders(updated);
    if (selectedFolder === id) setSelectedFolder(null);
    if (editingFolder === id) setEditingFolder(null);
    await persistState(null, updated, null);
  };

  const updateFolder = (id, changes) => {
    const updated = folders.map(f => f.id === id ? { ...f, ...changes } : f);
    setFolders(updated);
    return updated;
  };

  const saveFolderEdit = async () => {
    await persistState(null, folders, null);
    setEditingFolder(null);
  };

  const handleChangePassword = async () => {
    const currentHash = await hashPassword(currentPassword);
    if (currentHash !== teacherPasswordHash) {
      setPasswordMsg({ type: "error", text: "Aktualne hasło jest nieprawidłowe" });
      return;
    }
    if (newPassword.length < 4) {
      setPasswordMsg({ type: "error", text: "Nowe hasło musi mieć minimum 4 znaki" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "Hasła nie są zgodne" });
      return;
    }
    const newHash = await hashPassword(newPassword);
    setTeacherPasswordHash(newHash);
    await persistState(null, null, newHash);
    setPasswordMsg({ type: "success", text: "Hasło zostało zmienione!" });
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    setTimeout(() => { setShowChangePassword(false); setPasswordMsg(null); }, 1500);
  };

  const activeCodesList = Object.entries(activeCodes)
    .filter(([, v]) => v.expiresAt > now)
    .map(([code, v]) => ({
      code,
      folder: folders.find(f => f.id === v.folderId),
      remaining: v.expiresAt - now,
    }));

  // ── LOADING ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={S.page}>
        <div style={{ ...S.card, alignItems: "center" }}>
          <div style={{ fontSize: 48 }}>🔑</div>
          <h1 style={S.title}>Dostęp do zadań</h1>
          <p style={{ color: "#888" }}>Ładowanie...</p>
        </div>
      </div>
    );
  }

  // ── STUDENT VIEW ──────────────────────────────────────────────────────────
  if (view === "student") {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.logo}>🔑</div>
          <h1 style={S.title}>Dostęp do zadań</h1>
          <p style={S.subtitle}>Wpisz kod z tablicy</p>

          <input
            style={S.codeInput}
            value={studentCode}
            onChange={e => { setStudentCode(e.target.value.toUpperCase()); setStudentResult(null); }}
            onKeyDown={e => e.key === "Enter" && checkStudentCode()}
            placeholder="XXX-XXX"
            maxLength={7}
            spellCheck={false}
          />

          <button style={S.btnPrimary} onClick={checkStudentCode}>
            Uzyskaj dostęp
          </button>

          {studentResult === "invalid" && (
            <div style={S.alert("error")}>❌ Kod nie znaleziony. Sprawdź czy wpisałeś poprawnie.</div>
          )}
          {studentResult === "expired" && (
            <div style={S.alert("error")}>⏰ Czas kodu minął. Poproś nauczyciela o nowy kod.</div>
          )}
          {studentResult && studentResult.folder && (
            <div style={S.successCard}>
              <div style={{ fontSize: 48 }}>{studentResult.folder.emoji}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#15803d" }}>{studentResult.folder.name}</div>
              <div style={{ fontSize: 14, color: "#166534", fontFamily: "monospace", fontWeight: 600 }}>
                ⏱ Pozostało: {formatTime(studentResult.expiresAt - now)}
              </div>
              <a href={studentResult.folder.url} target="_blank" rel="noreferrer" style={S.btnSuccess}>
                Otwórz zadania →
              </a>
            </div>
          )}

          <button style={S.btnGhost} onClick={() => setView("login")}>
            Zaloguj się jako nauczyciel
          </button>
        </div>
      </div>
    );
  }

  // ── LOGIN VIEW ────────────────────────────────────────────────────────────
  if (view === "login") {
    return (
      <div style={S.page}>
        <div style={{ ...S.card, maxWidth: 360 }}>
          <div style={S.logo}>🏫</div>
          <h1 style={S.title}>Panel nauczyciela</h1>
          <input
            style={S.input}
            type="password"
            value={loginPassword}
            onChange={e => setLoginPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="Hasło"
          />
          {loginError && <div style={S.alert("error")}>{loginError}</div>}
          <button style={S.btnPrimary} onClick={handleLogin}>Zaloguj się</button>
          <button style={S.btnGhost} onClick={() => setView("student")}>← Wróć</button>
        </div>
      </div>
    );
  }

  // ── TEACHER VIEW ──────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={{ ...S.card, maxWidth: 660 }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 32 }}>🏫</span>
          <h1 style={{ ...S.title, margin: 0, fontSize: 20 }}>Panel nauczyciela</h1>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {saving && <span style={{ fontSize: 12, color: "#888" }}>💾 Zapisywanie...</span>}
            <button style={S.btnGhost} onClick={() => setView("student")}>Wyloguj</button>
          </div>
        </div>

        {/* Generate code */}
        <section style={S.section}>
          <h2 style={S.sectionTitle}>Generuj kod dostępu</h2>
          <p style={S.hint}>Wybierz folder → wygeneruj kod → napisz na tablicy</p>

          {folders.length === 0 && (
            <div style={S.alert("info")}>Dodaj najpierw folder poniżej</div>
          )}

          <div style={S.folderGrid}>
            {folders.map(f => (
              <button
                key={f.id}
                style={{ ...S.folderBtn, ...(selectedFolder === f.id ? S.folderBtnActive : {}) }}
                onClick={() => { setSelectedFolder(f.id); setGeneratedCode(null); }}
              >
                <span style={{ fontSize: 26 }}>{f.emoji}</span>
                <span style={{ fontWeight: 600, fontSize: 13, textAlign: "center", lineHeight: 1.2 }}>{f.name}</span>
              </button>
            ))}
          </div>

          <button
            style={{ ...S.btnPrimary, opacity: selectedFolder ? 1 : 0.4 }}
            disabled={!selectedFolder}
            onClick={generateNewCode}
          >
            ⚡ Generuj kod na 45 min
          </button>

          {generatedCode && activeCodes[generatedCode] && (
            <div style={S.codeDisplay}>
              <div style={S.codeLabel}>KOD DLA UCZNIÓW</div>
              <div style={S.bigCode}>{generatedCode}</div>
              <div style={S.codeInfo}>
                {folders.find(f => f.id === selectedFolder)?.emoji}&nbsp;
                {folders.find(f => f.id === selectedFolder)?.name}
                &nbsp;|&nbsp;⏱ {formatTime((activeCodes[generatedCode]?.expiresAt || 0) - now)}
              </div>
            </div>
          )}
        </section>

        {/* Active codes */}
        {activeCodesList.length > 0 && (
          <section style={S.section}>
            <h2 style={S.sectionTitle}>Aktywne kody</h2>
            {activeCodesList.map(({ code, folder, remaining }) => (
              <div key={code} style={S.codeRow}>
                <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 15, flex: 1 }}>{code}</span>
                <span style={{ fontSize: 13, color: "#555", flex: 2 }}>{folder?.emoji} {folder?.name}</span>
                <span style={{ fontFamily: "monospace", fontSize: 13, color: "#0f3460", fontWeight: 700 }}>{formatTime(remaining)}</span>
                <button style={S.btnRevoke} onClick={() => revokeCode(code)}>✕ Anuluj</button>
              </div>
            ))}
          </section>
        )}

        {/* Folder management */}
        <section style={S.section}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={S.sectionTitle}>Foldery z zadaniami</h2>
            <button style={S.btnAdd} onClick={() => setShowAddFolder(!showAddFolder)}>
              {showAddFolder ? "✕ Anuluj" : "+ Dodaj folder"}
            </button>
          </div>

          {showAddFolder && (
            <div style={S.addFolderForm}>
              <div>
                <div style={S.label}>Ikona</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {EMOJI_LIST.map(e => (
                    <button key={e} style={{ ...S.emojiBtn, ...(newFolderEmoji === e ? S.emojiBtnActive : {}) }} onClick={() => setNewFolderEmoji(e)}>{e}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={S.label}>Nazwa folderu</div>
                  <input style={S.inputSmall} value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="np. JavaScript" />
                </div>
                <div style={{ flex: 3, minWidth: 200 }}>
                  <div style={S.label}>Link z Google Drive</div>
                  <input style={S.inputSmall} value={newFolderUrl} onChange={e => setNewFolderUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/..." />
                </div>
              </div>
              <button style={{ ...S.btnPrimary, opacity: (newFolderName && newFolderUrl) ? 1 : 0.4 }} disabled={!newFolderName || !newFolderUrl} onClick={addFolder}>
                Dodaj folder
              </button>
            </div>
          )}

          {folders.map((f) => (
            <div key={f.id} style={S.folderRow}>
              {editingFolder === f.id ? (
                <div style={{ display: "flex", gap: 6, flex: 1, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ width: "100%" }}>
                    <div style={S.label}>Ikona</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {EMOJI_LIST.map(e => (
                        <button key={e} style={{ ...S.emojiBtn, ...(f.emoji === e ? S.emojiBtnActive : {}) }} onClick={() => updateFolder(f.id, { emoji: e })}>{e}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={S.label}>Nazwa</div>
                    <input style={S.inputSmall} value={f.name} onChange={e => updateFolder(f.id, { name: e.target.value })} />
                  </div>
                  <div style={{ flex: 3, minWidth: 180 }}>
                    <div style={S.label}>Link</div>
                    <input style={S.inputSmall} value={f.url} onChange={e => updateFolder(f.id, { url: e.target.value })} placeholder="https://drive.google.com/..." />
                  </div>
                  <button style={S.btnSave} onClick={saveFolderEdit}>✓ Gotowe</button>
                </div>
              ) : (
                <>
                  <span style={{ fontSize: 22, minWidth: 30 }}>{f.emoji}</span>
                  <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{f.name}</span>
                  <span style={{ color: f.url ? "#16a34a" : "#dc2626", fontSize: 12, flex: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.url ? "✓ Link ustawiony" : "⚠ Brak linku"}
                  </span>
                  <button style={S.btnEdit} onClick={() => setEditingFolder(f.id)}>✏️</button>
                  <button style={S.btnDelete} onClick={() => deleteFolder(f.id)}>🗑️</button>
                </>
              )}
            </div>
          ))}
        </section>

        {/* Change password */}
        <section style={S.section}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={S.sectionTitle}>Bezpieczeństwo</h2>
            <button style={S.btnGhost} onClick={() => setShowChangePassword(!showChangePassword)}>
              {showChangePassword ? "Anuluj" : "Zmień hasło"}
            </button>
          </div>
          {showChangePassword && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input style={S.input} type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Aktualne hasło" />
              <input style={S.input} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Nowe hasło" />
              <input style={S.input} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Powtórz nowe hasło" />
              {passwordMsg && <div style={S.alert(passwordMsg.type)}>{passwordMsg.text}</div>}
              <button style={S.btnPrimary} onClick={handleChangePassword}>Zapisz hasło</button>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

const S = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    padding: "24px 16px", fontFamily: "'Inter', system-ui, sans-serif",
  },
  card: {
    background: "#fff", borderRadius: 20, padding: "32px 28px", width: "100%",
    maxWidth: 480, boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
    display: "flex", flexDirection: "column", gap: 16,
  },
  logo: { fontSize: 48, textAlign: "center" },
  title: { fontSize: 24, fontWeight: 800, color: "#1a1a2e", textAlign: "center", margin: 0 },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center", margin: 0 },
  hint: { fontSize: 13, color: "#888", margin: 0 },
  label: { fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  codeInput: {
    border: "2px solid #e0e0e0", borderRadius: 12, padding: "14px 20px",
    fontSize: 28, fontWeight: 800, letterSpacing: 8, textAlign: "center",
    outline: "none", color: "#1a1a2e", fontFamily: "monospace",
  },
  input: {
    border: "2px solid #e0e0e0", borderRadius: 10, padding: "11px 14px",
    fontSize: 15, outline: "none", color: "#1a1a2e",
  },
  inputSmall: {
    border: "1.5px solid #ddd", borderRadius: 8, padding: "8px 10px",
    fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box",
  },
  btnPrimary: {
    background: "linear-gradient(135deg, #0f3460, #533483)", color: "#fff",
    border: "none", borderRadius: 12, padding: "13px 20px",
    fontSize: 15, fontWeight: 700, cursor: "pointer",
  },
  btnGhost: {
    background: "transparent", color: "#888", border: "1.5px solid #ddd",
    borderRadius: 10, padding: "9px 14px", fontSize: 13, cursor: "pointer",
  },
  btnAdd: {
    background: "#eff6ff", color: "#1d4ed8", border: "1.5px solid #bfdbfe",
    borderRadius: 8, padding: "7px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  btnSuccess: {
    display: "inline-block", background: "#16a34a", color: "#fff",
    borderRadius: 10, padding: "12px 24px", fontSize: 15, fontWeight: 700,
    textDecoration: "none", marginTop: 8,
  },
  btnRevoke: {
    background: "#fee2e2", color: "#dc2626", border: "none",
    borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontWeight: 600, fontSize: 12,
  },
  btnEdit: { background: "transparent", border: "none", cursor: "pointer", fontSize: 16, padding: "4px 6px" },
  btnDelete: { background: "transparent", border: "none", cursor: "pointer", fontSize: 16, padding: "4px 6px" },
  btnSave: {
    background: "#0f3460", color: "#fff", border: "none",
    borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
  emojiBtn: {
    background: "#f5f5f5", border: "2px solid transparent",
    borderRadius: 8, padding: "4px 6px", fontSize: 18, cursor: "pointer",
  },
  emojiBtnActive: { borderColor: "#0f3460", background: "#eef2ff" },
  alert: (type) => ({
    background: type === "error" ? "#fef2f2" : type === "success" ? "#f0fdf4" : "#eff6ff",
    color: type === "error" ? "#dc2626" : type === "success" ? "#16a34a" : "#1d4ed8",
    border: `1.5px solid ${type === "error" ? "#fecaca" : type === "success" ? "#bbf7d0" : "#bfdbfe"}`,
    borderRadius: 10, padding: "11px 14px", fontSize: 14, fontWeight: 500,
  }),
  successCard: {
    background: "#f0fdf4", border: "2px solid #bbf7d0", borderRadius: 16,
    padding: "20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
  },
  section: {
    display: "flex", flexDirection: "column", gap: 10,
    borderTop: "1.5px solid #f0f0f0", paddingTop: 16,
  },
  sectionTitle: { fontSize: 15, fontWeight: 800, color: "#1a1a2e", margin: 0 },
  folderGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 },
  folderBtn: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
    padding: "14px 8px", border: "2px solid #e0e0e0", borderRadius: 12,
    background: "#fafafa", cursor: "pointer",
  },
  folderBtnActive: { borderColor: "#0f3460", background: "#eef2ff" },
  codeDisplay: {
    background: "linear-gradient(135deg, #1a1a2e, #0f3460)", borderRadius: 16,
    padding: "20px", textAlign: "center", color: "#fff",
  },
  codeLabel: { fontSize: 11, color: "#94a3b8", letterSpacing: 3, textTransform: "uppercase", marginBottom: 6 },
  bigCode: { fontSize: 44, fontWeight: 900, letterSpacing: 10, fontFamily: "monospace", color: "#60a5fa" },
  codeInfo: { fontSize: 13, color: "#94a3b8", marginTop: 8 },
  codeRow: {
    display: "flex", alignItems: "center", gap: 10,
    background: "#f8f8f8", borderRadius: 10, padding: "10px 14px",
  },
  folderRow: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "10px 0", borderBottom: "1px solid #f0f0f0",
  },
  addFolderForm: {
    background: "#f8faff", border: "1.5px solid #bfdbfe", borderRadius: 12,
    padding: 16, display: "flex", flexDirection: "column", gap: 12,
  },
};
