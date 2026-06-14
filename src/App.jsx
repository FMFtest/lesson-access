import { useState, useEffect, useCallback } from "react";

const TEACHER_PASSWORD = "teacher123";
const CODE_DURATION_MS = 45 * 60 * 1000;

const STORAGE_KEYS = {
  activeCodes: "activeCodes",
  folders: "folders",
};

const DEFAULT_FOLDERS = [
  { id: "excel", name: "Excel", emoji: "📊", url: "" },
  { id: "python", name: "Python", emoji: "🐍", url: "" },
  { id: "html", name: "HTML/CSS", emoji: "🌐", url: "" },
  { id: "databases", name: "Бази даних", emoji: "🗄️", url: "" },
];

const EMOJI_LIST = ["📊","🐍","🌐","🗄️","🎨","📐","🔬","💻","📝","🧮","🎯","📁","🖥️","⚙️","🔧","📚"];

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

async function loadFromStorage(key, shared = true) {
  try {
    const result = await window.storage.get(key, shared);
    return result ? JSON.parse(result.value) : null;
  } catch { return null; }
}

async function saveToStorage(key, value, shared = true) {
  try {
    await window.storage.set(key, JSON.stringify(value), shared);
  } catch { console.error("Storage write failed"); }
}

export default function App() {
  const [view, setView] = useState("student");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [folders, setFolders] = useState(DEFAULT_FOLDERS);
  const [activeCodes, setActiveCodes] = useState({});
  const [now, setNow] = useState(Date.now());

  // Student state
  const [studentCode, setStudentCode] = useState("");
  const [studentResult, setStudentResult] = useState(null);

  // Teacher state
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [generatedCode, setGeneratedCode] = useState(null);
  const [editingFolder, setEditingFolder] = useState(null);

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
  const [teacherPassword, setTeacherPassword] = useState(TEACHER_PASSWORD);

  useEffect(() => {
    (async () => {
      const codes = await loadFromStorage(STORAGE_KEYS.activeCodes);
      if (codes) setActiveCodes(codes);
      const savedFolders = await loadFromStorage(STORAGE_KEYS.folders);
      if (savedFolders) setFolders(savedFolders);
      const savedPass = await loadFromStorage("teacherPassword");
      if (savedPass) setTeacherPassword(savedPass);
    })();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const expired = Object.entries(activeCodes).filter(([, v]) => v.expiresAt < now);
    if (expired.length > 0) {
      const updated = { ...activeCodes };
      expired.forEach(([k]) => delete updated[k]);
      setActiveCodes(updated);
      saveToStorage(STORAGE_KEYS.activeCodes, updated);
    }
  }, [now]);

  const handleLogin = () => {
    if (loginPassword === teacherPassword) {
      setView("teacher");
      setLoginError("");
      setLoginPassword("");
    } else {
      setLoginError("Невірний пароль");
    }
  };

  const generateNewCode = useCallback(async () => {
    if (!selectedFolder) return;
    const code = generateCode();
    const expiresAt = Date.now() + CODE_DURATION_MS;
    const updated = { ...activeCodes, [code]: { folderId: selectedFolder, expiresAt } };
    setActiveCodes(updated);
    setGeneratedCode(code);
    await saveToStorage(STORAGE_KEYS.activeCodes, updated);
  }, [selectedFolder, activeCodes]);

  const revokeCode = useCallback(async (code) => {
    const updated = { ...activeCodes };
    delete updated[code];
    setActiveCodes(updated);
    if (generatedCode === code) setGeneratedCode(null);
    await saveToStorage(STORAGE_KEYS.activeCodes, updated);
  }, [activeCodes, generatedCode]);

  const checkStudentCode = () => {
    const clean = studentCode.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    const entry = activeCodes[clean];
    if (!entry) { setStudentResult("invalid"); return; }
    if (entry.expiresAt < Date.now()) { setStudentResult("expired"); return; }
    const folder = folders.find(f => f.id === entry.folderId);
    setStudentResult({ folder, expiresAt: entry.expiresAt });
  };

  const saveFolders = async (updated) => {
    setFolders(updated);
    await saveToStorage(STORAGE_KEYS.folders, updated);
  };

  const addFolder = async () => {
    if (!newFolderName.trim() || !newFolderUrl.trim()) return;
    const newFolder = { id: generateId(), name: newFolderName.trim(), emoji: newFolderEmoji, url: newFolderUrl.trim() };
    const updated = [...folders, newFolder];
    await saveFolders(updated);
    setNewFolderName("");
    setNewFolderUrl("");
    setNewFolderEmoji("📁");
    setShowAddFolder(false);
  };

  const deleteFolder = async (id) => {
    const updated = folders.filter(f => f.id !== id);
    await saveFolders(updated);
    if (selectedFolder === id) setSelectedFolder(null);
    if (editingFolder === id) setEditingFolder(null);
  };

  const updateFolder = async (id, changes) => {
    const updated = folders.map(f => f.id === id ? { ...f, ...changes } : f);
    await saveFolders(updated);
  };

  const handleChangePassword = async () => {
    if (currentPassword !== teacherPassword) {
      setPasswordMsg({ type: "error", text: "Поточний пароль невірний" });
      return;
    }
    if (newPassword.length < 4) {
      setPasswordMsg({ type: "error", text: "Новий пароль мінімум 4 символи" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "Паролі не співпадають" });
      return;
    }
    setTeacherPassword(newPassword);
    await saveToStorage("teacherPassword", newPassword);
    setPasswordMsg({ type: "success", text: "Пароль змінено!" });
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

  // ── STUDENT VIEW ──────────────────────────────────────────────────────────
  if (view === "student") {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.logo}>🔑</div>
          <h1 style={S.title}>Доступ до завдань</h1>
          <p style={S.subtitle}>Введіть код з дошки</p>

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
            Отримати доступ
          </button>

          {studentResult === "invalid" && (
            <div style={S.alert("error")}>❌ Код не знайдено. Перевірте правильність введення.</div>
          )}
          {studentResult === "expired" && (
            <div style={S.alert("error")}>⏰ Час дії коду закінчився. Попросіть новий у вчителя.</div>
          )}
          {studentResult && studentResult.folder && (
            <div style={S.successCard}>
              <div style={{ fontSize: 48 }}>{studentResult.folder.emoji}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#15803d" }}>{studentResult.folder.name}</div>
              <div style={{ fontSize: 14, color: "#166534", fontFamily: "monospace", fontWeight: 600 }}>
                ⏱ Залишилось: {formatTime(studentResult.expiresAt - now)}
              </div>
              <a href={studentResult.folder.url} target="_blank" rel="noreferrer" style={S.btnSuccess}>
                Відкрити завдання →
              </a>
            </div>
          )}

          <button style={S.btnGhost} onClick={() => setView("login")}>
            Увійти як вчитель
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
          <h1 style={S.title}>Панель вчителя</h1>
          <input
            style={S.input}
            type="password"
            value={loginPassword}
            onChange={e => setLoginPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="Пароль"
          />
          {loginError && <div style={S.alert("error")}>{loginError}</div>}
          <button style={S.btnPrimary} onClick={handleLogin}>Увійти</button>
          <button style={S.btnGhost} onClick={() => setView("student")}>← Назад</button>
        </div>
      </div>
    );
  }

  // ── TEACHER VIEW ──────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={{ ...S.card, maxWidth: 660 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 32 }}>🏫</span>
          <h1 style={{ ...S.title, margin: 0, fontSize: 20 }}>Панель вчителя</h1>
          <button style={S.btnGhost} onClick={() => setView("student")}>Вийти</button>
        </div>

        {/* Generate code */}
        <section style={S.section}>
          <h2 style={S.sectionTitle}>Генерувати код доступу</h2>
          <p style={S.hint}>Оберіть папку → натисніть генерувати → напишіть код на дошці</p>

          {folders.length === 0 && (
            <div style={S.alert("info")}>Додайте хоча б одну папку нижче</div>
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
            ⚡ Згенерувати код на 45 хв
          </button>

          {generatedCode && activeCodes[generatedCode] && (
            <div style={S.codeDisplay}>
              <div style={S.codeLabel}>КОД ДЛЯ УЧНІВ</div>
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
            <h2 style={S.sectionTitle}>Активні коди</h2>
            {activeCodesList.map(({ code, folder, remaining }) => (
              <div key={code} style={S.codeRow}>
                <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 15, flex: 1 }}>{code}</span>
                <span style={{ fontSize: 13, color: "#555", flex: 2 }}>{folder?.emoji} {folder?.name}</span>
                <span style={{ fontFamily: "monospace", fontSize: 13, color: "#0f3460", fontWeight: 700 }}>{formatTime(remaining)}</span>
                <button style={S.btnRevoke} onClick={() => revokeCode(code)}>✕ Скасувати</button>
              </div>
            ))}
          </section>
        )}

        {/* Folder management */}
        <section style={S.section}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={S.sectionTitle}>Папки з завданнями</h2>
            <button style={S.btnAdd} onClick={() => setShowAddFolder(!showAddFolder)}>
              {showAddFolder ? "✕ Скасувати" : "+ Додати папку"}
            </button>
          </div>

          {/* Add folder form */}
          {showAddFolder && (
            <div style={S.addFolderForm}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {/* Emoji picker */}
                <div style={{ width: "100%" }}>
                  <div style={S.label}>Іконка</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {EMOJI_LIST.map(e => (
                      <button
                        key={e}
                        style={{ ...S.emojiBtn, ...(newFolderEmoji === e ? S.emojiBtnActive : {}) }}
                        onClick={() => setNewFolderEmoji(e)}
                      >{e}</button>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={S.label}>Назва папки</div>
                  <input
                    style={S.inputSmall}
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    placeholder="Наприклад: JavaScript"
                  />
                </div>
                <div style={{ flex: 3, minWidth: 200 }}>
                  <div style={S.label}>Посилання з Google Drive</div>
                  <input
                    style={S.inputSmall}
                    value={newFolderUrl}
                    onChange={e => setNewFolderUrl(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                  />
                </div>
              </div>
              <button
                style={{ ...S.btnPrimary, opacity: (newFolderName && newFolderUrl) ? 1 : 0.4 }}
                disabled={!newFolderName || !newFolderUrl}
                onClick={addFolder}
              >
                Додати папку
              </button>
            </div>
          )}

          {/* Folder list */}
          {folders.map((f) => (
            <div key={f.id} style={S.folderRow}>
              {editingFolder === f.id ? (
                <div style={{ display: "flex", gap: 6, flex: 1, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div>
                    <div style={S.label}>Іконка</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {EMOJI_LIST.map(e => (
                        <button
                          key={e}
                          style={{ ...S.emojiBtn, ...(f.emoji === e ? S.emojiBtnActive : {}) }}
                          onClick={() => updateFolder(f.id, { emoji: e })}
                        >{e}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={S.label}>Назва</div>
                    <input
                      style={S.inputSmall}
                      value={f.name}
                      onChange={e => updateFolder(f.id, { name: e.target.value })}
                    />
                  </div>
                  <div style={{ flex: 3, minWidth: 180 }}>
                    <div style={S.label}>Посилання</div>
                    <input
                      style={S.inputSmall}
                      value={f.url}
                      onChange={e => updateFolder(f.id, { url: e.target.value })}
                      placeholder="https://drive.google.com/..."
                    />
                  </div>
                  <button style={S.btnSave} onClick={() => setEditingFolder(null)}>✓ Готово</button>
                </div>
              ) : (
                <>
                  <span style={{ fontSize: 22, minWidth: 30 }}>{f.emoji}</span>
                  <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{f.name}</span>
                  <span style={{ color: f.url ? "#16a34a" : "#dc2626", fontSize: 12, flex: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.url ? "✓ Посилання встановлено" : "⚠ Посилання не додано"}
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
            <h2 style={S.sectionTitle}>Безпека</h2>
            <button style={S.btnGhost} onClick={() => setShowChangePassword(!showChangePassword)}>
              {showChangePassword ? "Скасувати" : "Змінити пароль"}
            </button>
          </div>
          {showChangePassword && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input style={S.input} type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Поточний пароль" />
              <input style={S.input} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Новий пароль" />
              <input style={S.input} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Повторіть новий пароль" />
              {passwordMsg && <div style={S.alert(passwordMsg.type)}>{passwordMsg.text}</div>}
              <button style={S.btnPrimary} onClick={handleChangePassword}>Зберегти пароль</button>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const S = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "24px 16px",
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  card: {
    background: "#fff",
    borderRadius: 20,
    padding: "32px 28px",
    width: "100%",
    maxWidth: 480,
    boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
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
  folderGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8,
  },
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
