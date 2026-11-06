require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PRIVATE_DIR = path.resolve("private-data");
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || "./private-data/uploads");
const DB_PATH = path.resolve(process.env.DATABASE_PATH || "./private-data/stk-smp.sqlite");
fs.mkdirSync(PRIVATE_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (!process.env.SESSION_SECRET || !process.env.ADMIN_PASSWORD) {
  throw new Error("Set SESSION_SECRET and ADMIN_PASSWORD in your .env file before starting.");
}
if (process.env.NODE_ENV === "production" && process.env.ADMIN_PASSWORD === "replace-this-before-deploying") {
  throw new Error("Set a unique ADMIN_PASSWORD before production deployment.");
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    files TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

(async () => {
  const existing = db.prepare("SELECT value FROM settings WHERE key='admin_hash'").get();
  if (!existing) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    db.prepare("INSERT INTO settings(key,value) VALUES('admin_hash',?)").run(hash);
  }
})();

app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : 0);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"]
    }
  }
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: PRIVATE_DIR }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: "stk.sid",
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 4
  }
}));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });
const submitLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false });
const allowedExt = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".webm", ".pdf"]);
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimeOk = /^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm)|application\/pdf)$/.test(file.mimetype);
    cb(mimeOk && allowedExt.has(ext) ? null : new Error("Unsupported evidence file type."), mimeOk && allowedExt.has(ext));
  }
});

function requireAdmin(req, res, next) {
  if (!req.session.admin) return res.status(401).json({ error: "Please sign in." });
  next();
}
function clean(value, max = 5000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}
function saveSubmission(type, req, res) {
  const payload = {};
  for (const [key, value] of Object.entries(req.body)) payload[key] = clean(value, 8000);
  const uploaded = (req.files || []).map(f => ({
    id: path.basename(f.filename),
    originalName: clean(f.originalname, 180),
    mimeType: f.mimetype,
    size: f.size
  }));
  const result = db.prepare("INSERT INTO submissions(type,payload,files) VALUES(?,?,?)")
    .run(type, JSON.stringify(payload), JSON.stringify(uploaded));
  res.status(201).json({ ok: true, id: result.lastInsertRowid, message: "Your submission was received." });
}

app.post("/api/submit/admin-application", submitLimiter, upload.array("evidence", 8), (req, res) => {
  const hours = Number(req.body.hoursPlayed);
  const version = clean(req.body.javaVersion, 40);
  const match = version.match(/^1\.(\d+)(?:\.\d+)?$/);
  if (!Number.isFinite(hours) || hours < 30) return res.status(400).json({ error: "Admin applicants must have at least 30 hours played." });
  if (!match || Number(match[1]) < 21) return res.status(400).json({ error: "Use Minecraft Java Edition 1.21 or newer." });
  saveSubmission("admin-application", req, res);
});
app.post("/api/submit/media-application", submitLimiter, upload.array("evidence", 8), (req, res) => {
  const viewers = Number(req.body.averageViewers || 0);
  const views = Number(req.body.videoViews || 0);
  if (viewers < 50 && views <= 25000) return res.status(400).json({ error: "Meet either 50 average stream viewers or more than 25,000 video views." });
  if (!clean(req.body.channelUrl) || !clean(req.body.qualifyingLink)) return res.status(400).json({ error: "Add your channel URL and qualifying content link." });
  saveSubmission("media-application", req, res);
});
app.post("/api/submit/builder-application", submitLimiter, upload.array("evidence", 8), (req, res) => saveSubmission("builder-application", req, res));
app.post("/api/submit/report", submitLimiter, upload.array("evidence", 8), (req, res) => {
  if (!clean(req.body.reportedPlayer) || !clean(req.body.details)) return res.status(400).json({ error: "Add the reported player's username and an explanation." });
  saveSubmission("player-report", req, res);
});

app.post("/api/admin/login", loginLimiter, async (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key='admin_hash'").get();
  if (!row || !(await bcrypt.compare(clean(req.body.password, 300), row.value))) {
    return res.status(401).json({ error: "Incorrect password." });
  }
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Could not start session." });
    req.session.admin = true;
    res.json({ ok: true });
  });
});
app.post("/api/admin/logout", requireAdmin, (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/api/admin/me", (req, res) => res.json({ authenticated: Boolean(req.session.admin) }));
app.get("/api/admin/submissions", requireAdmin, (req, res) => {
  const type = clean(req.query.type, 50);
  const rows = type
    ? db.prepare("SELECT * FROM submissions WHERE type=? ORDER BY created_at DESC").all(type)
    : db.prepare("SELECT * FROM submissions ORDER BY created_at DESC").all();
  res.json(rows.map(row => ({ ...row, payload: JSON.parse(row.payload), files: JSON.parse(row.files) })));
});
app.get("/api/admin/evidence/:id", requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT files FROM submissions").all();
  const file = rows.flatMap(r => JSON.parse(r.files)).find(f => f.id === path.basename(req.params.id));
  if (!file) return res.status(404).end();
  const fullPath = path.join(UPLOAD_DIR, file.id);
  if (!fs.existsSync(fullPath)) return res.status(404).end();
  res.download(fullPath, file.originalName);
});

app.get("/api/craftrank", async (_req, res) => {
  const endpoint = process.env.CRAFT_RANK_API_URL;
  if (!endpoint) return res.status(503).json({ verified: false, message: "Live ranking is not configured. Check CraftRank directly." });
  try {
    const response = await fetch(endpoint, {
      headers: process.env.CRAFT_RANK_API_KEY ? { Authorization: `Bearer ${process.env.CRAFT_RANK_API_KEY}` } : {}
    });
    if (!response.ok) throw new Error("Ranking service unavailable");
    const data = await response.json();
    res.json({ verified: true, data });
  } catch {
    res.status(503).json({ verified: false, message: "Could not verify the live CraftRank placement." });
  }
});

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: "Upload limit exceeded. Maximum 8 files, 20 MB each." });
  res.status(400).json({ error: err.message || "Request failed." });
});
app.listen(PORT, () => console.log(`STK SMP website running on port ${PORT}`));
