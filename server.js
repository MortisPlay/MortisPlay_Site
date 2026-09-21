/**
 * Mortis Play — сервер (Express + PostgreSQL)
 *
 * База данных: управляемый PostgreSQL (Neon / Supabase / Render Managed Postgres).
 * Переменная окружения DATABASE_URL обязательна, например:
 *   postgres://user:password@host:5432/dbname?sslmode=require
 *
 * Почему не SQLite (data.db): файловая система контейнеров Render эфемерна —
 * при каждом деплое новый контейнер, локальный файл базы теряется.
 * PostgreSQL живёт вне контейнера и переживает любые редеплои.
 */

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();

// ===== Подключение к PostgreSQL =====
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ОШИБКА: не задана переменная окружения DATABASE_URL.');
  console.error('Создайте базу на Neon или Supabase и укажите её connection string.');
  console.error('В Render: Service → Environment → добавить DATABASE_URL.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSL === 'disable'
    ? false
    : { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Неожиданная ошибка пула PostgreSQL:', err);
});

// Утилиты запросов
const q = (text, params) => pool.query(text, params).then((r) => r.rows);
const q1 = async (text, params) => {
  const rows = await q(text, params);
  return rows[0] || null;
};
const qr = (text, params) => pool.query(text, params);

// Транзакция: BEGIN / COMMIT / ROLLBACK с автоматическим освобождением клиента
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

function isUniqueViolation(err) {
  return Boolean(err && err.code === '23505');
}

// ===== Константы =====
const STARTING_COINS = 1000;
const LIMITED_STOCK = 10; // Лимит продаж для аватарок «Ограниченный выпуск»
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
// SHA-256 хеш секретного кода админ-панели (тот же, что использовался на клиенте).
const ADMIN_PASS_HASH = 'd245fec3edca3b4648991d99fabf4f1f1a295a6a816e1cb78b50df3ad8ec8bd2';

// ===== Хелперы =====
function isAdminRequest(req) {
  const digest = String(req.headers['x-admin-code'] || '').trim();
  return Boolean(digest) && digest === ADMIN_PASS_HASH;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

function parseStoredJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function auraIdOf(item) {
  try {
    return JSON.parse(item.metadata || '{}').auraId || null;
  } catch (e) {
    return null;
  }
}

// ===== Кэш каталога товаров (таблица items статична после сидинга) =====
let itemsCache = { all: [], bySlug: new Map(), byAuraId: new Map() };

async function refreshItemsCache() {
  const rows = await q('SELECT id, slug, name, price, type, metadata FROM items');
  itemsCache.all = rows;
  itemsCache.bySlug = new Map();
  itemsCache.byAuraId = new Map();
  for (const row of rows) {
    itemsCache.bySlug.set(row.slug, row);
    const auraId = auraIdOf(row);
    if (auraId && !itemsCache.byAuraId.has(auraId)) itemsCache.byAuraId.set(auraId, row);
  }
}

function findItemCached(itemId, itemSlug) {
  if (itemId) {
    const found = itemsCache.all.find((i) => Number(i.id) === Number(itemId));
    if (found) return found;
  }
  if (itemSlug) {
    return itemsCache.bySlug.get(itemSlug) || itemsCache.byAuraId.get(itemSlug) || null;
  }
  return null;
}

function normalizeInventoryItems(rawInventory) {
  const inventory = Array.isArray(rawInventory) ? rawInventory : [];
  return inventory.map((entry) => {
    const bySlug = itemsCache.bySlug.get(entry);
    if (bySlug) return auraIdOf(bySlug) || entry;
    const byAura = itemsCache.byAuraId.get(entry);
    if (byAura) return auraIdOf(byAura) || entry;
    return entry;
  });
}

function normalizeEquippedValue(value) {
  if (!value) return null;
  const bySlug = itemsCache.bySlug.get(value);
  if (bySlug) return auraIdOf(bySlug) || value;
  const byAura = itemsCache.byAuraId.get(value);
  if (byAura) return auraIdOf(byAura) || value;
  return value;
}

function normalizeEquippedAvatarValue(value) {
  if (!value) return null;
  const candidate = itemsCache.bySlug.get(value) || itemsCache.byAuraId.get(value);
  if (!candidate || candidate.type !== 'avatar') return null;
  try {
    const metadata = JSON.parse(candidate.metadata || '{}');
    return metadata.auraId || candidate.slug;
  } catch (e) {
    return candidate.slug;
  }
}

function safeUserProfile(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username || null,
    createdAt: user.created_at,
    customization: parseStoredJson(user.customization, {}),
    badges: parseStoredJson(user.badges, []),
    settings: parseStoredJson(user.settings, {}),
    coins: Number.isFinite(Number(user.coins)) ? Number(user.coins) : STARTING_COINS,
    inventory: normalizeInventoryItems(parseStoredJson(user.inventory, [])),
    equipped: normalizeEquippedValue(user.equipped),
    equippedAvatar: normalizeEquippedAvatarValue(user.equipped_avatar),
    rewardedVideos: parseStoredJson(user.rewarded_videos, [])
  };
}

// ===== Сессии =====
async function createSession(userId) {
  const token = createToken();
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await qr(
    'INSERT INTO sessions (user_id, token, expires_at, created_at, last_used_at) VALUES ($1, $2, $3, $4, $5)',
    [userId, token, expiresAt, nowIso, nowIso]
  );
  return token;
}

async function getSessionByToken(token) {
  if (!token) return null;
  return q1('SELECT * FROM sessions WHERE token = $1', [token]);
}

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const session = token ? await getSessionByToken(token) : null;
    if (!session) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }
    if (new Date(session.expires_at) < new Date()) {
      await qr('DELETE FROM sessions WHERE id = $1', [session.id]);
      return res.status(401).json({ error: 'Сессия устарела' });
    }
    const user = await q1('SELECT * FROM users WHERE id = $1', [session.user_id]);
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }
    await qr('UPDATE sessions SET last_used_at = $1 WHERE id = $2', [new Date().toISOString(), session.id]);
    req.user = user;
    req.session = session;
    next();
  } catch (err) {
    next(err);
  }
}

// ===== Ограниченные выпуски: лимит продаж (по умолчанию 10 шт) =====
function isLimitedItem(item) {
  if (!item) return false;
  let metadata = {};
  try {
    metadata = JSON.parse(item.metadata || '{}');
  } catch (e) { /* ignore */ }
  const slug = String(item.slug || '');
  const auraId = String(metadata.auraId || '');
  return Boolean(metadata.limited) || slug.startsWith('limited_avatar') || auraId.startsWith('limitedAvatar');
}

async function getLimitedStock(item) {
  const row = await q1('SELECT COUNT(*)::int AS cnt FROM purchases WHERE item_id = $1', [item.id]);
  const sold = Number(row && row.cnt) || 0;
  return { sold, remaining: Math.max(0, LIMITED_STOCK - sold), soldOut: sold >= LIMITED_STOCK };
}

// ===== Сидинг витрины магазина =====
async function seedShopItems() {
  const items = [
    { slug: 'gold_frame', name: 'Золотая рамка', price: 500, type: 'aura', metadata: { auraId: 'gold' } },
    { slug: 'neon_frame', name: 'Неоновая рамка', price: 800, type: 'aura', metadata: { auraId: 'neon' } },
    { slug: 'fire_frame', name: 'Огненная рамка', price: 1200, type: 'aura', metadata: { auraId: 'fire' } },
    { slug: 'cosmic_frame', name: 'Космическая рамка', price: 1500, type: 'aura', metadata: { auraId: 'cosmic' } },
    { slug: 'crystal_frame', name: 'Кристальная рамка', price: 2000, type: 'aura', metadata: { auraId: 'crystal' } },
    { slug: 'royal_frame', name: 'Королевская рамка', price: 3000, type: 'aura', metadata: { auraId: 'royal' } },
    { slug: 'avatar_fisheye_duo', name: 'Фишай-дуэт', price: 100, type: 'avatar', metadata: { auraId: 'avatar1', image: '/photoSHOP/$$$$.jpg' } },
    { slug: 'avatar_business_mode', name: 'Деловой режим', price: 150, type: 'avatar', metadata: { auraId: 'avatar2', image: '/photoSHOP/Man.jpg' } },
    { slug: 'avatar_watermelon', name: 'Арбузный космонавт', price: 200, type: 'avatar', metadata: { auraId: 'avatar3', image: '/photoSHOP/Арбуз.jpg' } },
    { slug: 'avatar_broke_rabbit', name: 'Кролик на мели', price: 250, type: 'avatar', metadata: { auraId: 'avatar4', image: '/photoSHOP/бедни%20кролик%F0%9F%98%AD.jpg' } },
    { slug: 'avatar_psydak', name: 'Псайдак в огне', price: 300, type: 'avatar', metadata: { auraId: 'avatar5', image: '/photoSHOP/Без%20названия%20(1).jpg' } },
    { slug: 'avatar_duck_snack', name: 'Утёнок с чипсами', price: 350, type: 'avatar', metadata: { auraId: 'avatar6', image: '/photoSHOP/Без%20названия.jpg' } },
    { slug: 'avatar_catastrophe', name: 'Кот после взрыва', price: 400, type: 'avatar', metadata: { auraId: 'avatar7', image: '/photoSHOP/Кот.jpg' } },
    { slug: 'avatar_fading_cat', name: 'Стирающийся котик', price: 425, type: 'avatar', metadata: { auraId: 'avatar8', image: '/photoSHOP/котик%20стираеться.jpg' } },
    { slug: 'avatar_creeper_hat', name: 'Крипер в шапке', price: 450, type: 'avatar', metadata: { auraId: 'avatar9', image: '/photoSHOP/крипер%20в%20шапке.jpg' } },
    { slug: 'avatar_sleepy_vibe', name: 'Сонный вайб', price: 500, type: 'avatar', metadata: { auraId: 'avatar10', image: '/photoSHOP/%E2%9C%A8Free%20avatar%F0%9F%A5%B1%20%5B2_300%5D%E2%9C%A8.jpg' } },
    // Ограниченные выпуски: эксклюзивные аватарки (assets2/)
    { slug: 'limited_avatar_1', name: 'Неоновый хищник', price: 600, type: 'avatar', metadata: { auraId: 'limitedAvatar1', image: '/assets2/photo_5291782115840172013_y.jpg', limited: true } },
    { slug: 'limited_avatar_2', name: 'Кибер-призрак', price: 650, type: 'avatar', metadata: { auraId: 'limitedAvatar2', image: '/assets2/photo_5291782115840172014_y.jpg', limited: true } },
    { slug: 'limited_avatar_3', name: 'Уличный свет', price: 700, type: 'avatar', metadata: { auraId: 'limitedAvatar3', image: '/assets2/photo_5291782115840172015_y.jpg', limited: true } },
    { slug: 'limited_avatar_4', name: 'Ночной город', price: 750, type: 'avatar', metadata: { auraId: 'limitedAvatar4', image: '/assets2/photo_5291782115840172016_y.jpg', limited: true } },
    { slug: 'limited_avatar_5', name: 'Стальной взгляд', price: 800, type: 'avatar', metadata: { auraId: 'limitedAvatar5', image: '/assets2/photo_5291782115840172017_y.jpg', limited: true } },
    { slug: 'limited_avatar_6', name: 'Полярное сияние', price: 850, type: 'avatar', metadata: { auraId: 'limitedAvatar6', image: '/assets2/photo_5291782115840172018_y.jpg', limited: true } },
    { slug: 'limited_avatar_7', name: 'Тёмная материя', price: 900, type: 'avatar', metadata: { auraId: 'limitedAvatar7', image: '/assets2/photo_5291782115840172019_y.jpg', limited: true } },
    { slug: 'limited_avatar_8', name: 'Золотая эра', price: 1000, type: 'avatar', metadata: { auraId: 'limitedAvatar8', image: '/assets2/photo_5291782115840172020_y.jpg', limited: true } },
    { slug: 'lootbox_start', name: 'Стартовый кейс', price: 500, type: 'lootbox', metadata: {
      category: 'lootbox',
      description: 'Откройте кейс и получите случайную рамку или аватарку. Шанс на редкие предметы!',
      prizes: [
        { slug: 'avatar_fisheye_duo', weight: 30 },
        { slug: 'avatar_business_mode', weight: 25 },
        { slug: 'gold_frame', weight: 20 },
        { slug: 'neon_frame', weight: 10 },
        { slug: 'fire_frame', weight: 8 },
        { slug: 'cosmic_frame', weight: 4 },
        { slug: 'crystal_frame', weight: 2 },
        { slug: 'royal_frame', weight: 1 }
      ]
    } },
    { slug: 'lootbox_luck', name: 'Кейс удачи', price: 100, type: 'lootbox', metadata: {
      category: 'lootbox',
      description: 'Дешёвый кейс в стиле CS2 — испытывай удачу! Много обычных предметов и крошечный шанс на мифическую королевскую рамку.',
      prizes: [
        { slug: 'avatar_fisheye_duo', weight: 30 },
        { slug: 'avatar_business_mode', weight: 28 },
        { slug: 'avatar_watermelon', weight: 25 },
        { slug: 'avatar_broke_rabbit', weight: 22 },
        { slug: 'avatar_psydak', weight: 20 },
        { slug: 'avatar_duck_snack', weight: 18 },
        { slug: 'avatar_catastrophe', weight: 15 },
        { slug: 'avatar_fading_cat', weight: 12 },
        { slug: 'avatar_creeper_hat', weight: 10 },
        { slug: 'avatar_sleepy_vibe', weight: 8 },
        { slug: 'gold_frame', weight: 8 },
        { slug: 'neon_frame', weight: 6 },
        { slug: 'fire_frame', weight: 4 },
        { slug: 'cosmic_frame', weight: 3 },
        { slug: 'crystal_frame', weight: 2 },
        { slug: 'royal_frame', weight: 1 }
      ]
    } }
  ];

  for (const item of items) {
    await qr(
      `INSERT INTO items (slug, name, price, type, metadata)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug) DO NOTHING`,
      [item.slug, item.name, item.price, item.type, JSON.stringify(item.metadata || {})]
    );
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ===== Схема базы данных (PostgreSQL) =====
const createStatements = [
  `CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    username TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    customization TEXT NOT NULL DEFAULT '{}',
    badges TEXT NOT NULL DEFAULT '[]',
    settings TEXT NOT NULL DEFAULT '{}',
    coins INTEGER NOT NULL DEFAULT ${STARTING_COINS},
    inventory TEXT NOT NULL DEFAULT '[]',
    equipped TEXT,
    equipped_avatar TEXT,
    rewarded_videos TEXT NOT NULL DEFAULT '[]'
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    type TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}'
  )`,
  `CREATE TABLE IF NOT EXISTS purchases (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    item_id INTEGER NOT NULL REFERENCES items(id),
    amount INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'buy',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE purchases ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'buy'`,
  `CREATE TABLE IF NOT EXISTS video_rewards (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    video_id TEXT NOT NULL,
    rewarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    coins INTEGER NOT NULL,
    source TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)`,
  `CREATE INDEX IF NOT EXISTS idx_purchases_item ON purchases(item_id)`,
  `CREATE INDEX IF NOT EXISTS idx_video_rewards_user ON video_rewards(user_id, video_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_video_rewards_unique ON video_rewards(user_id, video_id)`
];

async function initDatabase() {
  for (const stmt of createStatements) {
    await qr(stmt);
  }
  await seedShopItems();
  await refreshItemsCache();
  console.log('PostgreSQL готов: схема создана, витрина магазина наполнена.');
}

// ================= API =================

// Пинг-эндпоинт для проверки доступности сервера.
// Лёгкий: не обращается к базе данных и не отрисовывает страницы,
// поэтому им могут пользоваться мониторинги/пингеры без нагрузки.
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// --- Заметки ---
app.get('/api/notes', async (req, res, next) => {
  try {
    const notes = await q('SELECT * FROM notes ORDER BY created_at DESC');
    res.json(notes);
  } catch (err) { next(err); }
});

app.post('/api/notes', async (req, res, next) => {
  try {
    const text = String(req.body.text || '').trim();
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    const result = await qr('INSERT INTO notes (text) VALUES ($1) RETURNING id, text, created_at', [text]);
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

// --- Регистрация / вход / восстановление ---
app.post('/api/auth/register', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Имя, email и пароль обязательны' });
    }

    const existing = await q1('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) {
      return res.status(409).json({ error: 'Пользователь с таким email уже зарегистрирован' });
    }

    const salt = generateSalt();
    const password_hash = hashPassword(password, salt);
    // ON CONFLICT — защита от гонок при параллельных регистрациях одного email
    const result = await qr(
      `INSERT INTO users (email, name, password_hash, password_salt, customization, badges, settings, coins, inventory, equipped, rewarded_videos)
       VALUES ($1, $2, $3, $4, '{}', '[]', '{}', $5, '[]', NULL, '[]')
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [email, name, password_hash, salt, STARTING_COINS]
    );
    if (result.rowCount === 0) {
      return res.status(409).json({ error: 'Пользователь с таким email уже зарегистрирован' });
    }

    const user = await q1('SELECT * FROM users WHERE id = $1', [result.rows[0].id]);
    const token = await createSession(user.id);
    res.status(201).json({ token, profile: safeUserProfile(user) });
  } catch (err) { next(err); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    const user = await q1('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const password_hash = hashPassword(password, user.password_salt);
    if (password_hash !== user.password_hash) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const token = await createSession(user.id);
    res.json({ token, profile: safeUserProfile(user) });
  } catch (err) { next(err); }
});

app.post('/api/auth/reset-password', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email и новый пароль обязательны' });
    }
    if (password.length < 6 || !/[A-ZА-Я]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов, заглавную букву и цифру' });
    }

    const user = await q1('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) {
      return res.status(400).json({ error: 'Не удалось восстановить пароль для этого email' });
    }

    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);
    await qr('UPDATE users SET password_hash = $1, password_salt = $2 WHERE id = $3', [passwordHash, salt, user.id]);
    await qr('DELETE FROM sessions WHERE user_id = $1', [user.id]);

    const updatedUser = await q1('SELECT * FROM users WHERE id = $1', [user.id]);
    const token = await createSession(user.id);
    res.json({ token, profile: safeUserProfile(updatedUser) });
  } catch (err) { next(err); }
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ profile: safeUserProfile(req.user) });
});

app.post('/api/auth/logout', authenticate, async (req, res, next) => {
  try {
    await qr('DELETE FROM sessions WHERE token = $1', [req.headers.authorization.slice(7)]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// --- Профиль ---
app.get('/api/profile', authenticate, (req, res) => {
  res.json({ profile: safeUserProfile(req.user) });
});

app.put('/api/profile', authenticate, async (req, res, next) => {
  try {
    const name = String(req.body.name || req.user.name).trim();
    const requestedUsername = req.body.hasOwnProperty('username') ? String(req.body.username || '').trim().toLowerCase() || null : req.user.username;
    const customization = req.body.hasOwnProperty('customization') ? (req.body.customization || {}) : req.user.customization || {};
    const settings = req.body.hasOwnProperty('settings') ? (req.body.settings || {}) : req.user.settings || {};
    const equipped = req.body.hasOwnProperty('equipped') ? req.body.equipped : req.user.equipped;
    const equippedAvatar = req.body.hasOwnProperty('equippedAvatar') ? req.body.equippedAvatar : req.user.equipped_avatar;

    if (req.body.hasOwnProperty('equipped') && equipped != null) {
      const inventory = normalizeInventoryItems(parseStoredJson(req.user.inventory, []));
      if (!inventory.includes(equipped)) {
        return res.status(400).json({ error: 'Предмет не куплен' });
      }
    }
    if (req.body.hasOwnProperty('equippedAvatar') && equippedAvatar != null) {
      const inventory = normalizeInventoryItems(parseStoredJson(req.user.inventory, []));
      const avatarId = normalizeEquippedAvatarValue(equippedAvatar);
      if (!avatarId || !inventory.includes(avatarId)) {
        return res.status(400).json({ error: 'Аватарка не куплена' });
      }
    }

    if (requestedUsername && !/^[a-zа-яё][a-z0-9а-яё_]{2,29}$/i.test(requestedUsername)) {
      return res.status(400).json({ error: 'Username: 3–30 символов, только буквы, цифры и _' });
    }

    try {
      if (requestedUsername) {
        const usernameOwner = await q1('SELECT id FROM users WHERE username = $1 AND id != $2', [requestedUsername, req.user.id]);
        if (usernameOwner) {
          return res.status(409).json({ error: 'Такой username уже занят' });
        }
      }

      await qr(
        'UPDATE users SET name = $1, username = $2, customization = $3, settings = $4, equipped = $5, equipped_avatar = $6 WHERE id = $7',
        [name, requestedUsername, JSON.stringify(customization), JSON.stringify(settings), equipped, equippedAvatar, req.user.id]
      );

      const updated = await q1('SELECT * FROM users WHERE id = $1', [req.user.id]);
      res.json({ profile: safeUserProfile(updated) });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({ error: 'Такой username уже занят' });
      }
      throw err;
    }
  } catch (err) { next(err); }
});

// Проверка доступности username
app.get('/api/profile/username-availability', async (req, res, next) => {
  try {
    const username = String(req.query.username || '').trim().toLowerCase();
    if (!username) {
      return res.json({ available: false, valid: false, reason: 'Введите username' });
    }
    if (!/^[a-zа-яё][a-z0-9а-яё_]{2,29}$/i.test(username)) {
      return res.json({ available: false, valid: false, reason: '3–30 символов: буквы, цифры и _' });
    }
    const existing = await q1('SELECT id FROM users WHERE username = $1', [username]);
    res.json({ available: !existing, valid: true, reason: existing ? 'Username уже занят' : 'Username свободен' });
  } catch (err) { next(err); }
});

// Смена email (сессии привязаны к id пользователя)
app.post('/api/profile/change-email', authenticate, async (req, res, next) => {
  try {
    const newEmail = normalizeEmail(req.body.newEmail);
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(newEmail)) {
      return res.status(400).json({ error: 'Некорректный email' });
    }
    if (newEmail === req.user.email) {
      return res.status(400).json({ error: 'Новый email совпадает с текущим' });
    }
    const existing = await q1('SELECT id FROM users WHERE email = $1', [newEmail]);
    if (existing) {
      return res.status(409).json({ error: 'Пользователь с таким email уже зарегистрирован' });
    }
    await qr('UPDATE users SET email = $1 WHERE id = $2', [newEmail, req.user.id]);
    const updated = await q1('SELECT * FROM users WHERE id = $1', [req.user.id]);
    res.json({ profile: safeUserProfile(updated) });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: 'Пользователь с таким email уже зарегистрирован' });
    }
    next(err);
  }
});

// --- Магазин ---
app.get('/api/shop/items', async (req, res, next) => {
  try {
    const items = await q('SELECT id, slug, name, price, type, metadata FROM items ORDER BY price ASC');
    const result = [];
    for (const item of items) {
      const metadata = JSON.parse(item.metadata || '{}');
      const limited = isLimitedItem(item);
      const stock = limited ? await getLimitedStock(item) : null;
      result.push({
        ...item,
        metadata,
        limited,
        stock: stock ? stock.remaining : null,
        soldOut: stock ? stock.soldOut : false
      });
    }
    res.json({ items: result });
  } catch (err) { next(err); }
});

app.post('/api/shop/buy', authenticate, async (req, res, next) => {
  try {
    const itemId = Number(req.body.itemId);
    const itemSlug = String(req.body.itemSlug || '').trim();
    const item = findItemCached(itemId, itemSlug);
    if (!item) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    // Лимитированные аватарки: если тираж распродан — покупка запрещена
    if (isLimitedItem(item) && (await getLimitedStock(item)).soldOut) {
      return res.status(400).json({ error: 'Распродано' });
    }

    const ownedKey = auraIdOf(item) || item.slug;

    const result = await withTransaction(async (client) => {
      // Оптимистичное обновление: значение монет вычисляем в JS и записываем
      // с проверкой текущего значения (WHERE coins = $old). При гонке —
      // повторная попытка. Монеты не могут уйти в минус.
      for (let attempt = 0; attempt < 3; attempt++) {
        const userRow = await client.query('SELECT * FROM users WHERE id = $1', [req.user.id]).then((r) => r.rows[0]);
        const inventory = JSON.parse(userRow.inventory || '[]');
        // Инвентарь хранит auraId (например, "gold"), поэтому проверяем и slug, и auraId
        if (inventory.includes(item.slug) || inventory.includes(ownedKey)) {
          return { error: 'Товар уже куплен', status: 409 };
        }
        const currentCoins = Number(userRow.coins);
        if (currentCoins < Number(item.price)) {
          return { error: 'Недостаточно монет', status: 400 };
        }

        const upd = await client.query(
          'UPDATE users SET coins = $1, inventory = $2 WHERE id = $3 AND coins = $4',
          [currentCoins - Number(item.price), JSON.stringify([...inventory, ownedKey]), req.user.id, currentCoins]
        );
        if (upd.rowCount === 1) {
          await client.query(
            'INSERT INTO purchases (user_id, item_id, amount, source) VALUES ($1, $2, $3, $4)',
            [req.user.id, item.id, Number(item.price), 'buy']
          );
          return { ok: true };
        }
      }
      return { error: 'Недостаточно монет', status: 400 };
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const updated = await q1('SELECT * FROM users WHERE id = $1', [req.user.id]);
    res.json({ profile: safeUserProfile(updated) });
  } catch (err) { next(err); }
});

// Открытие кейса (лоутбокса): списываем монеты и выдаём случайный приз
app.post('/api/shop/open', authenticate, async (req, res, next) => {
  try {
    const itemId = Number(req.body.itemId);
    const itemSlug = String(req.body.itemSlug || '').trim();
    const item = findItemCached(itemId, itemSlug);
    if (!item || item.type !== 'lootbox') {
      return res.status(404).json({ error: 'Кейс не найден' });
    }

    let metadata = {};
    try {
      metadata = JSON.parse(item.metadata || '{}');
    } catch (e) { /* ignore */ }
    const prizes = Array.isArray(metadata.prizes) ? metadata.prizes : [];
    if (prizes.length === 0) {
      return res.status(400).json({ error: 'В кейсе нет призов' });
    }

    // Взвешенный случайный выбор приза
    const totalWeight = prizes.reduce((sum, p) => sum + (Number(p.weight) > 0 ? Number(p.weight) : 1), 0);
    let roll = Math.random() * totalWeight;
    let wonPrize = prizes[prizes.length - 1];
    for (const prize of prizes) {
      roll -= (Number(prize.weight) > 0 ? Number(prize.weight) : 1);
      if (roll <= 0) {
        wonPrize = prize;
        break;
      }
    }

    const wonItem = itemsCache.bySlug.get(wonPrize.slug);
    if (!wonItem) {
      return res.status(500).json({ error: 'Приз из кейса не найден' });
    }
    const wonMetadata = (() => {
      try {
        return JSON.parse(wonItem.metadata || '{}');
      } catch (e) {
        return {};
      }
    })();
    const wonKey = wonMetadata.auraId || wonItem.slug;

    const result = await withTransaction(async (client) => {
      // Оптимистичное обновление монет с повторной попыткой при гонке
      for (let attempt = 0; attempt < 3; attempt++) {
        const userRow = await client.query('SELECT * FROM users WHERE id = $1', [req.user.id]).then((r) => r.rows[0]);
        const currentCoins = Number(userRow.coins);
        if (currentCoins < Number(item.price)) {
          return { error: 'Недостаточно монет', status: 400 };
        }
        const inventory = JSON.parse(userRow.inventory || '[]');
        if (!inventory.includes(wonKey)) inventory.push(wonKey);

        const upd = await client.query(
          'UPDATE users SET coins = $1, inventory = $2 WHERE id = $3 AND coins = $4',
          [currentCoins - Number(item.price), JSON.stringify(inventory), req.user.id, currentCoins]
        );
        if (upd.rowCount === 1) {
          await client.query(
            'INSERT INTO purchases (user_id, item_id, amount, source) VALUES ($1, $2, $3, $4)',
            [req.user.id, wonItem.id, Number(item.price), 'case']
          );
          return { ok: true };
        }
      }
      return { error: 'Недостаточно монет', status: 400 };
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const updated = await q1('SELECT * FROM users WHERE id = $1', [req.user.id]);
    res.json({
      ok: true,
      won: { id: wonKey, name: wonItem.name, image: wonMetadata.image || '' },
      profile: safeUserProfile(updated)
    });
  } catch (err) { next(err); }
});

// --- Награды за просмотр видео ---
app.post('/api/videos/reward', authenticate, async (req, res, next) => {
  try {
    const videoId = String(req.body.videoId || '').trim();
    if (!videoId) {
      return res.status(400).json({ error: 'ID видео обязателен' });
    }
    if (req.body.isShorts === true) {
      return res.status(400).json({ error: 'Shorts не участвуют в системе наград' });
    }

    const durationSeconds = Number(req.body.durationSeconds);
    const coins = Number.isFinite(durationSeconds) && durationSeconds >= 0 && durationSeconds < 300 ? 100 : 500;

    // Границы сегодняшнего дня в UTC (совпадает с логикой клиента)
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const result = await withTransaction(async (client) => {
      const existing = await client.query('SELECT 1 FROM video_rewards WHERE user_id = $1 AND video_id = $2 LIMIT 1', [req.user.id, videoId]).then((r) => r.rows[0]);
      if (existing) {
        return { error: 'Награда за это видео уже получена', status: 409 };
      }

      const todayCountRow = await client.query(
        'SELECT COUNT(*)::int AS cnt FROM video_rewards WHERE user_id = $1 AND rewarded_at >= $2 AND rewarded_at < $3',
        [req.user.id, dayStart.toISOString(), dayEnd.toISOString()]
      ).then((r) => r.rows[0]);
      if (Number(todayCountRow.cnt) >= 3) {
        return { error: 'Лимит наград за сегодня достигнут', status: 429 };
      }

      await client.query(
        'INSERT INTO video_rewards (user_id, video_id, coins, source) VALUES ($1, $2, $3, $4)',
        [req.user.id, videoId, coins, 'watch']
      );

      const userRow = await client.query('SELECT rewarded_videos, coins FROM users WHERE id = $1', [req.user.id]).then((r) => r.rows[0]);
      const rewardedVideos = parseStoredJson(userRow.rewarded_videos, []).map(String);
      if (!rewardedVideos.includes(String(videoId))) rewardedVideos.push(String(videoId));

      // Оптимистичное начисление монет
      const currentCoins = Number(userRow.coins);
      const upd = await client.query(
        'UPDATE users SET coins = $1, rewarded_videos = $2 WHERE id = $3 AND coins = $4',
        [currentCoins + coins, JSON.stringify(rewardedVideos), req.user.id, currentCoins]
      );
      if (upd.rowCount === 0) {
        return { error: 'Пользователь не найден', status: 401 };
      }
      return { ok: true };
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const updated = await q1('SELECT * FROM users WHERE id = $1', [req.user.id]);
    res.json({ coins, profile: safeUserProfile(updated) });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: 'Награда за это видео уже получена' });
    }
    next(err);
  }
});

app.get('/api/videos/history', authenticate, async (req, res, next) => {
  try {
    const rows = await q(
      'SELECT video_id, rewarded_at, coins, source FROM video_rewards WHERE user_id = $1 ORDER BY rewarded_at DESC',
      [req.user.id]
    );
    res.json({ history: rows });
  } catch (err) { next(err); }
});

// --- Админ-панель ---
app.post('/api/admin/auth', (req, res) => {
  const digest = String(req.body.digest || '').trim();
  if (digest && digest === ADMIN_PASS_HASH) {
    return res.json({ ok: true });
  }
  res.status(403).json({ error: 'Неверный секретный код' });
});

app.get('/api/admin/accounts', async (req, res, next) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  try {
    const rows = await q('SELECT id, email, name, coins, badges, created_at FROM users ORDER BY created_at DESC');
    res.json({
      accounts: rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        coins: Number.isFinite(Number(r.coins)) ? Number(r.coins) : STARTING_COINS,
        badges: parseStoredJson(r.badges, []),
        createdAt: r.created_at
      }))
    });
  } catch (err) { next(err); }
});

app.post('/api/admin/grant-coins', async (req, res, next) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  try {
    const email = normalizeEmail(req.body.email);
    const amount = Math.floor(Number(req.body.amount));
    if (!email || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Укажите email и положительную сумму монет' });
    }
    const user = await q1('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    const currentCoins = Number(user.coins);
    await qr('UPDATE users SET coins = $1 WHERE id = $2', [currentCoins + amount, user.id]);
    res.json({ ok: true, coins: currentCoins + amount });
  } catch (err) { next(err); }
});

app.post('/api/admin/badge', async (req, res, next) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  try {
    const email = normalizeEmail(req.body.email);
    const badgeId = String(req.body.badgeId || '').trim();
    const granted = Boolean(req.body.granted);
    const allowedBadges = ['official', 'beta-tester'];
    if (!email || !allowedBadges.includes(badgeId)) {
      return res.status(400).json({ error: 'Некорректные параметры' });
    }
    const user = await q1('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    const badges = parseStoredJson(user.badges, []);
    const next = granted
      ? [...new Set([...badges, badgeId])]
      : badges.filter((b) => b !== badgeId);
    await qr('UPDATE users SET badges = $1 WHERE id = $2', [JSON.stringify(next), user.id]);
    res.json({ ok: true, badges: next });
  } catch (err) { next(err); }
});

// Статистика сайта для админ-панели
app.get('/api/admin/stats', async (req, res, next) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  try {
    const usersRow = await q1('SELECT COUNT(*)::int AS count FROM users');
    const coinsRow = await q1('SELECT COALESCE(SUM(coins), 0)::int AS total FROM users');
    const purchasesRow = await q1('SELECT COUNT(*)::int AS count FROM purchases');
    const casesRow = await q1(`SELECT COUNT(*)::int AS count FROM purchases WHERE source = 'case'`);
    const rewardsRow = await q1('SELECT COALESCE(SUM(coins), 0)::int AS total FROM video_rewards');
    res.json({
      users: Number(usersRow && usersRow.count) || 0,
      totalCoins: Number(coinsRow && coinsRow.total) || 0,
      purchases: Number(purchasesRow && purchasesRow.count) || 0,
      casesOpened: Number(casesRow && casesRow.count) || 0,
      rewardedCoins: Number(rewardsRow && rewardsRow.total) || 0
    });
  } catch (err) { next(err); }
});

// История покупок пользователя
app.get('/api/admin/purchases', async (req, res, next) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  try {
    const email = normalizeEmail(req.query.email);
    if (!email) return res.status(400).json({ error: 'Укажите email пользователя' });
    const user = await q1('SELECT id FROM users WHERE email = $1', [email]);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    const rows = await q(`
      SELECT p.id, p.amount, p.created_at, i.slug, i.name, i.type, i.metadata
      FROM purchases p
      JOIN items i ON i.id = p.item_id
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
      LIMIT 200`, [user.id]);
    res.json({
      purchases: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        type: r.type,
        amount: Number(r.amount),
        createdAt: r.created_at,
        metadata: parseStoredJson(r.metadata, {})
      }))
    });
  } catch (err) { next(err); }
});

// Выдача / изъятие предмета из инвентаря пользователя
app.post('/api/admin/inventory', async (req, res, next) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  try {
    const email = normalizeEmail(req.body.email);
    const action = String(req.body.action || '').trim(); // 'grant' | 'remove'
    const itemSlug = String(req.body.itemSlug || '').trim();
    if (!email || !['grant', 'remove'].includes(action) || !itemSlug) {
      return res.status(400).json({ error: 'Укажите email, действие (grant/remove) и itemSlug' });
    }
    const item = findItemCached(null, itemSlug);
    if (!item) return res.status(404).json({ error: 'Предмет не найден' });
    const user = await q1('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const inventory = parseStoredJson(user.inventory, []);
    const key = auraIdOf(item) || item.slug;
    const nextInventory = action === 'grant'
      ? (inventory.includes(key) ? inventory : [...inventory, key])
      : inventory.filter((k) => k !== key);

    await qr('UPDATE users SET inventory = $1 WHERE id = $2', [JSON.stringify(nextInventory), user.id]);
    res.json({ ok: true, inventory: nextInventory });
  } catch (err) { next(err); }
});

// ===== SPA-фолбэк (все неизвестные пути отдают главную страницу) =====
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ===== Централизованный обработчик ошибок =====
app.use((err, req, res, next) => {
  console.error('Ошибка сервера:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// ===== Старт: сначала инициализируем БД, затем слушаем порт =====
const port = process.env.PORT || 3000;

initDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server listening at http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error('Не удалось инициализировать базу данных:', err);
    process.exit(1);
  });
