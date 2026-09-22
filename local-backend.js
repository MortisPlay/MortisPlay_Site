/**
 * local-backend.js — локальный «бэкенд» для статического хостинга (GitHub Pages).
 *
 * Временно заменяет Express + PostgreSQL: аккаунты, профиль, монеты, инвентарь,
 * покупки, кейсы и видео-награды хранятся в localStorage конкретного браузера.
 *
 * Как работает:
 *   - Перехватывает window.fetch: любые запросы на /api/* обрабатываются локально
 *     (тот же контракт, что был у server.js), все остальные запросы
 *     (YouTube, GitHub, EmailJS и т.п.) уходят в сеть как раньше.
 *   - Страницы НЕ нужно переписывать под localStorage — они продолжают вызывать fetch.
 *   - Админ-панель временно скрыта: ей нужна общая база всех пользователей.
 *
 * Ограничения (временный режим):
 *   - Профиль привязан к браузеру/устройству (нет синхронизации между ПК и телефоном).
 *   - Очистка данных браузера = потеря прогресса.
 *   - Пароли хешируются на клиенте — это декоративная защита, не безопасность.
 */
(function () {
  'use strict';

  // ===== Ключи localStorage (совместимы со старыми ключами сайта) =====
  var ACCOUNTS_KEY = 'site-accounts';
  var PROFILE_KEY = 'profile-user';
  var AUTH_TOKEN_KEY = 'auth-token'; // тот же ключ, что используют страницы
  var SESSIONS_KEY = 'mp-sessions';  // token -> email
  var SHOP_STATS_KEY = 'mp-shop-stats'; // продажи лимиток/кейсов на этом устройстве

  var STARTING_COINS = 1000;
  var LIMITED_STOCK = 10; // тираж «Ограниченного выпуска»

  // ===== Каталог товаров (копия витрины из server.js / seedShopItems) =====
  var ITEMS = [
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
    // Ограниченные выпуски (assets2/)
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

  // Индексы каталога: по slug и по auraId
  var BY_SLUG = {};
  var BY_AURA = {};
  ITEMS.forEach(function (item, index) {
    item.id = index + 1;
    BY_SLUG[item.slug] = item;
    if (item.metadata && item.metadata.auraId) {
      if (!BY_AURA[item.metadata.auraId]) BY_AURA[item.metadata.auraId] = item;
    }
  });

  function findItem(itemId, itemSlug) {
    if (itemId != null) {
      var byId = ITEMS.find(function (i) { return Number(i.id) === Number(itemId); });
      if (byId) return byId;
    }
    if (itemSlug) return BY_SLUG[itemSlug] || BY_AURA[itemSlug] || null;
    return null;
  }

  function itemKey(item) {
    return (item.metadata && item.metadata.auraId) || item.slug;
  }

  function isLimitedItem(item) {
    if (!item) return false;
    var slug = String(item.slug || '');
    var auraId = String((item.metadata && item.metadata.auraId) || '');
    return Boolean(item.metadata && item.metadata.limited) || slug.indexOf('limited_avatar') === 0 || auraId.indexOf('limitedAvatar') === 0;
  }

  // ===== Утилиты хранения =====
  function jsonGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function jsonSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* квота/приватный режим — игнорируем */ }
  }

  function getAccounts() { return jsonGet(ACCOUNTS_KEY, {}); }
  function saveAccounts(accounts) { jsonSet(ACCOUNTS_KEY, accounts); }

  function getSessions() { return jsonGet(SESSIONS_KEY, {}); }
  function saveSessions(sessions) { jsonSet(SESSIONS_KEY, sessions); }

  function getShopStats() { return jsonGet(SHOP_STATS_KEY, { sold: {} }); }
  function saveShopStats(stats) { jsonSet(SHOP_STATS_KEY, stats); }

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function randomToken() {
    try {
      var bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    } catch (e) {
      return 'tok_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
    }
  }

  // Лёгкий хеш-фолбэк для небезопасных контекстов (file:// и т.п.)
  function fallbackHash(str) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  }

  function sha256Hex(text) {
    var data = new TextEncoder().encode(text);
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
      return crypto.subtle.digest('SHA-256', data).then(function (buffer) {
        var bytes = new Uint8Array(buffer);
        var hex = '';
        for (var i = 0; i < bytes.length; i++) hex += ('0' + bytes[i].toString(16)).slice(-2);
        return hex;
      }).catch(function () {
        return Promise.resolve(fallbackHash(text));
      });
    }
    return Promise.resolve(fallbackHash(text));
  }

  function hashPassword(password, salt) {
    return sha256Hex(salt + ':' + String(password) + ':' + salt);
  }

  // ===== Публичный профиль (контракт safeUserProfile из server.js) =====
  function publicProfile(account) {
    if (!account) return null;
    return {
      id: account.id,
      email: account.email,
      name: account.name,
      username: account.username || null,
      createdAt: account.createdAt,
      customization: account.customization || {},
      badges: account.badges || [],
      settings: account.settings || {},
      coins: Number.isFinite(Number(account.coins)) ? Number(account.coins) : STARTING_COINS,
      inventory: Array.isArray(account.inventory) ? account.inventory.slice() : [],
      equipped: account.equipped || null,
      equippedAvatar: account.equippedAvatar || null,
      rewardedVideos: Array.isArray(account.rewardedVideos) ? account.rewardedVideos.slice() : []
    };
  }

  function saveActiveProfile(profile) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (e) {}
  }

  function clearActiveSession() {
    try {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(PROFILE_KEY);
    } catch (e) {}
  }

  // ===== Сессии =====
  function currentSessionEmail() {
    try {
      var token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) return null;
      return getSessions()[token] || null;
    } catch (e) {
      return null;
    }
  }

  function requireAccount() {
    var email = currentSessionEmail();
    if (!email) {
      var err = new Error('Требуется авторизация');
      err.status = 401;
      throw err;
    }
    var account = getAccounts()[email];
    if (!account) {
      var err2 = new Error('Сессия устарела');
      err2.status = 401;
      throw err2;
    }
    return account;
  }

  function createSession(email) {
    var token = randomToken();
    var sessions = getSessions();
    sessions[token] = email;
    saveSessions(sessions);
    try { localStorage.setItem(AUTH_TOKEN_KEY, token); } catch (e) {}
    return token;
  }

  function destroySession() {
    try {
      var token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (token) {
        var sessions = getSessions();
        delete sessions[token];
        saveSessions(sessions);
      }
    } catch (e) {}
    clearActiveSession();
  }

  // ===== Ответы, совместимые с fetch =====
  function makeResponse(status, data) {
    var text = JSON.stringify(data == null ? {} : data);
    return {
      ok: status >= 200 && status < 300,
      status: status,
      statusText: status === 200 ? 'OK' : status === 201 ? 'Created' : status === 400 ? 'Bad Request' : status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : status === 404 ? 'Not Found' : status === 409 ? 'Conflict' : status === 429 ? 'Too Many Requests' : status === 500 ? 'Internal Server Error' : 'Error',
      url: '',
      json: function () { return Promise.resolve(data); },
      text: function () { return Promise.resolve(text); }
    };
  }

  function errorResponse(status, message) {
    return makeResponse(status, { error: message });
  }

  // ===== Хендлеры эндпоинтов =====

  // POST /api/auth/register
  async function handleRegister(body) {
    var name = String(body.name || '').trim();
    var email = normalizeEmail(body.email);
    var password = String(body.password || '');
    if (!name || !email || !password) {
      return errorResponse(400, 'Имя, email и пароль обязательны');
    }
    var accounts = getAccounts();
    if (accounts[email]) {
      return errorResponse(409, 'Пользователь с таким email уже зарегистрирован');
    }
    var salt = randomToken();
    var passwordHash = await hashPassword(password, salt);
    var account = {
      id: Object.keys(accounts).length + 1,
      email: email,
      name: name,
      username: null,
      createdAt: new Date().toISOString(),
      passwordHash: passwordHash,
      passwordSalt: salt,
      customization: {},
      badges: [],
      settings: {},
      coins: STARTING_COINS,
      inventory: [],
      equipped: null,
      equippedAvatar: null,
      rewardedVideos: [],
      purchases: [],
      videoHistory: []
    };
    accounts[email] = account;
    saveAccounts(accounts);
    var token = createSession(email);
    var profile = publicProfile(account);
    saveActiveProfile(profile);
    return makeResponse(201, { token: token, profile: profile });
  }

  // POST /api/auth/login
  async function handleLogin(body) {
    var email = normalizeEmail(body.email);
    var password = String(body.password || '');
    if (!email || !password) {
      return errorResponse(400, 'Email и пароль обязательны');
    }
    var account = getAccounts()[email];
    if (!account) {
      return errorResponse(401, 'Неверный email или пароль');
    }
    var passwordHash = await hashPassword(password, account.passwordSalt);
    if (passwordHash !== account.passwordHash) {
      return errorResponse(401, 'Неверный email или пароль');
    }
    var token = createSession(email);
    var profile = publicProfile(account);
    saveActiveProfile(profile);
    return makeResponse(200, { token: token, profile: profile });
  }

  // POST /api/auth/reset-password
  async function handleResetPassword(body) {
    var email = normalizeEmail(body.email);
    var password = String(body.password || '');
    if (!email || !password) {
      return errorResponse(400, 'Email и новый пароль обязательны');
    }
    if (password.length < 6 || !/[A-ZА-Я]/.test(password) || !/[0-9]/.test(password)) {
      return errorResponse(400, 'Пароль должен содержать минимум 6 символов, заглавную букву и цифру');
    }
    var accounts = getAccounts();
    var account = accounts[email];
    if (!account) {
      return errorResponse(400, 'Не удалось восстановить пароль для этого email');
    }
    var salt = randomToken();
    account.passwordSalt = salt;
    account.passwordHash = await hashPassword(password, salt);
    accounts[email] = account;
    saveAccounts(accounts);
    // Инвалидируем все сессии этого пользователя
    var sessions = getSessions();
    Object.keys(sessions).forEach(function (token) {
      if (sessions[token] === email) delete sessions[token];
    });
    saveSessions(sessions);
    var token = createSession(email);
    var profile = publicProfile(account);
    saveActiveProfile(profile);
    return makeResponse(200, { token: token, profile: profile });
  }

  // POST /api/auth/logout
  function handleLogout() {
    destroySession();
    return makeResponse(200, { ok: true });
  }

  // GET /api/auth/me и GET /api/profile
  function handleMe() {
    var account = requireAccount();
    return makeResponse(200, { profile: publicProfile(account) });
  }

  // PUT /api/profile
  function handlePutProfile(body) {
    var account = requireAccount();
    var profile = publicProfile(account);

    var name = body.hasOwnProperty('name') ? String(body.name || '').trim() : profile.name;
    var hasUsername = body.hasOwnProperty('username');
    var requestedUsername = hasUsername ? (String(body.username || '').trim().toLowerCase() || null) : profile.username;
    var customization = body.hasOwnProperty('customization') ? (body.customization || {}) : profile.customization;
    var settings = body.hasOwnProperty('settings') ? (body.settings || {}) : profile.settings;
    var equipped = body.hasOwnProperty('equipped') ? body.equipped : profile.equipped;
    var equippedAvatar = body.hasOwnProperty('equippedAvatar') ? body.equippedAvatar : profile.equippedAvatar;

    // Проверка: можно надеть только купленный предмет
    if (body.hasOwnProperty('equipped') && equipped != null) {
      if (!profile.inventory.includes(equipped)) {
        return errorResponse(400, 'Предмет не куплен');
      }
    }
    if (body.hasOwnProperty('equippedAvatar') && equippedAvatar != null) {
      var avatarItem = BY_AURA[equippedAvatar] || BY_SLUG[equippedAvatar];
      if (!avatarItem || avatarItem.type !== 'avatar' || !profile.inventory.includes(equippedAvatar)) {
        return errorResponse(400, 'Аватарка не куплена');
      }
    }

    if (requestedUsername && !/^[a-zа-яё][a-z0-9а-яё_]{2,29}$/i.test(requestedUsername)) {
      return errorResponse(400, 'Username: 3–30 символов, только буквы, цифры и _');
    }

    var accounts = getAccounts();
    if (requestedUsername) {
      var taken = Object.keys(accounts).some(function (email) {
        var acc = accounts[email];
        return acc.email !== account.email && acc.username === requestedUsername;
      });
      if (taken) {
        return errorResponse(409, 'Такой username уже занят');
      }
    }

    account.name = name;
    account.username = requestedUsername;
    account.customization = customization;
    account.settings = settings;
    account.equipped = equipped;
    account.equippedAvatar = equippedAvatar;
    accounts[account.email] = account;
    saveAccounts(accounts);

    var updatedProfile = publicProfile(account);
    saveActiveProfile(updatedProfile);
    return makeResponse(200, { profile: updatedProfile });
  }

  // POST /api/profile/change-email
  function handleChangeEmail(body) {
    var account = requireAccount();
    var newEmail = normalizeEmail(body.newEmail);
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(newEmail)) {
      return errorResponse(400, 'Некорректный email');
    }
    if (newEmail === account.email) {
      return errorResponse(400, 'Новый email совпадает с текущим');
    }
    var accounts = getAccounts();
    if (accounts[newEmail]) {
      return errorResponse(409, 'Пользователь с таким email уже зарегистрирован');
    }
    var oldEmail = account.email;
    delete accounts[oldEmail];
    account.email = newEmail;
    accounts[newEmail] = account;
    saveAccounts(accounts);
    // Переносим активные сессии на новый email
    var sessions = getSessions();
    Object.keys(sessions).forEach(function (token) {
      if (sessions[token] === oldEmail) sessions[token] = newEmail;
    });
    saveSessions(sessions);

    var profile = publicProfile(account);
    saveActiveProfile(profile);
    return makeResponse(200, { profile: profile });
  }

  // GET /api/profile/username-availability?username=...
  function handleUsernameAvailability(query) {
    var username = String(query.username || '').trim().toLowerCase();
    if (!username) {
      return makeResponse(200, { available: false, valid: false, reason: 'Введите username' });
    }
    if (!/^[a-zа-яё][a-z0-9а-яё_]{2,29}$/i.test(username)) {
      return makeResponse(200, { available: false, valid: false, reason: '3–30 символов: буквы, цифры и _' });
    }
    var accounts = getAccounts();
    var taken = Object.keys(accounts).some(function (email) {
      return accounts[email].username === username;
    });
    return makeResponse(200, { available: !taken, valid: true, reason: taken ? 'Username уже занят' : 'Username свободен' });
  }

  // GET /api/shop/items
  function handleShopItems() {
    var stats = getShopStats();
    var items = ITEMS.map(function (item) {
      var metadata = item.metadata || {};
      var limited = isLimitedItem(item);
      var sold = limited ? Number(stats.sold[item.slug] || 0) : 0;
      return {
        id: item.id,
        slug: item.slug,
        name: item.name,
        price: item.price,
        type: item.type,
        metadata: metadata,
        limited: limited,
        stock: limited ? Math.max(0, LIMITED_STOCK - sold) : null,
        soldOut: limited && sold >= LIMITED_STOCK
      };
    });
    return makeResponse(200, { items: items });
  }

  // POST /api/shop/buy
  function handleBuy(body) {
    var account = requireAccount();
    var item = findItem(body.itemId, String(body.itemSlug || '').trim());
    if (!item) {
      return errorResponse(404, 'Товар не найден');
    }

    var stats = getShopStats();
    var sold = Number(stats.sold[item.slug] || 0);
    if (isLimitedItem(item) && sold >= LIMITED_STOCK) {
      return errorResponse(400, 'Распродано');
    }

    var key = itemKey(item);
    if (account.inventory.includes(item.slug) || account.inventory.includes(key)) {
      return errorResponse(409, 'Товар уже куплен');
    }
    if (Number(account.coins) < Number(item.price)) {
      return errorResponse(400, 'Недостаточно монет');
    }

    account.coins = Number(account.coins) - Number(item.price);
    account.inventory.push(key);
    account.purchases = account.purchases || [];
    account.purchases.push({
      itemSlug: item.slug,
      amount: Number(item.price),
      source: 'buy',
      createdAt: new Date().toISOString()
    });

    if (isLimitedItem(item)) {
      stats.sold[item.slug] = sold + 1;
      saveShopStats(stats);
    }

    var accounts = getAccounts();
    accounts[account.email] = account;
    saveAccounts(accounts);

    var profile = publicProfile(account);
    saveActiveProfile(profile);
    return makeResponse(200, { profile: profile });
  }

  // POST /api/shop/open (кейс)
  function handleOpen(body) {
    var account = requireAccount();
    var item = findItem(body.itemId, String(body.itemSlug || '').trim());
    if (!item || item.type !== 'lootbox') {
      return errorResponse(404, 'Кейс не найден');
    }
    var metadata = item.metadata || {};
    var prizes = Array.isArray(metadata.prizes) ? metadata.prizes : [];
    if (prizes.length === 0) {
      return errorResponse(400, 'В кейсе нет призов');
    }
    if (Number(account.coins) < Number(item.price)) {
      return errorResponse(400, 'Недостаточно монет');
    }

    // Взвешенный случайный выбор приза (как в server.js)
    var totalWeight = prizes.reduce(function (sum, p) {
      return sum + (Number(p.weight) > 0 ? Number(p.weight) : 1);
    }, 0);
    var roll = Math.random() * totalWeight;
    var wonPrize = prizes[prizes.length - 1];
    for (var i = 0; i < prizes.length; i++) {
      roll -= (Number(prizes[i].weight) > 0 ? Number(prizes[i].weight) : 1);
      if (roll <= 0) {
        wonPrize = prizes[i];
        break;
      }
    }

    var wonItem = BY_SLUG[wonPrize.slug];
    if (!wonItem) {
      return makeResponse(500, { error: 'Приз из кейса не найден' });
    }
    var wonKey = itemKey(wonItem);

    account.coins = Number(account.coins) - Number(item.price);
    if (!account.inventory.includes(wonKey)) account.inventory.push(wonKey);
    account.purchases = account.purchases || [];
    account.purchases.push({
      itemSlug: wonItem.slug,
      amount: Number(item.price),
      source: 'case',
      createdAt: new Date().toISOString()
    });

    var accounts = getAccounts();
    accounts[account.email] = account;
    saveAccounts(accounts);

    var profile = publicProfile(account);
    saveActiveProfile(profile);
    return makeResponse(200, {
      ok: true,
      won: { id: wonKey, name: wonItem.name, image: (wonItem.metadata && wonItem.metadata.image) || '' },
      profile: profile
    });
  }

  // POST /api/videos/reward
  function handleVideoReward(body) {
    var account = requireAccount();
    var videoId = String(body.videoId || '').trim();
    if (!videoId) {
      return errorResponse(400, 'ID видео обязателен');
    }
    if (body.isShorts === true) {
      return errorResponse(400, 'Shorts не участвуют в системе наград');
    }

    var durationSeconds = Number(body.durationSeconds);
    var coins = Number.isFinite(durationSeconds) && durationSeconds >= 0 && durationSeconds < 300 ? 100 : 500;

    // Границы сегодняшнего дня в UTC (как в server.js)
    var now = new Date();
    var dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    var dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    var history = account.videoHistory || [];
    if (history.some(function (r) { return r.video_id === videoId; })) {
      return errorResponse(409, 'Награда за это видео уже получена');
    }
    var todayCount = history.filter(function (r) {
      var t = new Date(r.rewarded_at);
      return t >= dayStart && t < dayEnd;
    }).length;
    if (todayCount >= 3) {
      return errorResponse(429, 'Лимит наград за сегодня достигнут');
    }

    account.coins = Number(account.coins) + coins;
    account.rewardedVideos = account.rewardedVideos || [];
    if (!account.rewardedVideos.includes(String(videoId))) account.rewardedVideos.push(String(videoId));
    history.push({ video_id: videoId, rewarded_at: now.toISOString(), coins: coins, source: 'watch' });
    account.videoHistory = history;

    var accounts = getAccounts();
    accounts[account.email] = account;
    saveAccounts(accounts);

    var profile = publicProfile(account);
    saveActiveProfile(profile);
    return makeResponse(200, { coins: coins, profile: profile });
  }

  // GET /api/videos/history
  function handleVideoHistory() {
    var account = requireAccount();
    var history = (account.videoHistory || []).slice().sort(function (a, b) {
      return new Date(b.rewarded_at) - new Date(a.rewarded_at);
    });
    return makeResponse(200, { history: history });
  }

  // Админ-панель временно отключена (нужна общая БД всех пользователей)
  function handleAdmin() {
    return errorResponse(403, 'Админ-панель временно недоступна в статическом режиме');
  }

  // ===== Роутер =====
  async function routeApi(path, options) {
    var method = String(options.method || 'GET').toUpperCase();
    var pathname = path.split('?')[0];
    var query = {};
    var qs = path.indexOf('?') >= 0 ? path.slice(path.indexOf('?') + 1) : '';
    qs.split('&').forEach(function (pair) {
      if (!pair) return;
      var parts = pair.split('=');
      query[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1] || '');
    });
    var body = options.body || {};

    try {
      if (method === 'GET' && pathname === '/api/auth/me') return handleMe();
      if (method === 'GET' && pathname === '/api/profile') return handleMe();
      if (method === 'PUT' && pathname === '/api/profile') return handlePutProfile(body);
      if (method === 'POST' && pathname === '/api/auth/register') return handleRegister(body);
      if (method === 'POST' && pathname === '/api/auth/login') return handleLogin(body);
      if (method === 'POST' && pathname === '/api/auth/reset-password') return handleResetPassword(body);
      if (method === 'POST' && pathname === '/api/auth/logout') return handleLogout();
      if (method === 'POST' && pathname === '/api/profile/change-email') return handleChangeEmail(body);
      if (method === 'GET' && pathname === '/api/profile/username-availability') return handleUsernameAvailability(query);
      if (method === 'GET' && pathname === '/api/shop/items') return handleShopItems();
      if (method === 'POST' && pathname === '/api/shop/buy') return handleBuy(body);
      if (method === 'POST' && pathname === '/api/shop/open') return handleOpen(body);
      if (method === 'POST' && pathname === '/api/videos/reward') return handleVideoReward(body);
      if (method === 'GET' && pathname === '/api/videos/history') return handleVideoHistory();
      if (pathname.indexOf('/api/admin') === 0) return handleAdmin();
      if (pathname === '/api/notes') return makeResponse(200, []);
      return makeResponse(404, { error: 'Не найдено' });
    } catch (err) {
      if (err && err.status) return errorResponse(err.status, err.message);
      console.error('[local-backend] Ошибка:', err);
      return makeResponse(500, { error: 'Внутренняя ошибка сервера' });
    }
  }

  // ===== Перехват fetch =====
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (typeof url === 'string' && url.indexOf('/api/') === 0) {
      var method = (init && init.method) || 'GET';
      var body = null;
      if (init && typeof init.body === 'string') {
        try { body = JSON.parse(init.body); } catch (e) { body = null; }
      } else if (init && init.body) {
        body = init.body;
      }
      return routeApi(url, { method: method, body: body });
    }
    if (nativeFetch) return nativeFetch(input, init);
    return Promise.reject(new Error('fetch недоступен'));
  };

  // ===== Временное скрытие админ-панели =====
  function hideAdminUI() {
    var btn = document.getElementById('adminOpenBtn');
    if (btn) btn.style.display = 'none';
    var modal = document.getElementById('adminModal');
    if (modal) modal.style.display = 'none';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hideAdminUI);
  } else {
    hideAdminUI();
  }

  // Публичный доступ для отладки
  window.localBackend = {
    version: 1,
    mode: 'localstorage',
    items: ITEMS,
    routeApi: routeApi
  };
})();