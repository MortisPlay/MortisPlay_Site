const express = require('express');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const app = express();
// Единая база данных всего сайта (SQLite). На хостинге путь можно задать
// переменной окружения DB_PATH, иначе используется data.db рядом с сервером.
const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'data.db');
const db = new Database(dbPath);
const STARTING_COINS = 1000;
const LIMITED_STOCK = 10; // Лимит продаж для аватарок «Ограниченный выпуск»
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
// SHA-256 хеш секретного кода админ-панели (тот же, что использовался на клиенте).
const ADMIN_PASS_HASH = 'd245fec3edca3b4648991d99fabf4f1f1a295a6a816e1cb78b50df3ad8ec8bd2';

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

function normalizeInventoryItems(rawInventory) {
  const inventory = Array.isArray(rawInventory) ? rawInventory : [];
  const allItems = db.prepare('SELECT metadata FROM items').all();
  const findByAuraId = (value) => allItems.find((it) => {
    try {
      return JSON.parse(it.metadata || '{}').auraId === value;
    } catch (e) {
      return false;
    }
  });
  return inventory.map((entry) => {
    const item = db.prepare('SELECT metadata FROM items WHERE slug = ?').get(entry);
    if (item) {
      try {
        const metadata = JSON.parse(item.metadata || '{}');
        return metadata.auraId || entry;
      } catch (e) {
        return entry;
      }
    }
    const fallback = findByAuraId(entry);
    if (fallback) {
      try {
        const metadata = JSON.parse(fallback.metadata || '{}');
        return metadata.auraId || entry;
      } catch (e) {
        return entry;
      }
    }
    return entry;
  });
}

function normalizeEquippedValue(value) {
  if (!value) return null;
  const item = db.prepare('SELECT metadata FROM items WHERE slug = ?').get(value);
  if (item) {
    try {
      const metadata = JSON.parse(item.metadata || '{}');
      return metadata.auraId || value;
    } catch (e) {
      return value;
    }
  }
  const allItems = db.prepare('SELECT metadata FROM items').all();
  const fallback = allItems.find((it) => {
    try {
      return JSON.parse(it.metadata || '{}').auraId === value;
    } catch (e) {
      return false;
    }
  });
  if (fallback) {
    try {
      const metadata = JSON.parse(fallback.metadata || '{}');
      return metadata.auraId || value;
    } catch (e) {
      return value;
    }
  }
  return value;
}

function normalizeEquippedAvatarValue(value) {
  if (!value) return null;
  const item = db.prepare('SELECT slug, type, metadata FROM items WHERE slug = ?').get(value);
  const candidates = item ? [item] : db.prepare('SELECT slug, type, metadata FROM items').all();
  const match = candidates.find((candidate) => {
    try {
      const metadata = JSON.parse(candidate.metadata || '{}');
      return candidate.type === 'avatar' && (candidate.slug === value || metadata.auraId === value);
    } catch (e) {
      return false;
    }
  });
  if (!match) return null;
  try {
    const metadata = JSON.parse(match.metadata || '{}');
    return metadata.auraId || match.slug;
  } catch (e) {
    return match.slug;
  }
}

function parseStoredJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
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

function createSession(userId) {
  const token = createToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare('INSERT INTO sessions (user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(userId, token, expiresAt, new Date().toISOString());
  return token;
}

function getSessionByToken(token) {
  if (!token) return null;
  return db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const session = getSessionByToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  if (new Date(session.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
    return res.status(401).json({ error: 'Сессия устарела' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
  if (!user) {
    return res.status(401).json({ error: 'Пользователь не найден' });
  }
  db.prepare('UPDATE sessions SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), session.id);
  req.user = user;
  req.session = session;
  next();
}

// === Ограниченные выпуски: лимит продаж (по умолчанию 10 шт) ===
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

function getLimitedStock(item) {
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM purchases WHERE item_id = ?').get(item.id);
  const sold = Number(row && row.cnt) || 0;
  return { sold, remaining: Math.max(0, LIMITED_STOCK - sold), soldOut: sold >= LIMITED_STOCK };
}

function seedShopItems() {
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
    } }
  ];

  const insertStmt = db.prepare('INSERT INTO items (slug, name, price, type, metadata) VALUES (?, ?, ?, ?, ?)');
  const checkStmt = db.prepare('SELECT COUNT(*) AS count FROM items WHERE slug = ?');

  for (const item of items) {
    const exists = checkStmt.get(item.slug);
    if (exists && exists.count > 0) continue;
    insertStmt.run(item.slug, item.name, item.price, item.type, JSON.stringify(item.metadata || {}));
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Таблицы
const createStatements = [
  `CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    username TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    type TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}'
  )`,
  `CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (item_id) REFERENCES items(id)
  )`,
  `CREATE TABLE IF NOT EXISTS video_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    video_id TEXT NOT NULL,
    rewarded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    coins INTEGER NOT NULL,
    source TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`
];
for (const stmt of createStatements) {
  db.prepare(stmt).run();
}

// Миграция существующей data.db: добавляем недостающие колонки, чтобы
// единая база работала с профилем, монетами, инвентарём и бейджами.
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!columns.includes(column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}
ensureColumn('users', 'customization', "TEXT NOT NULL DEFAULT '{}'");
ensureColumn('users', 'badges', "TEXT NOT NULL DEFAULT '[]'");
ensureColumn('users', 'settings', "TEXT NOT NULL DEFAULT '{}'");
ensureColumn('users', 'coins', `INTEGER NOT NULL DEFAULT ${STARTING_COINS}`);
ensureColumn('users', 'inventory', "TEXT NOT NULL DEFAULT '[]'");
ensureColumn('users', 'equipped', 'TEXT');
ensureColumn('users', 'equipped_avatar', 'TEXT');
ensureColumn('users', 'username', 'TEXT');
ensureColumn('users', 'rewarded_videos', "TEXT NOT NULL DEFAULT '[]'");

// Переносим аватарки, экипированные в старом поле equipped, в equipped_avatar
db.prepare(`
  UPDATE users
  SET equipped_avatar = equipped, equipped = NULL
  WHERE equipped IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM items
      WHERE items.type = 'avatar'
        AND (items.slug = users.equipped OR json_extract(items.metadata, '$.auraId') = users.equipped)
    )
`).run();

db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)').run();

seedShopItems();

app.get('/api/notes', (req, res) => {
  const notes = db.prepare('SELECT * FROM notes ORDER BY created_at DESC').all();
  res.json(notes);
});

app.post('/api/notes', (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }
  const info = db.prepare('INSERT INTO notes (text) VALUES (?)').run(text);
  res.status(201).json({ id: info.lastInsertRowid, text, created_at: new Date().toISOString() });
});

app.post('/api/auth/register', (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Имя, email и пароль обязательны' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'Пользователь с таким email уже зарегистрирован' });
  }

  const salt = generateSalt();
  const password_hash = hashPassword(password, salt);
  const info = db.prepare(
    'INSERT INTO users (email, name, password_hash, password_salt, customization, badges, settings, coins, inventory, equipped, rewarded_videos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    email,
    name,
    password_hash,
    salt,
    JSON.stringify({}),
    JSON.stringify([]),
    JSON.stringify({}),
    STARTING_COINS,
    JSON.stringify([]),
    null,
    JSON.stringify([])
  );

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = createSession(user.id);
  res.status(201).json({ token, profile: safeUserProfile(user) });
});

app.post('/api/auth/login', (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email и пароль обязательны' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  const password_hash = hashPassword(password, user.password_salt);
  if (password_hash !== user.password_hash) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  const token = createSession(user.id);
  res.json({ token, profile: safeUserProfile(user) });
});

app.post('/api/auth/reset-password', (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email и новый пароль обязательны' });
  }
  if (password.length < 6 || !/[A-ZА-Я]/.test(password) || !/[0-9]/.test(password)) {
    return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов, заглавную букву и цифру' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(400).json({ error: 'Не удалось восстановить пароль для этого email' });
  }

  const salt = generateSalt();
  const passwordHash = hashPassword(password, salt);
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?')
    .run(passwordHash, salt, user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);

  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  const token = createSession(user.id);
  res.json({ token, profile: safeUserProfile(updatedUser) });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ profile: safeUserProfile(req.user) });
});

app.post('/api/auth/logout', authenticate, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.headers.authorization.slice(7));
  res.json({ ok: true });
});

app.get('/api/profile', authenticate, (req, res) => {
  res.json({ profile: safeUserProfile(req.user) });
});

app.put('/api/profile', authenticate, (req, res) => {
  const name = String(req.body.name || req.user.name).trim();
  const requestedUsername = req.body.hasOwnProperty('username') ? String(req.body.username || '').trim().toLowerCase() || null : req.user.username;
  const customization = req.body.hasOwnProperty('customization') ? (req.body.customization || {}) : req.user.customization || {};
  const settings = req.body.hasOwnProperty('settings') ? (req.body.settings || {}) : req.user.settings || {};
  const equipped = req.body.hasOwnProperty('equipped') ? req.body.equipped : req.user.equipped;
  const equippedAvatar = req.body.hasOwnProperty('equippedAvatar') ? req.body.equippedAvatar : req.user.equipped_avatar;

  if (req.body.hasOwnProperty('equipped') && equipped != null) {
    const inventory = normalizeInventoryItems(JSON.parse(req.user.inventory || '[]'));
    if (!inventory.includes(equipped)) {
      return res.status(400).json({ error: 'Предмет не куплен' });
    }
  }
  if (req.body.hasOwnProperty('equippedAvatar') && equippedAvatar != null) {
    const inventory = normalizeInventoryItems(JSON.parse(req.user.inventory || '[]'));
    const avatarId = normalizeEquippedAvatarValue(equippedAvatar);
    if (!avatarId || !inventory.includes(avatarId)) {
      return res.status(400).json({ error: 'Аватарка не куплена' });
    }
  }

  if (requestedUsername && !/^[a-zа-яё][a-z0-9а-яё_]{2,29}$/i.test(requestedUsername)) {
    return res.status(400).json({ error: 'Username: 3–30 символов, только буквы, цифры и _' });
  }
  if (requestedUsername) {
    const usernameOwner = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(requestedUsername, req.user.id);
    if (usernameOwner) {
      return res.status(409).json({ error: 'Такой username уже занят' });
    }
  }

  db.prepare('UPDATE users SET name = ?, username = ?, customization = ?, settings = ?, equipped = ?, equipped_avatar = ? WHERE id = ?')
    .run(name, requestedUsername, JSON.stringify(customization), JSON.stringify(settings), equipped, equippedAvatar, req.user.id);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ profile: safeUserProfile(updated) });
});

// Проверка доступности username
app.get('/api/profile/username-availability', (req, res) => {
  const username = String(req.query.username || '').trim().toLowerCase();
  if (!username) {
    return res.json({ available: false, valid: false, reason: 'Введите username' });
  }
  if (!/^[a-zа-яё][a-z0-9а-яё_]{2,29}$/i.test(username)) {
    return res.json({ available: false, valid: false, reason: '3–30 символов: буквы, цифры и _' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  res.json({ available: !existing, valid: true, reason: existing ? 'Username уже занят' : 'Username свободен' });
});

app.get('/api/shop/items', (req, res) => {
  const items = db.prepare('SELECT id, slug, name, price, type, metadata FROM items ORDER BY price ASC').all();
  res.json({
    items: items.map(item => {
      const metadata = JSON.parse(item.metadata || '{}');
      const limited = isLimitedItem(item);
      const stock = limited ? getLimitedStock(item) : null;
      return {
        ...item,
        metadata,
        limited,
        stock: stock ? stock.remaining : null,
        soldOut: stock ? stock.soldOut : false
      };
    })
  });
});

app.post('/api/shop/buy', authenticate, (req, res) => {
  const itemId = Number(req.body.itemId);
  const itemSlug = String(req.body.itemSlug || '').trim();
  let item = null;

  if (itemId) {
    item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
  }
  if (!item && itemSlug) {
    item = db.prepare('SELECT * FROM items WHERE slug = ?').get(itemSlug);
  }
  if (!item && itemSlug) {
    const allItems = db.prepare('SELECT * FROM items').all();
    item = allItems.find((it) => {
      try {
        const metadata = JSON.parse(it.metadata || '{}');
        return metadata.auraId === itemSlug;
      } catch (e) {
        return false;
      }
    });
  }
  if (!item) {
    return res.status(404).json({ error: 'Товар не найден' });
  }

  // Лимитированные аватарки: если тираж распродан — покупка запрещена
  if (isLimitedItem(item) && getLimitedStock(item).soldOut) {
    return res.status(400).json({ error: 'Распродано' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const inventory = JSON.parse(user.inventory || '[]');
  // Инвентарь хранит auraId (например, "gold"), поэтому проверяем и slug, и auraId
  const ownedKey = (() => {
    try {
      return JSON.parse(item.metadata || '{}').auraId || item.slug;
    } catch (e) {
      return item.slug;
    }
  })();
  if (inventory.includes(item.slug) || inventory.includes(ownedKey)) {
    return res.status(409).json({ error: 'Товар уже куплен' });
  }

  if (user.coins < item.price) {
    return res.status(400).json({ error: 'Недостаточно монет' });
  }

  const inventoryEntry = (() => {
    try {
      const metadata = JSON.parse(item.metadata || '{}');
      return metadata.auraId || item.slug;
    } catch (e) {
      return item.slug;
    }
  })();
  inventory.push(inventoryEntry);
  db.prepare('UPDATE users SET coins = coins - ?, inventory = ? WHERE id = ?')
    .run(item.price, JSON.stringify(inventory), req.user.id);
  db.prepare('INSERT INTO purchases (user_id, item_id, amount) VALUES (?, ?, ?)')
    .run(req.user.id, item.id, item.price);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ profile: safeUserProfile(updated) });
});

// Открытие кейса (лоутбокса): списываем монеты и выдаём случайный приз
app.post('/api/shop/open', authenticate, (req, res) => {
  const itemId = Number(req.body.itemId);
  const itemSlug = String(req.body.itemSlug || '').trim();
  let item = null;

  if (itemId) {
    item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
  }
  if (!item && itemSlug) {
    item = db.prepare('SELECT * FROM items WHERE slug = ?').get(itemSlug);
  }
  if (!item && itemSlug) {
    const allItems = db.prepare('SELECT * FROM items').all();
    item = allItems.find((it) => {
      try {
        return JSON.parse(it.metadata || '{}').auraId === itemSlug;
      } catch (e) {
        return false;
      }
    });
  }
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

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (Number(user.coins) < Number(item.price)) {
    return res.status(400).json({ error: 'Недостаточно монет' });
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

  const wonItem = db.prepare('SELECT * FROM items WHERE slug = ?').get(wonPrize.slug);
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

  const inventory = JSON.parse(user.inventory || '[]');
  if (!inventory.includes(wonKey)) {
    inventory.push(wonKey);
  }
  db.prepare('UPDATE users SET coins = coins - ?, inventory = ? WHERE id = ?')
    .run(item.price, JSON.stringify(inventory), req.user.id);
  db.prepare('INSERT INTO purchases (user_id, item_id, amount) VALUES (?, ?, ?)')
    .run(req.user.id, wonItem.id, item.price);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({
    ok: true,
    won: { id: wonKey, name: wonItem.name, image: wonMetadata.image || '' },
    profile: safeUserProfile(updated)
  });
});

app.post('/api/videos/reward', authenticate, (req, res) => {
  const videoId = String(req.body.videoId || '').trim();
  if (!videoId) {
    return res.status(400).json({ error: 'ID видео обязателен' });
  }
  if (req.body.isShorts === true) {
    return res.status(400).json({ error: 'Shorts не участвуют в системе наград' });
  }

  const existing = db.prepare('SELECT COUNT(*) AS cnt FROM video_rewards WHERE user_id = ? AND video_id = ?').get(req.user.id, videoId);
  if (existing.cnt > 0) {
    return res.status(409).json({ error: 'Награда за это видео уже получена' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = db.prepare(
    'SELECT COUNT(*) AS cnt FROM video_rewards WHERE user_id = ? AND DATE(rewarded_at) = ?'
  ).get(req.user.id, today).cnt;

  if (todayCount >= 3) {
    return res.status(429).json({ error: 'Лимит наград за сегодня достигнут' });
  }

  const durationSeconds = Number(req.body.durationSeconds);
  const coins = Number.isFinite(durationSeconds) && durationSeconds >= 0 && durationSeconds < 300 ? 100 : 500;
  db.prepare('INSERT INTO video_rewards (user_id, video_id, coins, source) VALUES (?, ?, ?, ?)')
    .run(req.user.id, videoId, coins, 'watch');

  // Обновляем список награждённых видео в профиле пользователя
  const user = db.prepare('SELECT rewarded_videos FROM users WHERE id = ?').get(req.user.id);
  const rewardedVideos = parseStoredJson(user.rewarded_videos, []).map(String);
  if (!rewardedVideos.includes(String(videoId))) rewardedVideos.push(String(videoId));
  db.prepare('UPDATE users SET coins = coins + ?, rewarded_videos = ? WHERE id = ?')
    .run(coins, JSON.stringify(rewardedVideos), req.user.id);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ coins, profile: safeUserProfile(updated) });
});

app.get('/api/videos/history', authenticate, (req, res) => {
  const rows = db.prepare('SELECT video_id, rewarded_at, coins, source FROM video_rewards WHERE user_id = ? ORDER BY rewarded_at DESC').all(req.user.id);
  res.json({ history: rows });
});

// === АДМИН-ПАНЕЛЬ (данные живут в той же единой базе data.db) ===
app.post('/api/admin/auth', (req, res) => {
  const digest = String(req.body.digest || '').trim();
  if (digest && digest === ADMIN_PASS_HASH) {
    return res.json({ ok: true });
  }
  res.status(403).json({ error: 'Неверный секретный код' });
});

app.get('/api/admin/accounts', (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const rows = db.prepare('SELECT id, email, name, coins, badges, created_at FROM users ORDER BY created_at DESC').all();
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
});

app.post('/api/admin/grant-coins', (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const email = normalizeEmail(req.body.email);
  const amount = Math.floor(Number(req.body.amount));
  if (!email || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Укажите email и положительную сумму монет' });
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(amount, user.id);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  res.json({ ok: true, coins: Number(updated.coins) });
});

app.post('/api/admin/badge', (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const email = normalizeEmail(req.body.email);
  const badgeId = String(req.body.badgeId || '').trim();
  const granted = Boolean(req.body.granted);
  const allowedBadges = ['official', 'beta-tester'];
  if (!email || !allowedBadges.includes(badgeId)) {
    return res.status(400).json({ error: 'Некорректные параметры' });
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  const badges = parseStoredJson(user.badges, []);
  const next = granted
    ? [...new Set([...badges, badgeId])]
    : badges.filter((b) => b !== badgeId);
  db.prepare('UPDATE users SET badges = ? WHERE id = ?').run(JSON.stringify(next), user.id);
  res.json({ ok: true, badges: next });
});

// Смена email (единая база, сессии привязаны к id пользователя)
app.post('/api/profile/change-email', authenticate, (req, res) => {
  const newEmail = normalizeEmail(req.body.newEmail);
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(newEmail)) {
    return res.status(400).json({ error: 'Некорректный email' });
  }
  if (newEmail === req.user.email) {
    return res.status(400).json({ error: 'Новый email совпадает с текущим' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(newEmail);
  if (existing) {
    return res.status(409).json({ error: 'Пользователь с таким email уже зарегистрирован' });
  }
  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(newEmail, req.user.id);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ profile: safeUserProfile(updated) });
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
