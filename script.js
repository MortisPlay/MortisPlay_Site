// === КОНФИГУРАЦИЯ YOUTUBE API ===
const YOUTUBE_CONFIG = {
    apiKey: 'AIzaSyCHwEhu5s69hx9RgMyYsOrkmBkBW2TZ7fA',
    channelId: 'UC2VwlrbzSa8UGLHAYmbuEZA',
    maxResults: 50
};

let videoData = [];
let isLoadingVideos = false;
let currentVideoSystem = null;
let currentDateFilter = 0;

// Конфиг для получения статистики канала
let channelStats = {
    subscribers: 'N/A',
    views: 'N/A'
};

// === ФУНКЦИИ ДЛЯ РАБОТЫ С YOUTUBE API ===
function formatDuration(duration) {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    const hours = (match[1] || '').replace('H', '');
    const minutes = (match[2] || '').replace('M', '');
    const seconds = (match[3] || '').replace('S', '');
    if (hours) return `${hours}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}`;
    return `${minutes || '0'}:${(seconds || '0').padStart(2, '0')}`;
}

function formatViews(views) {
    const num = parseInt(views);
    if (isNaN(num)) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

async function fetchVideosFromYouTube() {
    if (!YOUTUBE_CONFIG.apiKey || !YOUTUBE_CONFIG.channelId) return null;
    try {
        isLoadingVideos = true;
        if (currentVideoSystem) currentVideoSystem.showSkeleton();
        showNotification('Загрузка видео с YouTube... 📡', { silent: true });
        
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${YOUTUBE_CONFIG.channelId}&maxResults=${YOUTUBE_CONFIG.maxResults}&order=date&type=video&key=${YOUTUBE_CONFIG.apiKey}`;
        const searchResponse = await fetch(url);
        
        if (!searchResponse.ok) throw new Error(`HTTP ${searchResponse.status}`);
        
        const searchData = await searchResponse.json();
        if (!searchData.items?.length) throw new Error('Нет видео');
        
        const videoIds = searchData.items.map(item => item.id.videoId).join(',');
        const videosResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${videoIds}&key=${YOUTUBE_CONFIG.apiKey}`);
        const videosData = await videosResponse.json();
        
        const videoDetailsMap = {};
        videosData.items.forEach(video => {
            videoDetailsMap[video.id] = {
                duration: formatDuration(video.contentDetails.duration),
                views: formatViews(video.statistics.viewCount)
            };
        });
        
        const youtubeVideos = searchData.items.map((item, index) => {
            return {
                id: index + 1,
                title: item.snippet.title,
                views: videoDetailsMap[item.id.videoId]?.views || '0',
                duration: videoDetailsMap[item.id.videoId]?.duration || '0:00',
                thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
                platform: 'youtube',
                videoId: item.id.videoId,
                publishedAt: item.snippet.publishedAt
            };
        });
        
        const hasNewVideos = youtubeVideos.length > 0 && (!videoData.length || youtubeVideos.some(video => !videoData.some(existing => existing.id === video.id)));
        if (hasNewVideos) {
            showNotification('Появилось новое видео на канале! 🎬', { type: 'success', duration: 5000, category: 'channel-video' });
        }
        showNotification(`Загружено ${youtubeVideos.length} видео с YouTube! 🎉`, { silent: true });
        return youtubeVideos;
    } catch (error) {
        console.error('Ошибка загрузки YouTube:', error);
        showNotification('Не удалось загрузить видео с YouTube. ⚠️', { type: 'warning', duration: 4000 });
        return null;
    } finally {
        isLoadingVideos = false;
    }
}

function loadCachedVideos() {
    try {
        const cached = localStorage.getItem('cachedVideos');
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            if ((Date.now() - timestamp) < 3600000 && data?.length) {
                videoData = data;
                return true;
            }
        }
    } catch(e) {}
    return false;
}

async function updateVideosFromYouTube() {
    if (isLoadingVideos) return;
    const youtubeVideos = await fetchVideosFromYouTube();
    if (youtubeVideos?.length) {
        videoData = youtubeVideos;
        try {
            localStorage.setItem('cachedVideos', JSON.stringify({ data: videoData, timestamp: Date.now() }));
        } catch(e) {}
        if (currentVideoSystem) currentVideoSystem.refresh(videoData);
    }
}

async function fetchChannelStats() {
    if (!YOUTUBE_CONFIG.apiKey || !YOUTUBE_CONFIG.channelId) return;
    try {
        const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${YOUTUBE_CONFIG.channelId}&key=${YOUTUBE_CONFIG.apiKey}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.items && data.items[0] && data.items[0].statistics) {
            const stats = data.items[0].statistics;
            channelStats.subscribers = formatViews(stats.subscriberCount || '0');
            channelStats.views = formatViews(stats.viewCount || '0');
            updateStatsDisplay();
            localStorage.setItem('channelStats', JSON.stringify({ ...channelStats, timestamp: Date.now() }));
        }
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
        loadCachedStats();
    }
}

function loadCachedStats() {
    try {
        const cached = localStorage.getItem('channelStats');
        if (cached) {
            const { subscribers, views, timestamp } = JSON.parse(cached);
            if ((Date.now() - timestamp) < 3600000) {
                channelStats = { subscribers, views };
                updateStatsDisplay();
            }
        }
    } catch(e) {}
}

function updateStatsDisplay() {
    const subscribersCard = document.querySelector('[data-stat="subscribers"] .stat-number');
    const viewsCard = document.querySelector('[data-stat="views"] .stat-number');
    if (subscribersCard) subscribersCard.textContent = channelStats.subscribers;
    if (viewsCard) viewsCard.textContent = channelStats.views;
}

function shouldShowNotification(options = {}) {
    const settings = getSiteSettings();
    const { silent = false, force = false, category = null } = options;
    if (silent) return false;
    if (force) return true;
    if (settings.notifications === false || document.body.classList.contains('notifications-off')) return false;
    return true;
}

function showNotification(message, options = {}) {
    const { type = 'info', duration = 2600, silent = false, force = false, html = false, title, category = null } = options;
    if (!shouldShowNotification({ silent, force, category })) return;
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notificationText');
    const notificationTitle = document.getElementById('notificationTitle');
    const icon = notification?.querySelector('.icon-pill i');
    if (!notification || !notificationText) return;
    if (html) {
        notificationText.innerHTML = message;
    } else {
        notificationText.textContent = message;
    }
    if (notificationTitle) {
        notificationTitle.textContent = title || (type === 'warning' ? 'Предупреждение' : type === 'success' ? 'Успешно' : 'Уведомление');
    }
    notification.dataset.type = type;
    if (icon) {
        icon.className = type === 'warning' ? 'fas fa-triangle-exclamation' : type === 'success' ? 'fas fa-check-circle' : 'fas fa-bell';
    }
    notification.classList.remove('show');
    window.clearTimeout(notification._hideTimer);
    notification.classList.add('show');
    notification._hideTimer = window.setTimeout(() => notification.classList.remove('show'), duration);
}

function hideNotification() { document.getElementById('notification').classList.remove('show'); }

// Единый помощник: открывает модалку по id, с защитой от отсутствия элемента
function openModalById(id) {
    const modal = document.getElementById(id);
    if (!modal) return false;
    modal.classList.add('show');
    return true;
}
function closeModalById(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('show');
}
// Блокировка прокрутки тела при открытой модалке (через класс, без ловушки)
let __modalStack = 0;
function lockScroll() {
    __modalStack++;
    document.body.classList.add('modal-open');
}
function unlockScroll() {
    __modalStack = Math.max(0, __modalStack - 1);
    if (__modalStack === 0) document.body.classList.remove('modal-open');
}

function openSettingsModal() {
    if (openModalById('settingsModal')) lockScroll();
}

function closeSettingsModal(event) {
    if (event && event.target.id !== 'settingsModal') return;
    closeModalById('settingsModal');
    unlockScroll();
}

function openVideoFaqModal() {
    if (openModalById('videoFaqModal')) lockScroll();
}

function closeVideoFaqModal(event) {
    if (event && event.target.id !== 'videoFaqModal') return;
    closeModalById('videoFaqModal');
    unlockScroll();
}

function debounce(func, wait) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func(...args), wait); }; }

function getSiteSettings() {
    const saved = localStorage.getItem('site-settings');
    const isMobileViewport = () => window.matchMedia('(max-width: 768px)').matches;
    let settings = { animations: true, notifications: true, glass: !isMobileViewport(), updateNotice: true, lightBrightness: 100 };
    try {
        if (saved) settings = { ...settings, ...JSON.parse(saved) };
    } catch (e) {}
    settings.lightBrightness = Math.min(130, Math.max(70, Number(settings.lightBrightness) || 100));
    return settings;
}

function applySettings() {
    const settings = getSiteSettings();

    document.body.classList.toggle('reduced-motion', settings.animations === false);
    document.body.classList.toggle('notifications-off', settings.notifications === false);
    document.body.classList.toggle('reduced-glass', settings.glass === false);
    document.documentElement.style.setProperty('--light-theme-brightness', `${settings.lightBrightness}%`);

    const animationsToggle = document.getElementById('animationsToggle');
    const notificationsToggle = document.getElementById('notificationsToggle');
    const glassToggle = document.getElementById('glassToggle');
    const lightBrightness = document.getElementById('lightBrightness');
    const lightBrightnessValue = document.getElementById('lightBrightnessValue');
    const updateNoticeToggle = document.getElementById('updateNoticeToggle');
    if (animationsToggle) animationsToggle.checked = settings.animations !== false;
    if (notificationsToggle) notificationsToggle.checked = settings.notifications !== false;
    if (glassToggle) glassToggle.checked = settings.glass !== false;
    if (lightBrightness) {
        lightBrightness.value = String(settings.lightBrightness);
        lightBrightness.disabled = !document.body.classList.contains('light-theme');
    }
    if (lightBrightnessValue) lightBrightnessValue.textContent = `${settings.lightBrightness}%`;
    if (updateNoticeToggle) updateNoticeToggle.checked = settings.updateNotice !== false;
}

function initSettings() {
    const menuSettingsBtn = document.getElementById('menuSettingsBtn');
    const animationsToggle = document.getElementById('animationsToggle');
    const notificationsToggle = document.getElementById('notificationsToggle');
    const glassToggle = document.getElementById('glassToggle');
    const lightBrightness = document.getElementById('lightBrightness');
    const lightBrightnessValue = document.getElementById('lightBrightnessValue');
    const updateNoticeToggle = document.getElementById('updateNoticeToggle');
    const saveButton = document.querySelector('#settingsModal .btn-primary');

    const handleSettingsClick = () => {
        openSettingsModal();
        window.closeMobileMenu?.();
    };
    menuSettingsBtn?.addEventListener('click', handleSettingsClick);

    const saveSettings = (showToast = false) => {
        const settings = {
            animations: animationsToggle?.checked !== false,
            notifications: notificationsToggle?.checked !== false,
            glass: glassToggle?.checked !== false,
            lightBrightness: Number(lightBrightness?.value) || 100,
            updateNotice: updateNoticeToggle?.checked !== false
        };
        localStorage.setItem('site-settings', JSON.stringify(settings));
        applySettings();
        if (showToast) {
            showNotification('Настройки применены', { type: 'success', duration: 2600, force: true });
        }
    };

    animationsToggle?.addEventListener('change', () => saveSettings(false));
    notificationsToggle?.addEventListener('change', () => saveSettings(false));
    glassToggle?.addEventListener('change', () => saveSettings(false));
    updateNoticeToggle?.addEventListener('change', () => saveSettings(false));
    lightBrightness?.addEventListener('input', () => {
        if (!document.body.classList.contains('light-theme')) return;
        document.documentElement.style.setProperty('--light-theme-brightness', `${lightBrightness.value}%`);
        if (lightBrightnessValue) lightBrightnessValue.textContent = `${lightBrightness.value}%`;
        saveSettings(false);
    });
    saveButton?.addEventListener('click', () => {
        saveSettings(true);
        closeSettingsModal();
    });
    applySettings();
}

async function showSiteUpdateNotice() {
    const settings = getSiteSettings();
    if (settings.updateNotice === false) return;
    if (sessionStorage.getItem('site-update-notice-shown') === '1') return;
    
    try {
        const response = await fetch('https://api.github.com/repos/MortisPlay/MortisPlay_Site/commits/main?per_page=1');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const latestSha = data.sha;
        const commitMessage = data.commit?.message?.split('\n')[0] || 'Новое обновление';
        const commitDate = new Date(data.commit?.committer?.date).toLocaleDateString('ru-RU', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
        const commitUrl = data.html_url;
        
        const lastNotifiedSha = localStorage.getItem('lastNotifiedCommitSha');
        
        if (lastNotifiedSha !== latestSha) {
            sessionStorage.setItem('site-update-notice-shown', '1');
            localStorage.setItem('lastNotifiedCommitSha', latestSha);
            
            showNotification(`📦 ${commitMessage} — <a href="${commitUrl}" target="_blank" rel="noopener noreferrer" style="color:#93c5fd;text-decoration:underline;">Подробнее</a>`, {
                type: 'info',
                duration: 10000,
                html: true,
                title: `Обновление сайта от ${commitDate}`,
                category: 'site-update'
            });
        }
    } catch (error) {
        console.warn('GitHub API недоступен, показываем стандартное уведомление:', error);
        sessionStorage.setItem('site-update-notice-shown', '1');
        showNotification('Ведутся обновления сайта. Посмотреть последний коммит можно <a href="https://github.com/MortisPlay/MortisPlay_Site/commits/main/" target="_blank" rel="noopener noreferrer" style="color:#93c5fd;text-decoration:underline;">по этой ссылке</a>.', {
            type: 'info',
            duration: 9000,
            html: true,
            title: 'Обновление сайта',
            category: 'site-update'
        });
    }
}

function initTemporaryFeatures() {
    const secretButton = document.querySelector('a[href="secret/index.html"]');
    const removeAfter = new Date('2026-07-23T00:00:00');
    if (secretButton && Date.now() >= removeAfter.getTime()) {
        secretButton.remove();
    }
    
    const questionBtn = document.getElementById('videoFaqBtn');
    const deadline = new Date('2026-07-23T10:00:00+10:00');
    const now = new Date();
    
    if (questionBtn) {
        if (now >= deadline) {
            questionBtn.style.display = 'none';
        } else {
            questionBtn.classList.add('pulse-btn');
        }
    }
}

// Единая функция применения темы (класс вешается на <html> и <body> синхронно)
function applyTheme(theme) {
    const isLight = theme === 'light';
    document.documentElement.classList.toggle('light-theme', isLight);
    document.body.classList.toggle('light-theme', isLight);
    try { localStorage.setItem('theme', theme); } catch (e) {}
    updateThemeIcon(theme);
    applySettings();
}

function getCurrentTheme() {
    const isLight = document.documentElement.classList.contains('light-theme') ||
        document.body.classList.contains('light-theme');
    return isLight ? 'light' : 'dark';
}

function initTheme() {
    // Используем тему, уже установленную скриптом в <head> (до рендера)
    const initial = getCurrentTheme();
    updateThemeIcon(initial);

    const menuThemeBtn = document.getElementById('menuThemeBtn');
    const handleThemeToggle = () => {
        const current = getCurrentTheme();
        const next = current === 'light' ? 'dark' : 'light';
        applyTheme(next);
        showNotification(`Тема изменена на ${next === 'light' ? 'светлую 🌞' : 'тёмную 🌙'}`, { type: 'info', duration: 2200 });
    };
    menuThemeBtn?.addEventListener('click', () => {
        handleThemeToggle();
        window.closeMobileMenu?.();
    });
}

function updateThemeIcon(theme) {
    const menuThemeIcon = document.querySelector('#menuThemeBtn i');
    if (menuThemeIcon) {
        menuThemeIcon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
        menuThemeIcon.title = theme === 'light' ? 'Тёмная тема' : 'Светлая тема';
    }
}

function getStoredProfile() {
    try {
        const savedProfile = localStorage.getItem('profile-user');
        return savedProfile ? JSON.parse(savedProfile) : null;
    } catch (error) {
        return null;
    }
}

function saveProfile(profile) {
    localStorage.setItem('profile-user', JSON.stringify(profile));
}

// Сохранить кастомизацию (аватарка, цвет) в аккаунт, чтобы она не терялась
// при выходе из профиля или входе с другого устройства
function saveCustomizationToAccount(profile) {
    if (!profile?.email) return;
    const accounts = getAccounts();
    const email = normalizeEmail(profile.email);
    if (!accounts[email]) return;
    accounts[email].customization = profile.customization || {};
    saveAccounts(accounts);
}

function clearStoredProfile() {
    localStorage.removeItem('profile-user');
}

// === СИСТЕМА АККАУНТОВ ===
const ACCOUNTS_KEY = 'site-accounts';
const PENDING_REGISTRATION_KEY = 'pending-registration';

function getAccounts() {
    try {
        const raw = localStorage.getItem(ACCOUNTS_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        return {};
    }
}

function saveAccounts(accounts) {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function generateVerificationCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function storePendingRegistration(data) {
    localStorage.setItem(PENDING_REGISTRATION_KEY, JSON.stringify({
        ...data,
        code: generateVerificationCode(),
        createdAt: Date.now()
    }));
}

function getPendingRegistration() {
    try {
        const raw = localStorage.getItem(PENDING_REGISTRATION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function clearPendingRegistration() {
    localStorage.removeItem(PENDING_REGISTRATION_KEY);
}

// Проверка корректности email
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// === СИСТЕМА БЕЙДЖИКОВ ===
// Каталог доступных бейджей. Хранятся в профиле/аккаунте (localStorage).
const BADGE_DEFINITIONS = {
    'official': {
        id: 'official',
        label: 'Официальный',
        description: 'Подтверждённый официальный аккаунт Mortis Play',
        icon: 'fas fa-badge-check',
        className: 'profile-badge--official'
    },
    'beta-tester': {
        id: 'beta-tester',
        label: 'Бета-тестировщик',
        description: 'Ранее тестировал новые функции в бете',
        icon: 'fas fa-flask',
        className: 'profile-badge--beta'
    }
};

// Бейджики по умолчанию для владельца (официальный аккаунт Mortis Play)
const OWNER_BADGES = ['official'];

function getBadgeDefinitions() {
    return BADGE_DEFINITIONS;
}

// Возвращает массив id бейджей для профиля (с учётом бейджей владельца)
function resolveProfileBadges(profile) {
    const badges = Array.isArray(profile?.badges) ? profile.badges.slice() : [];
    const email = normalizeEmail(profile?.email);
    if (email && isOwnerEmail(email)) {
        OWNER_BADGES.forEach(b => { if (!badges.includes(b)) badges.push(b); });
    }
    return badges;
}

// Признак владельца сайта (по email из аккаунта)
function isOwnerEmail(email) {
    const accounts = getAccounts();
    const norm = normalizeEmail(email);
    if (!norm) return false;
    const acc = accounts[norm];
    return Boolean(acc && acc.isOwner);
}

// Получить бейджи текущего профиля
function getUserBadges() {
    return resolveProfileBadges(getStoredProfile());
}

// Сохранить список бейджей в аккаунт (по email), чтобы не терялся при входе
function saveBadgesToAccount(profile) {
    if (!profile?.email) return;
    const accounts = getAccounts();
    const email = normalizeEmail(profile.email);
    if (!accounts[email]) return;
    accounts[email].badges = Array.isArray(profile.badges) ? profile.badges.slice() : [];
    saveAccounts(accounts);
}

// Загрузить бейджи из аккаунта по email
function loadBadgesFromAccount(email) {
    const accounts = getAccounts();
    const norm = normalizeEmail(email);
    return (accounts[norm] && Array.isArray(accounts[norm].badges)) ? accounts[norm].badges.slice() : [];
}

// Выдать/снять бейдж у аккаунта по email. Возвращает обновлённый массив бейджей.
function setAccountBadge(email, badgeId, granted) {
    if (!BADGE_DEFINITIONS[badgeId]) return null;
    const accounts = getAccounts();
    const norm = normalizeEmail(email);
    if (!accounts[norm]) return null;
    let badges = Array.isArray(accounts[norm].badges) ? accounts[norm].badges.slice() : [];
    if (granted) {
        if (!badges.includes(badgeId)) badges.push(badgeId);
    } else {
        badges = badges.filter(b => b !== badgeId);
    }
    accounts[norm].badges = badges;
    saveAccounts(accounts);
    return badges;
}

// === СИСТЕМА АУР ДЛЯ ПРОФИЛЯ ===
// Стартовый баланс монет при регистрации нового аккаунта
const STARTING_COINS = 1000;

// Каталог доступных рамок. NFT полностью убраны из визуального и функционального списка.
const AURA_DEFINITIONS = {
    'gold': {
        id: 'gold',
        name: 'Золотое сияние',
        price: 500,
        description: 'Тёплое золотое свечение вокруг аватара',
        rarity: 'Редкая',
        color: '#f59e0b',
        category: 'frame'
    },
    'neon': {
        id: 'neon',
        name: 'Неоновый градиент',
        price: 800,
        description: 'Вращающийся неоновый конусный градиент',
        rarity: 'Эпическая',
        color: '#22d3ee',
        category: 'frame'
    },
    'fire': {
        id: 'fire',
        name: 'Огненная аура',
        price: 1200,
        description: 'Пылающее красно-оранжевое пламя',
        rarity: 'Эпическая',
        color: '#ef4444',
        category: 'frame'
    },
    'cosmic': {
        id: 'cosmic',
        name: 'Космическая аура',
        price: 1500,
        description: 'Фиолетово-синее сияние с мерцающими звёздами',
        rarity: 'Легендарная',
        color: '#8b5cf6',
        category: 'frame'
    },
    'crystal': {
        id: 'crystal',
        name: 'Кристальная аура',
        price: 2000,
        description: 'Переливающееся полупрозрачное кольцо',
        rarity: 'Легендарная',
        color: '#2dd4bf',
        category: 'frame'
    },
    'royal': {
        id: 'royal',
        name: 'Королевская аура',
        price: 3000,
        description: 'Пульсирующее золотое сияние высшего ранга',
        rarity: 'Мифическая',
        color: '#fbbf24',
        category: 'frame'
    }
};

// Получить инвентарь профиля (массив id купленных аур)
function getProfileInventory(profile) {
    return Array.isArray(profile?.inventory) ? profile.inventory.slice() : [];
}

// Получить id активной ауры профиля
function getProfileEquipped(profile) {
    return profile?.equipped && AURA_DEFINITIONS[profile.equipped] ? profile.equipped : null;
}

// Получить баланс монет профиля (с запасом, если поле отсутствует — стартовый)
function getProfileCoins(profile) {
    const n = parseInt(profile?.coins, 10);
    return Number.isFinite(n) && n >= 0 ? n : STARTING_COINS;
}

// Загрузить монеты из аккаунта по email
function loadCoinsFromAccount(email) {
    const accounts = getAccounts();
    const norm = normalizeEmail(email);
    const acc = accounts[norm];
    if (!acc) return STARTING_COINS;
    const n = parseInt(acc.coins, 10);
    return Number.isFinite(n) && n >= 0 ? n : STARTING_COINS;
}

// Сохранить монеты в аккаунт по email
function saveCoinsToAccount(email, coins) {
    const accounts = getAccounts();
    const norm = normalizeEmail(email);
    if (!accounts[norm]) return;
    accounts[norm].coins = Math.max(0, parseInt(coins, 10) || 0);
    saveAccounts(accounts);
}

// Списать монеты у профиля и аккаунта. Возвращает true при успехе.
function spendCoins(profile, amount) {
    amount = parseInt(amount, 10) || 0;
    const current = getProfileCoins(profile);
    if (current < amount) return false;
    profile.coins = current - amount;
    if (profile?.email) saveCoinsToAccount(profile.email, profile.coins);
    saveProfile(profile);
    return true;
}

// Зачислить монеты профилю и аккаунту
function addCoins(profile, amount) {
    amount = parseInt(amount, 10) || 0;
    if (amount <= 0) return;
    const current = getProfileCoins(profile);
    profile.coins = current + amount;
    if (profile?.email) saveCoinsToAccount(profile.email, profile.coins);
    saveProfile(profile);
}

// Выдать/снять ауру у аккаунта по email. Возвращает обновлённый массив инвентаря.
function setAccountAuraInventory(email, auraId, granted) {
    if (!AURA_DEFINITIONS[auraId]) return null;
    const accounts = getAccounts();
    const norm = normalizeEmail(email);
    if (!accounts[norm]) return null;
    let inv = Array.isArray(accounts[norm].inventory) ? accounts[norm].inventory.slice() : [];
    if (granted) {
        if (!inv.includes(auraId)) inv.push(auraId);
    } else {
        inv = inv.filter(a => a !== auraId);
    }
    accounts[norm].inventory = inv;
    saveAccounts(accounts);
    return inv;
}

// Купить ауру для текущего профиля. Возвращает объект результата.
function purchaseAura(profile, auraId) {
    if (!profile) return { ok: false, reason: 'no-login' };
    const def = AURA_DEFINITIONS[auraId];
    if (!def) return { ok: false, reason: 'unknown' };
    if (getProfileInventory(profile).includes(auraId)) return { ok: false, reason: 'owned' };
    // Для NFT проверяем остаток глобального тиража
    if (getProfileCoins(profile) < def.price) return { ok: false, reason: 'insufficient' };
    profile.coins = getProfileCoins(profile) - def.price;
    profile.inventory = Array.isArray(profile.inventory) ? profile.inventory.slice() : [];
    profile.inventory.push(auraId);
    if (profile?.email) {
        setAccountAuraInventory(profile.email, auraId, true);
        saveCoinsToAccount(profile.email, profile.coins);
    }
    saveProfile(profile);
    return { ok: true, aura: def };
}

// Надеть ауру (equipped = id). Автоматически снимает предыдущую.
function equipAura(profile, auraId) {
    if (!profile || !AURA_DEFINITIONS[auraId]) return false;
    if (!getProfileInventory(profile).includes(auraId)) return false;
    profile.equipped = auraId;
    if (profile?.email) {
        const accounts = getAccounts();
        const norm = normalizeEmail(profile.email);
        if (accounts[norm]) {
            accounts[norm].equipped = auraId;
            saveAccounts(accounts);
        }
    }
    saveProfile(profile);
    return true;
}

// Снять ауру (equipped = null)
function unequipAura(profile) {
    if (!profile) return false;
    profile.equipped = null;
    if (profile?.email) {
        const accounts = getAccounts();
        const norm = normalizeEmail(profile.email);
        if (accounts[norm]) {
            accounts[norm].equipped = null;
            saveAccounts(accounts);
        }
    }
    saveProfile(profile);
    return true;
}

// Загрузить экипировку из аккаунта по email
function loadEquippedFromAccount(email) {
    const accounts = getAccounts();
    const norm = normalizeEmail(email);
    const acc = accounts[norm];
    if (!acc) return null;
    return acc.equipped && AURA_DEFINITIONS[acc.equipped] ? acc.equipped : null;
}

// Загрузить инвентарь из аккаунта по email
function loadInventoryFromAccount(email) {
    const accounts = getAccounts();
    const norm = normalizeEmail(email);
    const acc = accounts[norm];
    return (acc && Array.isArray(acc.inventory)) ? acc.inventory.slice() : [];
}

// Применить класс ауры к контейнеру аватара (общий хелпер)
function applyAuraClass(container, auraId) {
    if (!container) return;
    // Снимаем все известные классы ауры/рамки (включая NFT-товары)
    container.classList.remove(
        'aura-gold', 'aura-neon', 'aura-fire', 'aura-cosmic', 'aura-crystal', 'aura-royal',
        'aura-nft-flame', 'aura-nft-golden', 'aura-nft-nebula', 'aura-nft-void', 'aura-nft-chroma', 'aura-nft-royal'
    );
    if (auraId && AURA_DEFINITIONS[auraId]) container.classList.add(`aura-${auraId}`);
}

// Утилита для показа ошибок полей
function showFieldError(input, message) {
    const wrap = input.closest('label') || input.parentElement;
    const errorEl = wrap?.querySelector('.field-error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }
    input?.classList.add('input-error');
}

function clearFieldError(input) {
    const wrap = input.closest('label') || input.parentElement;
    const errorEl = wrap?.querySelector('.field-error');
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }
    input?.classList.remove('input-error');
}

function clearAllFieldErrors(container) {
    container?.querySelectorAll('.field-error').forEach(el => {
        el.textContent = '';
        el.classList.add('hidden');
    });
    container?.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
}

function showAuthError(message) {
    const errorBox = document.getElementById('authError');
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
}

function clearAuthError() {
    const errorBox = document.getElementById('authError');
    if (errorBox) {
        errorBox.textContent = '';
        errorBox.classList.add('hidden');
    }
}

// Управление лоадером кнопки
function setButtonLoading(button, loading) {
    if (!button) return;
    const label = button.querySelector('.btn-label');
    const loader = button.querySelector('.btn-loader');
    if (loading) {
        button.disabled = true;
        button.classList.add('disabled');
        if (label) label.classList.add('hidden');
        if (loader) loader.classList.remove('hidden');
    } else {
        button.disabled = false;
        button.classList.remove('disabled');
        if (label) label.classList.remove('hidden');
        if (loader) loader.classList.add('hidden');
    }
}

// === ФУНКЦИИ МОДАЛЬНОГО ОКНА ПОДТВЕРЖДЕНИЯ КОДА ===
let verificationContext = null; // { mode: 'register' | 'login', email, name }

function openVerificationModal(context) {
    verificationContext = context;
    const modal = document.getElementById('verificationModal');
    const message = document.getElementById('verificationModalMessage');
    const codeInput = document.getElementById('verificationCodeInput');
    const errorBox = document.getElementById('verificationModalError');

    if (message) {
        message.textContent = context.mode === 'login'
            ? 'Для завершения входа введите код подтверждения, отправленный на ваш email.'
            : `Мы отправили код подтверждения на ${context.email}. Введите его ниже.`;
    }
    if (errorBox) errorBox.classList.add('hidden');
    if (codeInput) {
        codeInput.value = '';
        setTimeout(() => codeInput.focus(), 50);
    }
    const verifyBtn = document.getElementById('verifyCodeBtn');
    if (verifyBtn) setButtonLoading(verifyBtn, false);

    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function closeVerificationModal(event) {
    if (event && event.target.id !== 'verificationModal') return;
    const modal = document.getElementById('verificationModal');
    if (!modal) return;
    modal.classList.remove('show');
    document.body.style.overflow = '';
    verificationContext = null;
}

function showVerificationError(message) {
    const errorBox = document.getElementById('verificationModalError');
    if (errorBox) {
        errorBox.textContent = message;
        errorBox.classList.remove('hidden');
    }
}

function renderProfileState() {
    const profile = getStoredProfile();
    const isLoggedIn = Boolean(profile);
    const authContent = document.getElementById('authContent');
    const profileContent = document.getElementById('profileContent');
    const profileModalSubtitle = document.getElementById('profileModalSubtitle');
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const profileMode = document.getElementById('profileMode');
    const profileStatus = document.getElementById('profileStatus');
    const profileConfirmation = document.getElementById('profileConfirmation');
    const menuProfileBtn = document.getElementById('menuProfileBtn');
    const menuProfileIcon = menuProfileBtn?.querySelector('i');
    const menuProfileLabel = menuProfileBtn?.querySelector('span');
    const profileCard = document.getElementById('profileCard');
    const profileAvatarWrap = document.getElementById('profileAvatarWrap');
    const profileAvatarPreview = document.getElementById('profileAvatarPreview');
    const profileAvatarFallback = document.getElementById('profileAvatarFallback');
    const profileBorderColorInput = document.getElementById('profileBorderColorInput');
    const profileBadgesBox = document.getElementById('profileBadgesBox');
    const borderColor = profile?.customization?.borderColor || '#6366f1';

    authContent?.classList.toggle('hidden', isLoggedIn);
    profileContent?.classList.toggle('hidden', !isLoggedIn);

    // Рендер бейджиков профиля
    if (profileBadgesBox) {
        const badges = resolveProfileBadges(profile);
        if (isLoggedIn && badges.length) {
            profileBadgesBox.innerHTML = badges.map(id => {
                const def = BADGE_DEFINITIONS[id];
                if (!def) return '';
                return `<div class="profile-badge-item">
                            <span class="profile-badge ${def.className || ''}" title="${def.description}" role="img" aria-label="${def.label}">
                                <i class="fas fa-check profile-badge-check"></i>
                                <i class="${def.icon}"></i> ${def.label}
                            </span>
                            <span class="profile-badge-desc">${def.description}</span>
                        </div>`;
            }).join('');
            profileBadgesBox.classList.remove('hidden');
        } else {
            profileBadgesBox.innerHTML = '';
            profileBadgesBox.classList.add('hidden');
        }
    }

    // Отображение баланса монет в карточке профиля
    const profileCoinsDisplay = document.getElementById('profileCoinsDisplay');
    const profileCoinsText = document.getElementById('profileCoinsText');
    if (profileCoinsDisplay && profileCoinsText) {
        if (isLoggedIn) {
            profileCoinsText.textContent = getProfileCoins(profile);
            profileCoinsDisplay.classList.remove('hidden');
            profileCoinsDisplay.classList.add('flex');
        } else {
            profileCoinsDisplay.classList.add('hidden');
            profileCoinsDisplay.classList.remove('flex');
        }
    }

    if (profileModalSubtitle) {
        profileModalSubtitle.textContent = isLoggedIn
            ? `Добро пожаловать, ${profile.name || 'в профиль'}`
            : 'Войдите или создайте аккаунт';
    }

    if (profileName) profileName.textContent = profile?.name || 'Пользователь';
    if (profileEmail) profileEmail.textContent = profile?.email || '—';
    if (profileMode) {
        profileMode.textContent = profile?.mode === 'register'
            ? 'Аккаунт создан и готов к использованию.'
            : 'Вы вошли в аккаунт и можете пользоваться профилем.';
    }

    if (profileStatus) {
        profileStatus.textContent = isLoggedIn ? 'В профиле активен' : 'Нет активного профиля';
        profileStatus.style.background = isLoggedIn ? 'rgba(16,185,129,0.16)' : 'rgba(255,255,255,0.08)';
        profileStatus.style.color = isLoggedIn ? '#4ade80' : 'var(--text-secondary)';
    }

    if (profileConfirmation) {
        profileConfirmation.textContent = isLoggedIn
            ? 'Изменения применяются автоматически'
            : 'Войдите в профиль, чтобы настроить его';
        profileConfirmation.style.color = isLoggedIn ? '#4ade80' : 'var(--text-secondary)';
    }

    if (profileCard) {
        profileCard.style.borderColor = borderColor;
    }

    if (profileAvatarWrap) {
        profileAvatarWrap.style.borderColor = borderColor;
        // Применяем активную ауру вокруг аватара (класс вешается на родительский
        // контейнер-кольцо #profileAuraRing, если он есть, иначе на сам обёртку)
        const auraRing = document.getElementById('profileAuraRing');
        const auraTarget = auraRing || profileAvatarWrap;
        applyAuraClass(auraTarget, isLoggedIn ? getProfileEquipped(profile) : null);
    }

    if (profileBorderColorInput) {
        profileBorderColorInput.value = borderColor;
    }

    if (profileAvatarPreview) {
        if (profile?.customization?.avatar) {
            profileAvatarPreview.src = profile.customization.avatar;
            profileAvatarPreview.classList.remove('hidden');
            profileAvatarFallback?.classList.add('hidden');
        } else {
            profileAvatarPreview.removeAttribute('src');
            profileAvatarPreview.classList.add('hidden');
            profileAvatarFallback?.classList.remove('hidden');
        }
    }

    if (menuProfileBtn) {
        menuProfileBtn.classList.toggle('active', isLoggedIn);
        menuProfileBtn.classList.toggle('profile-active', isLoggedIn);
        if (menuProfileLabel) {
            const shortName = profile?.name ? profile.name.split(' ')[0] : 'Профиль';
            menuProfileLabel.textContent = isLoggedIn ? shortName : 'Профиль';
        }
        if (menuProfileIcon) {
            menuProfileIcon.className = isLoggedIn ? 'fas fa-user-check' : 'fas fa-user';
        }
    }
}

function openProfileModal() {
    if (openModalById('profileDevModal')) lockScroll();
}

function closeProfileModal(event) {
    if (event && event.target.id !== 'profileModal') return;
    closeModalById('profileModal');
    unlockScroll();
}

function closeProfileDevModal(event) {
    if (event && event.target.id !== 'profileDevModal') return;
    closeModalById('profileDevModal');
    unlockScroll();
}

function openProfileResetConfirmModal() {
    if (openModalById('profileResetConfirmModal')) lockScroll();
}

function closeProfileResetConfirmModal(event) {
    if (event && event.target.id !== 'profileResetConfirmModal') return;
    closeModalById('profileResetConfirmModal');
    unlockScroll();
}

function confirmProfileReset() {
    const profile = getStoredProfile();
    if (!profile) {
        closeProfileResetConfirmModal();
        return;
    }
    const nextProfile = {
        ...profile,
        customization: {}
    };
    saveProfile(nextProfile);
    saveCustomizationToAccount(nextProfile);
    renderProfileState();
    closeProfileResetConfirmModal();
    showNotification('Настройки профиля сброшены', { type: 'info', duration: 2200, force: true });
}

function switchAuthTab(mode) {
    const loginTab = document.getElementById('authLoginTab');
    const registerTab = document.getElementById('authRegisterTab');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    if (!loginTab || !registerTab || !loginForm || !registerForm) return;
    const isLogin = mode === 'login';
    loginTab.classList.toggle('active', isLogin);
    registerTab.classList.toggle('active', !isLogin);
    loginForm.classList.toggle('hidden', !isLogin);
    registerForm.classList.toggle('hidden', isLogin);
}

function initProfileAuth() {
    const menuProfileBtn = document.getElementById('menuProfileBtn');
    const loginTab = document.getElementById('authLoginTab');
    const registerTab = document.getElementById('authRegisterTab');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const profileLogoutBtn = document.getElementById('profileLogoutBtn');
    const profileAvatarInput = document.getElementById('profileAvatarInput');
    const profileBorderColorInput = document.getElementById('profileBorderColorInput');
    const profileResetCustomizationBtn = document.getElementById('profileResetCustomizationBtn');
    const profileConfirmation = document.getElementById('profileConfirmation');

    menuProfileBtn?.addEventListener('click', () => {
        openProfileModal();
    });

    loginTab?.addEventListener('click', () => switchAuthTab('login'));
    registerTab?.addEventListener('click', () => switchAuthTab('register'));

    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    const registerSubmitBtn = document.getElementById('registerSubmitBtn');

    // Очистка ошибок при вводе
    ['loginEmailInput', 'loginPasswordInput'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', (e) => {
            clearFieldError(e.target);
            clearAuthError();
        });
    });
    ['registerNameInput', 'registerEmailInput', 'registerPasswordInput', 'registerPasswordConfirmInput'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', (e) => {
            clearFieldError(e.target);
            clearAuthError();
        });
    });

    // === ВХОД ===
    loginForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        clearAuthError();
        clearAllFieldErrors(loginForm);

        const emailInput = document.getElementById('loginEmailInput');
        const passwordInput = document.getElementById('loginPasswordInput');
        const email = emailInput?.value.trim() || '';
        const password = passwordInput?.value || '';

        let valid = true;
        if (!email) {
            showFieldError(emailInput, 'Введите email');
            valid = false;
        } else if (!isValidEmail(email)) {
            showFieldError(emailInput, 'Некорректный email');
            valid = false;
        }
        if (!password) {
            showFieldError(passwordInput, 'Введите пароль');
            valid = false;
        }
        if (!valid) return;

        const accounts = getAccounts();
        const normalizedEmail = normalizeEmail(email);
        const account = accounts[normalizedEmail];

        if (!account) {
            showFieldError(emailInput, 'Аккаунт с таким email не найден. Проверьте данные или зарегистрируйтесь.');
            return;
        }
        if (account.password !== password) {
            showFieldError(passwordInput, 'Неверный пароль');
            return;
        }

        // Показываем лоадер, генерируем код подтверждения и открываем окно
        setButtonLoading(loginSubmitBtn, true);
        setTimeout(() => {
            setButtonLoading(loginSubmitBtn, false);
            // Генерируем и сохраняем код входа для аккаунта
            const accounts = getAccounts();
            const normalized = normalizeEmail(account.email);
            if (accounts[normalized]) {
                accounts[normalized]._loginCode = generateVerificationCode();
                saveAccounts(accounts);
            }
            openVerificationModal({
                mode: 'login',
                email: account.email,
                name: account.name
            });
        }, 900);
    });

    // === РЕГИСТРАЦИЯ ===
    registerForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        clearAuthError();
        clearAllFieldErrors(registerForm);

        const nameInput = document.getElementById('registerNameInput');
        const emailInput = document.getElementById('registerEmailInput');
        const passwordInput = document.getElementById('registerPasswordInput');
        const passwordConfirmInput = document.getElementById('registerPasswordConfirmInput');
        const name = nameInput?.value.trim() || '';
        const email = emailInput?.value.trim() || '';
        const password = passwordInput?.value || '';
        const passwordConfirm = passwordConfirmInput?.value || '';

        let valid = true;
        if (!name) {
            showFieldError(nameInput, 'Введите имя');
            valid = false;
        }
        if (!email) {
            showFieldError(emailInput, 'Введите email');
            valid = false;
        } else if (!isValidEmail(email)) {
            showFieldError(emailInput, 'Некорректный email');
            valid = false;
        }
        if (!password) {
            showFieldError(passwordInput, 'Введите пароль');
            valid = false;
        } else if (password.length < 6) {
            showFieldError(passwordInput, 'Пароль должен содержать минимум 6 символов');
            valid = false;
        }
        if (!passwordConfirm) {
            showFieldError(passwordConfirmInput, 'Подтвердите пароль');
            valid = false;
        } else if (password !== passwordConfirm) {
            showFieldError(passwordConfirmInput, 'Пароли не совпадают');
            valid = false;
        }
        if (!valid) return;

        const accounts = getAccounts();
        const normalizedEmail = normalizeEmail(email);
        if (accounts[normalizedEmail]) {
            showFieldError(emailInput, 'Аккаунт с таким email уже зарегистрирован. Войдите.');
            return;
        }

        // Показываем лоадер и сохраняем незавершённую регистрацию
        setButtonLoading(registerSubmitBtn, true);
        setTimeout(() => {
            setButtonLoading(registerSubmitBtn, false);
            storePendingRegistration({
                name,
                email: normalizedEmail,
                password
            });
            openVerificationModal({
                mode: 'register',
                email: normalizedEmail,
                name
            });
        }, 900);
    });

    profileAvatarInput?.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const profile = getStoredProfile();
            if (!profile) return;
            const nextProfile = {
                ...profile,
                customization: {
                    ...(profile.customization || {}),
                    avatar: reader.result
                }
            };
            saveProfile(nextProfile);
            saveCustomizationToAccount(nextProfile);
            renderProfileState();
            if (profileConfirmation) {
                profileConfirmation.textContent = 'Изменения подтверждены автоматически';
                profileConfirmation.style.color = '#4ade80';
            }
            showNotification('Изменения в профиле сохранены', { type: 'success', duration: 2200, force: true });
        };
        reader.readAsDataURL(file);
    });

    profileBorderColorInput?.addEventListener('input', (event) => {
        const color = event.target.value;
        const profile = getStoredProfile();
        if (!profile) return;
        const nextProfile = {
            ...profile,
            customization: {
                ...(profile.customization || {}),
                borderColor: color
            }
        };
        saveProfile(nextProfile);
        saveCustomizationToAccount(nextProfile);
        renderProfileState();
        if (profileConfirmation) {
            profileConfirmation.textContent = 'Изменения подтверждены автоматически';
            profileConfirmation.style.color = '#4ade80';
        }
        showNotification('Изменения в профиле сохранены', { type: 'success', duration: 2200, force: true });
    });

    // === СМЕНА НИКА ===
    const changeNameBtn = document.getElementById('changeNameBtn');
    const profileNameInput = document.getElementById('profileNameInput');

    function saveNameToAccount(profile) {
        if (!profile?.email) return;
        const accounts = getAccounts();
        const email = normalizeEmail(profile.email);
        if (accounts[email]) {
            accounts[email].name = profile.name;
            saveAccounts(accounts);
        }
    }

    const handleNameChange = () => {
        const profile = getStoredProfile();
        if (!profile) return;
        const newName = (profileNameInput?.value || '').trim();

        if (!newName) {
            showNotification('Введите новый ник', { type: 'warning', duration: 2200, force: true });
            return;
        }
        if (newName.length < 2) {
            showNotification('Ник должен содержать минимум 2 символа', { type: 'warning', duration: 2200, force: true });
            return;
        }
        if (newName.length > 30) {
            showNotification('Ник не должен превышать 30 символов', { type: 'warning', duration: 2200, force: true });
            return;
        }

        const nextProfile = { ...profile, name: newName };
        saveProfile(nextProfile);
        saveNameToAccount(nextProfile);
        if (profileNameInput) profileNameInput.value = '';
        renderProfileState();
        showNotification('Ник успешно изменён', { type: 'success', duration: 2600, force: true });
    };

    changeNameBtn?.addEventListener('click', handleNameChange);
    profileNameInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleNameChange();
    });

    profileResetCustomizationBtn?.addEventListener('click', () => {
        const profile = getStoredProfile();
        if (!profile) return;
        openProfileResetConfirmModal();
    });

    document.getElementById('profileResetConfirmCancelBtn')?.addEventListener('click', () => {
        closeProfileResetConfirmModal();
    });

    document.getElementById('profileResetConfirmOkBtn')?.addEventListener('click', () => {
        confirmProfileReset();
    });

    profileLogoutBtn?.addEventListener('click', () => {
        clearStoredProfile();
        renderProfileState();
        switchAuthTab('login');
        showNotification('Вы вышли из профиля', { type: 'info', duration: 2200, force: true });
    });

    // === ПОДТВЕРЖДЕНИЕ КОДА ===
    const verifyCodeBtn = document.getElementById('verifyCodeBtn');
    const resendCodeBtn = document.getElementById('resendCodeBtn');
    const verificationCodeInput = document.getElementById('verificationCodeInput');

    verifyCodeBtn?.addEventListener('click', () => {
        if (!verificationContext) return;
        const codeInput = document.getElementById('verificationCodeInput');
        const code = codeInput?.value.trim() || '';
        const errorBox = document.getElementById('verificationModalError');

        if (errorBox) errorBox.classList.add('hidden');

        if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
            showVerificationError('Введите 6-значный код подтверждения.');
            return;
        }

        setButtonLoading(verifyCodeBtn, true);

        setTimeout(() => {
            setButtonLoading(verifyCodeBtn, false);

            if (verificationContext.mode === 'register') {
                const pending = getPendingRegistration();
                if (!pending || normalizeEmail(pending.email) !== normalizeEmail(verificationContext.email)) {
                    showVerificationError('Срок действия регистрации истёк. Попробуйте ещё раз.');
                    return;
                }
                if (pending.code !== code) {
                    showVerificationError('Неверный код. Попробуйте ещё раз.');
                    return;
                }

                // Регистрация подтверждена — создаём аккаунт
                const accounts = getAccounts();
                const email = normalizeEmail(pending.email);
                if (accounts[email]) {
                    showVerificationError('Аккаунт с таким email уже существует.');
                    return;
                }
                accounts[email] = {
                    name: pending.name,
                    email,
                    password: pending.password,
                    createdAt: new Date().toISOString(),
                    verified: true,
                    customization: {},
                    coins: STARTING_COINS,
                    inventory: [],
                    equipped: null
                };
                saveAccounts(accounts);
                clearPendingRegistration();

                const profile = {
                    name: pending.name,
                    email,
                    mode: 'register',
                    createdAt: new Date().toISOString(),
                    customization: {},
                    badges: loadBadgesFromAccount(email),
                    coins: STARTING_COINS,
                    inventory: [],
                    equipped: null
                };
                saveProfile(profile);
                closeVerificationModal();
                renderProfileState();
                showNotification('Аккаунт создан и подтверждён!', { type: 'success', duration: 3000, force: true });
            } else {
                // Вход подтверждён
                const accounts = getAccounts();
                const email = normalizeEmail(verificationContext.email);
                const account = accounts[email];
                if (!account) {
                    showVerificationError('Аккаунт не найден.');
                    return;
                }
                // Проверяем код подтверждения входа (генерируется на шаге входа)
                if (account._loginCode && account._loginCode !== code) {
                    showVerificationError('Неверный код. Попробуйте ещё раз.');
                    return;
                }

                const profile = {
                    name: account.name,
                    email: account.email,
                    mode: 'login',
                    createdAt: account.createdAt,
                    customization: account.customization || {},
                    badges: loadBadgesFromAccount(account.email),
                    coins: loadCoinsFromAccount(account.email),
                    inventory: loadInventoryFromAccount(account.email),
                    equipped: loadEquippedFromAccount(account.email)
                };
                saveProfile(profile);
                closeVerificationModal();
                renderProfileState();
                showNotification('Вы вошли в профиль', { type: 'success', duration: 3000, force: true });
            }
        }, 800);
    });

    resendCodeBtn?.addEventListener('click', () => {
        if (!verificationContext) return;
        const errorBox = document.getElementById('verificationModalError');
        if (errorBox) errorBox.classList.add('hidden');

        if (verificationContext.mode === 'register') {
            const pending = getPendingRegistration();
            if (pending && normalizeEmail(pending.email) === normalizeEmail(verificationContext.email)) {
                pending.code = generateVerificationCode();
                storePendingRegistration(pending);
            }
        } else {
            const accounts = getAccounts();
            const email = normalizeEmail(verificationContext.email);
            if (accounts[email]) {
                accounts[email]._loginCode = generateVerificationCode();
                saveAccounts(accounts);
            }
        }

        const codeInput = document.getElementById('verificationCodeInput');
        if (codeInput) codeInput.value = '';

        showNotification('Новый код отправлен на ваш email', { type: 'info', duration: 2600, force: true });
    });

    // Автопереход к следующему шагу после ввода 6 цифр
    verificationCodeInput?.addEventListener('input', () => {
        const errorBox = document.getElementById('verificationModalError');
        if (errorBox) errorBox.classList.add('hidden');
    });
    verificationCodeInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') verifyCodeBtn?.click();
    });

    renderProfileState();
    switchAuthTab('login');

    // Проверяем, что сохранённый профиль всё ещё существует в аккаунтах.
    // Если нет — сбрасываем локальный профиль, чтобы не показывать несуществующий аккаунт.
    const storedProfile = getStoredProfile();
    if (storedProfile?.email) {
        const accounts = getAccounts();
        const email = normalizeEmail(storedProfile.email);
        if (!accounts[email]) {
            clearStoredProfile();
            renderProfileState();
        }
    }
}

function initNavigation() {
    const menuToggle = document.getElementById('menuToggle');
    const mobileMenuOpenBtn = document.getElementById('mobileMenuOpenBtn');
    const closeMenu = document.getElementById('closeMenu');
    const backdrop = document.getElementById('mobileMenuBackdrop');
    const container = document.getElementById('mobileMenuContainer');

    function openMobileMenu() {
        backdrop?.classList.add('active');
        container?.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeMobileMenu() {
        backdrop?.classList.remove('active');
        container?.classList.remove('active');
        document.body.style.overflow = '';
    }

    window.openMobileMenu = openMobileMenu;
    window.closeMobileMenu = closeMobileMenu;

    menuToggle?.addEventListener('click', openMobileMenu);
    mobileMenuOpenBtn?.addEventListener('click', openMobileMenu);
    closeMenu?.addEventListener('click', closeMobileMenu);
    backdrop?.addEventListener('click', closeMobileMenu);
    document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', closeMobileMenu));

    window.addEventListener('scroll', debounce(() => {
        const sections = document.querySelectorAll('section[id]');
        const scrollPos = window.scrollY + 100;
        sections.forEach(section => {
            if (scrollPos >= section.offsetTop && scrollPos < section.offsetTop + section.clientHeight) {
                document.querySelectorAll('.nav-link').forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${section.id}`) link.classList.add('active');
                });
            }
        });
    }, 100));
}

function initScrollTopButton() {
    const btn = document.getElementById('scrollTopBtn');
    const footer = document.querySelector('footer');
    
    function updateButtonPosition() {
        if (!footer) return;
        const footerTop = footer.getBoundingClientRect().top;
        const windowHeight = window.innerHeight;
        
        if (footerTop < windowHeight + 100) {
            btn.style.bottom = (windowHeight - footerTop + 20) + 'px';
        } else {
            btn.style.bottom = '2rem';
        }
    }
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 500) {
            btn.classList.add('visible');
            updateButtonPosition();
        } else {
            btn.classList.remove('visible');
        }
    });
    
    window.addEventListener('resize', updateButtonPosition);
    
    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

class VideoSystem {
    constructor() {
        this.videoList = document.getElementById('videoList');
        this.videoSearch = document.getElementById('videoSearch');
        this.sortSelect = document.getElementById('sortSelect');
        this.resetFilters = document.getElementById('resetFilters');
        this.loadAllVideos = document.getElementById('loadAllVideos');
        this.noVideosMessage = document.getElementById('noVideosMessage');
        this.videoCounter = document.getElementById('videoCounter');
        this.dateFilterBtns = document.querySelectorAll('.date-filter-btn');
        this.currentPage = 1;
        this.videosPerPage = 6;
        this.filteredVideos = [...videoData];
        this.initEvents();
        this.renderVideos();
    }
    
    showSkeleton() {
        if (!this.videoList) return;
        this.videoList.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const skeleton = document.createElement('div');
            skeleton.className = 'skeleton-card';
            skeleton.innerHTML = `
                <div class="skeleton-thumbnail"></div>
                <div class="skeleton-title"></div>
                <div class="skeleton-stats"></div>
            `;
            this.videoList.appendChild(skeleton);
        }
    }
    
    refresh(newData) {
        this.filteredVideos = [...newData];
        this.currentPage = 1;
        this.applyFiltersAndSort();
    }
    
    applyFiltersAndSort() {
        let filtered = [...videoData];
        
        const searchTerm = this.videoSearch.value.toLowerCase();
        if (searchTerm) {
            filtered = filtered.filter(v => v.title.toLowerCase().includes(searchTerm));
        }
        
        if (currentDateFilter > 0) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - currentDateFilter);
            cutoffDate.setHours(0, 0, 0, 0);
            filtered = filtered.filter(v => {
                const videoDate = new Date(v.publishedAt);
                videoDate.setHours(0, 0, 0, 0);
                return videoDate >= cutoffDate;
            });
        }
        
        const sortValue = this.sortSelect.value;
        filtered.sort((a, b) => {
            switch(sortValue) {
                case 'date-desc': return new Date(b.publishedAt) - new Date(a.publishedAt);
                case 'date-asc': return new Date(a.publishedAt) - new Date(b.publishedAt);
                case 'views-desc': return (parseInt(b.views) || 0) - (parseInt(a.views) || 0);
                case 'views-asc': return (parseInt(a.views) || 0) - (parseInt(b.views) || 0);
                case 'title-asc': return a.title.localeCompare(b.title, 'ru');
                case 'title-desc': return b.title.localeCompare(a.title, 'ru');
                default: return 0;
            }
        });
        
        this.filteredVideos = filtered;
        this.currentPage = 1;
        this.renderVideos(this.filteredVideos);
        this.updateCounter();
    }
    
    updateCounter() {
        if (this.videoCounter) {
            this.videoCounter.innerHTML = `<i class="fas fa-video mr-2"></i>Всего видео: ${this.filteredVideos.length}`;
        }
    }
    
    initEvents() {
        this.videoSearch.addEventListener('input', debounce(() => this.applyFiltersAndSort(), 300));
        this.sortSelect.addEventListener('change', () => this.applyFiltersAndSort());
        this.resetFilters.addEventListener('click', () => {
            this.videoSearch.value = '';
            this.sortSelect.value = 'date-desc';
            currentDateFilter = 0;
            this.dateFilterBtns.forEach(btn => btn.classList.remove('active'));
            document.querySelector('.date-filter-btn[data-days="0"]')?.classList.add('active');
            this.applyFiltersAndSort();
            showNotification('Все фильтры сброшены', { type: 'info', duration: 1800 });
        });
        this.dateFilterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const days = parseInt(btn.getAttribute('data-days'));
                currentDateFilter = days;
                this.dateFilterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.applyFiltersAndSort();
            });
        });
        this.loadAllVideos?.addEventListener('click', async () => {
            await updateVideosFromYouTube();
            this.videosPerPage = this.filteredVideos.length || 50;
            this.renderVideos(this.filteredVideos);
            this.updateCounter();
        });
    }
    
    createVideoElement(video) {
        const div = document.createElement('div');
        div.className = 'modern-card overflow-hidden animate-fadeInUp';
        div.innerHTML = `
            <div class="video-thumbnail cursor-pointer" data-video-id="${video.id}">
                <img src="${video.thumbnail}" alt="${video.title.replace(/"/g, '&quot;')}" loading="lazy" onerror="this.onerror=null;this.src='https://placehold.co/640x360/1e293b/cbd5e1?text=No+preview'">
                <div class="video-duration">${video.duration}</div>
                <div class="absolute inset-0 flex items-center justify-center"><div class="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center"><i class="fab fa-youtube text-white text-2xl"></i></div></div>
            </div>
            <div class="p-4">
                <h3 class="font-semibold mb-2 line-clamp-2">${video.title.replace(/"/g, '&quot;')}</h3>
                <div class="flex justify-between items-center text-sm" style="color: var(--text-secondary);">
                    <span><i class="fas fa-eye mr-1"></i>${video.views} просмотров</span>
                    <span><i class="far fa-calendar-alt mr-1"></i>${formatDate(video.publishedAt)}</span>
                </div>
                <div class="mt-4" id="player-${video.id}"></div>
            </div>
        `;
        return div;
    }
    
    renderVideos(videos = this.filteredVideos, page = this.currentPage, append = false) {
        if (!append) { this.videoList.innerHTML = ''; this.currentPage = 1; }
        const start = (page - 1) * this.videosPerPage;
        const end = start + this.videosPerPage;
        const videosToShow = videos.slice(start, end);
        if (videosToShow.length === 0 && !append) {
            this.noVideosMessage.classList.remove('hidden');
            this.loadAllVideos.style.display = 'none';
            return;
        }
        this.noVideosMessage.classList.add('hidden');
        videosToShow.forEach(video => this.videoList.appendChild(this.createVideoElement(video)));
        this.loadAllVideos.style.display = end < videos.length ? 'block' : 'none';
        this.initVideoPlayers();
    }
    
    initVideoPlayers() {
        document.querySelectorAll('.video-thumbnail').forEach(thumb => {
            thumb.removeEventListener('click', thumb._clickHandler);
            thumb._clickHandler = () => {
                const videoId = thumb.getAttribute('data-video-id');
                const video = videoData.find(v => v.id == videoId);
                const container = document.getElementById(`player-${videoId}`);
                if (!video) return;
                document.querySelectorAll('[id^="player-"]').forEach(c => { if (c.id !== `player-${videoId}`) c.innerHTML = ''; });
                if (container.innerHTML) { container.innerHTML = ''; return; }
                container.innerHTML = `
                    <div class="video-player-container"><iframe src="https://www.youtube.com/embed/${video.videoId}?autoplay=1&modestbranding=1&rel=0" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>
                    <button class="btn-secondary w-full close-player-btn"><i class="fas fa-times"></i> Скрыть плеер</button>
                `;
                container.querySelector('.close-player-btn').addEventListener('click', (e) => { e.stopPropagation(); container.innerHTML = ''; });
                if (typeof gtag !== 'undefined') {
                    gtag('event', 'video_play', { event_category: 'video', event_label: 'youtube' });
                }
            };
            thumb.addEventListener('click', thumb._clickHandler);
        });
    }
}

const twitchClipsData = [
    { id: "t1", title: "ЧУТЬ НЕ СПАЛИЛ", views: "19", duration: "0:60", thumbnail: "", url: "https://www.twitch.tv/mortisplay32", embedUrl: "https://clips.twitch.tv/embed?clip=ObedientDullMangoUWot-NOlOV2qo4qO7ZUL2", game: "Общение" },
    { id: "t2", title: "ЧТО ЗА ТАЙМИНГ?!", views: "6", duration: "0:18", thumbnail: "", url: "https://www.twitch.tv/mortisplay32", embedUrl: "https://clips.twitch.tv/embed?clip=FrigidCrispyShingleTheTarFu-XVttdiPOvOgsGIFm", game: "R.E.P.O." },
    { id: "t3", title: "ПУНЬК", views: "29", duration: "0:30", thumbnail: "", url: "https://www.twitch.tv/mortisplay32", embedUrl: "https://clips.twitch.tv/embed?clip=WanderingBelovedBeaverGingerPower-BwSFIOn5RR_Sf1A3", game: "PEAK" },
    { id: "t4", title: "Повторил и убил, конец удивил 0_0", views: "15", duration: "0:24", thumbnail: "", url: "https://www.twitch.tv/mortisplay32", embedUrl: "https://clips.twitch.tv/embed?clip=MoldyWiseYogurtUnSane-LmJRvU5PxCwWHkIm", game: "CS2" },
    { id: "t5", title: "Смешной момент в эфире", views: "12", duration: "0:41", thumbnail: "", url: "https://www.twitch.tv/mortisplay32", embedUrl: "https://clips.twitch.tv/embed?clip=ObedientDullMangoUWot-NOlOV2qo4qO7ZUL2", game: "Just Chatting" },
    { id: "t6", title: "Новый хайлайт из стрима", views: "21", duration: "0:33", thumbnail: "", url: "https://www.twitch.tv/mortisplay32", embedUrl: "https://clips.twitch.tv/embed?clip=FrigidCrispyShingleTheTarFu-XVttdiPOvOgsGIFm", game: "Общение" }
];

function getTwitchParentParams() {
    const currentHost = window.location.hostname || 'mortisplay.ru';
    const hosts = [currentHost, currentHost.replace(/^www\./, ''), currentHost.startsWith('www.') ? currentHost.replace(/^www\./, '') : `www.${currentHost}`].filter(Boolean);
    const uniqueHosts = [...new Set(hosts)];
    return uniqueHosts.map(host => `parent=${encodeURIComponent(host)}`).join('&');
}

function initTwitchClipsSystem() {
    const grid = document.getElementById('twitchClipsGrid');
    const loadMore = document.getElementById('loadMoreTwitchClips');
    const section = document.getElementById('twitch-clips');
    if (section) {
        section.innerHTML = `
            <div class="container-padding max-w-3xl mx-auto text-center">
                <i class="fab fa-twitch text-5xl mb-5" style="color:#9146ff;"></i>
                <h2 class="gradient-text text-4xl md:text-5xl font-bold mb-4">Twitch в разработке</h2>
                <p style="color: var(--text-secondary);">Раздел клипов временно недоступен. Автоматическая загрузка клипов появится после подключения необходимой инфраструктуры.</p>
            </div>`;
        return;
    }
    const parentParams = getTwitchParentParams();
    
    let page = 1;
    const perPage = 6;
    function render(append = false) {
        if (!append) { grid.innerHTML = ''; page = 1; }
        const start = (page - 1) * perPage;
        const clips = twitchClipsData.slice(start, start + perPage);
        if (!clips.length) { loadMore.style.display = 'none'; return; }
        clips.forEach((clip, i) => {
            const div = document.createElement('div');
            div.className = 'twitch-clip-card animate-fadeInUp';
            div.style.animationDelay = `${(start + i) * 0.1}s`;
            const colors = { 'Общение': 'from-purple-600 to-pink-600', 'R.E.P.O.': 'from-red-600 to-orange-600', 'PEAK': 'from-blue-600 to-cyan-600', 'CS2': 'from-yellow-600 to-orange-600' };
            div.innerHTML = `<div class="relative"><div class="relative rounded-lg overflow-hidden mb-3 cursor-pointer twitch-thumbnail" data-clip-id="${clip.id}"><div class="bg-gradient-to-br ${colors[clip.game] || 'from-purple-600 to-pink-600'} aspect-video flex items-center justify-center"><img src="${clip.thumbnail}" alt="${clip.title.replace(/"/g, '&quot;')}" class="w-full h-full object-cover absolute inset-0" onerror="this.style.display='none'; this.parentElement.querySelector('.fallback').style.display='flex';"><div class="fallback hidden flex-col items-center justify-center text-white p-4 text-center"><i class="fab fa-twitch text-5xl mb-2 opacity-50"></i><p class="text-sm font-medium">${clip.game}</p><p class="text-xs opacity-75 mt-1">Нажмите для просмотра</p></div><div class="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-all duration-300"><div class="w-16 h-16 rounded-full bg-purple-600/80 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-300"><i class="fas fa-play text-white text-2xl"></i></div></div></div><div class="absolute top-2 right-2 z-10"><span class="twitch-views"><i class="fas fa-eye"></i> ${clip.views}</span></div><div class="absolute bottom-2 left-2 z-10"><span class="bg-purple-600 text-white text-xs px-2 py-1 rounded">${clip.game}</span></div><div class="absolute bottom-2 right-2 z-10"><span class="bg-black/70 text-white text-xs px-2 py-1 rounded">${clip.duration}</span></div></div><h3 class="font-semibold mb-2 line-clamp-2">${clip.title.replace(/"/g, '&quot;')}</h3><div class="flex items-center justify-between mb-3"><span class="text-sm" style="color: var(--text-secondary);"><i class="fab fa-twitch text-purple-500 mr-1"></i>Twitch клип</span><a href="${clip.url}" target="_blank" class="text-purple-500 hover:text-purple-400 text-sm">Открыть на Twitch <i class="fas fa-external-link-alt ml-1"></i></a></div><div id="twitch-player-${clip.id}"></div></div>`;
            grid.appendChild(div);
        });
        loadMore.style.display = start + perPage < twitchClipsData.length ? 'block' : 'none';
        initPlayers();
    }
    function initPlayers() {
        document.querySelectorAll('.twitch-thumbnail').forEach(thumb => {
            thumb.removeEventListener('click', thumb._twitchHandler);
            thumb._twitchHandler = () => {
                const clipId = thumb.getAttribute('data-clip-id');
                const clip = twitchClipsData.find(c => c.id === clipId);
                const container = document.getElementById(`twitch-player-${clipId}`);
                if (!clip) return;
                document.querySelectorAll('[id^="twitch-player-"]').forEach(c => { if (c.id !== `twitch-player-${clipId}`) c.innerHTML = ''; });
                if (container.innerHTML) { container.innerHTML = ''; return; }
                container.innerHTML = `<div class="video-player-container twitch-player-container"><iframe src="${clip.embedUrl}&${parentParams}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div><button class="btn-secondary w-full close-player-btn"><i class="fas fa-times"></i> Скрыть плеер</button>`;
                container.querySelector('.close-player-btn').addEventListener('click', (e) => { e.stopPropagation(); container.innerHTML = ''; });
                if (typeof gtag !== 'undefined') {
                    gtag('event', 'twitch_clip_play', { event_category: 'twitch', event_label: clip.game });
                }
            };
            thumb.addEventListener('click', thumb._twitchHandler);
        });
    }
    render();
    loadMore.addEventListener('click', () => { page++; render(true); });
}

function initScrollSystem() {
    const progress = document.querySelector('.scroll-progress');
    window.addEventListener('scroll', () => {
        const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        if (height > 0) {
            progress.style.width = (winScroll / height) * 100 + '%';
        }
    });
}

function initLoader() {
    const loader = document.getElementById('loader');
    const content = document.getElementById('siteContent');
    setTimeout(() => {
        loader.style.opacity = '0';
        setTimeout(() => { loader.style.display = 'none'; content.classList.remove('hidden'); }, 500);
    }, 1000);
}

function trackAnalyticsEvent(eventName, params = {}) {
    if (typeof window.gtag === 'function') {
        window.gtag('event', eventName, {
            page_title: document.title,
            page_location: window.location.href,
            ...params
        });
    }
}

function initAnalyticsTracking() {
    document.querySelectorAll('.nav-link').forEach((link) => {
        link.addEventListener('click', () => {
            trackAnalyticsEvent('navigation_click', {
                target: link.textContent.trim(),
                href: link.getAttribute('href') || ''
            });
        });
    });

    const trackedElements = document.querySelectorAll(
        '.btn-action-contact, .btn-action-bio, .btn-action-qa, .btn-action-faq, .btn-action-year, .btn-action-youtube, .social-btn, #videoFaqBtn, #loadAllVideos, #loadMoreTwitchClips, #themeToggle, #settingsToggle, #resetFilters'
    );

    trackedElements.forEach((element) => {
        const eventName = element.id === 'themeToggle'
            ? 'theme_toggle'
            : element.id === 'settingsToggle'
                ? 'settings_open'
                : element.id === 'videoFaqBtn'
                    ? 'video_faq_open'
                    : element.id === 'resetFilters'
                        ? 'filters_reset'
                        : element.id === 'loadAllVideos'
                            ? 'load_more_videos'
                            : element.id === 'loadMoreTwitchClips'
                                ? 'load_more_twitch_clips'
                                : element.classList.contains('social-btn')
                                    ? 'social_click'
                                    : 'cta_click';

        element.addEventListener('click', () => {
            trackAnalyticsEvent(eventName, {
                element: element.textContent.trim() || element.getAttribute('aria-label') || element.id || 'unknown',
                href: element.getAttribute('href') || ''
            });
        });
    });
}

function showWelcomeMessageOnce() {
    if (!localStorage.getItem('hasSeenWelcome')) {
        localStorage.setItem('hasSeenWelcome', 'true');
    }
}

// === АДМИН-ПАНЕЛЬ (выдача бейджей по секретному коду) ===
// Секретный код для входа в админ-панель. В исходниках хранится только SHA-256 хеш.
// Чтобы сменить код: 1) вычислите SHA-256 нового кода, 2) вставьте хеш ниже.
const ADMIN_PASS_HASH = 'd245fec3edca3b4648991d99fabf4f1f1a295a6a816e1cb78b50df3ad8ec8bd2';

async function sha256Hex(str) {
    const data = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function openAdminModal() {
    if (!openModalById('adminModal')) return;
    lockScroll();
    const auth = document.getElementById('adminAuth');
    const panel = document.getElementById('adminPanel');
    if (auth) auth.classList.remove('hidden');
    if (panel) panel.classList.add('hidden');
    const passInput = document.getElementById('adminPassInput');
    if (passInput) passInput.value = '';
    document.getElementById('adminAuthError')?.classList.add('hidden');
}

function closeAdminModal(event) {
    if (event && event.target.id !== 'adminModal') return;
    closeModalById('adminModal');
    unlockScroll();
}

async function submitAdminPass() {
    const input = document.getElementById('adminPassInput');
    const err = document.getElementById('adminAuthError');
    const value = input ? input.value.trim() : '';
    const digest = value ? await sha256Hex(value) : '';
    if (digest && digest === ADMIN_PASS_HASH) {
        if (err) err.classList.add('hidden');
        document.getElementById('adminAuth')?.classList.add('hidden');
        document.getElementById('adminPanel')?.classList.remove('hidden');
        renderAdminAccounts();
    } else {
        if (err) err.textContent = 'Неверный секретный код';
        if (err) err.classList.remove('hidden');
    }
}

function renderAdminAccounts() {
    const list = document.getElementById('adminAccountList');
    if (!list) return;
    const accounts = getAccounts();
    const emails = Object.keys(accounts).filter(e => accounts[e] && accounts[e].email);
    if (!emails.length) {
        list.innerHTML = '<p class="text-sm" style="color: var(--text-secondary);">Аккаунтов пока нет. Зарегистрируйте профиль, чтобы управлять бейджами.</p>';
        return;
    }
    const badgeIds = Object.keys(BADGE_DEFINITIONS);
    list.innerHTML = emails.map(email => {
        const acc = accounts[email];
        const badges = Array.isArray(acc.badges) ? acc.badges : [];
        const toggles = badgeIds.map(id => {
            const def = BADGE_DEFINITIONS[id];
            const checked = badges.includes(id);
            return `<label class="flex items-center gap-2 text-sm">
                        <input type="checkbox" data-badge="${id}" data-email="${email}" ${checked ? 'checked' : ''} class="admin-badge-toggle h-4 w-4 accent-indigo-500">
                        <span>${def.label}</span>
                    </label>`;
        }).join('');
        const coins = (Number.isFinite(parseInt(acc.coins, 10)) && parseInt(acc.coins, 10) >= 0) ? parseInt(acc.coins, 10) : STARTING_COINS;
        return `<div class="rounded-xl border p-3" style="border-color: var(--glass-border); background: rgba(255,255,255,0.06);">
                    <div class="font-medium text-sm mb-2">${acc.name || 'Пользователь'} <span style="color: var(--text-secondary);">${email}</span></div>
                    <div class="flex flex-wrap gap-4">${toggles}</div>
                    <div class="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t" style="border-color: var(--glass-border);">
                        <span class="text-sm font-medium"><i class="fas fa-coins" style="color:#f59e0b;"></i> Монеты: ${coins}</span>
                        <input type="number" min="0" step="100" value="100" class="admin-coins-input h-8 w-24 rounded-lg border px-2 text-sm" data-email="${email}" style="background: rgba(255,255,255,0.08); border-color: var(--glass-border); color: var(--text-primary);">
                        <button type="button" class="admin-coins-give btn-secondary" data-email="${email}" style="padding:0.4rem 0.75rem; font-size:0.8rem;">Выдать</button>
                    </div>
                </div>`;
    }).join('');
    list.querySelectorAll('.admin-coins-give').forEach(btn => {
        btn.addEventListener('click', () => {
            const accEmail = btn.dataset.email;
            const input = list.querySelector(`.admin-coins-input[data-email="${accEmail}"]`);
            const amount = parseInt(input?.value, 10) || 0;
            if (amount <= 0) {
                showNotification('Введите положительное число монет', { type: 'warning', duration: 2200, force: true });
                return;
            }
            const accounts = getAccounts();
            const norm = normalizeEmail(accEmail);
            const cur = (Number.isFinite(parseInt(accounts[norm]?.coins, 10)) && parseInt(accounts[norm].coins, 10) >= 0) ? parseInt(accounts[norm].coins, 10) : 0;
            accounts[norm].coins = cur + amount;
            saveAccounts(accounts);
            showNotification(`Выдано ${amount} монет пользователю ${accEmail}`, { type: 'success', duration: 2200, force: true });
            // Обновляем текущий профиль, если это он
            const profile = getStoredProfile();
            if (profile && normalizeEmail(profile.email) === norm) {
                profile.coins = accounts[norm].coins;
                saveProfile(profile);
            }
            renderAdminAccounts();
        });
    });
    list.querySelectorAll('.admin-badge-toggle').forEach(cb => {
        cb.addEventListener('change', () => {
            setAccountBadge(cb.dataset.email, cb.dataset.badge, cb.checked);
            showNotification(`Бейдж обновлён для ${cb.dataset.email}`, { type: 'success', duration: 2200, force: true });
            // Обновляем текущий профиль, если это он
            const profile = getStoredProfile();
            if (profile && normalizeEmail(profile.email) === normalizeEmail(cb.dataset.email)) {
                profile.badges = loadBadgesFromAccount(profile.email);
                saveProfile(profile);
                renderProfileState();
            }
        });
    });
}

function initAdminPanel() {
    const adminBtn = document.getElementById('adminOpenBtn');
    adminBtn?.addEventListener('click', openAdminModal);
    document.getElementById('adminPassSubmitBtn')?.addEventListener('click', submitAdminPass);
    document.getElementById('adminCloseBtn')?.addEventListener('click', closeAdminModal);
    document.getElementById('adminPassInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitAdminPass();
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('currentYear').textContent = new Date().getFullYear();

    const hasCachedVideos = loadCachedVideos();
    if (currentVideoSystem && hasCachedVideos) {
        currentVideoSystem.refresh(videoData);
    }
    
    loadCachedStats();
    
    if (YOUTUBE_CONFIG.apiKey && YOUTUBE_CONFIG.channelId) {
        updateVideosFromYouTube();
        fetchChannelStats();
        setInterval(fetchChannelStats, 1800000);
    } else {
        showNotification('YouTube API не настроен. Используется демо-режим. 🎬');
    }
    
    setInterval(updateVideosFromYouTube, 3600000);
    initTemporaryFeatures();
    initTheme();
    initSettings();
    initProfileAuth();
    initAdminPanel();
    await showSiteUpdateNotice();
    initNavigation();
    initAnalyticsTracking();
    initScrollTopButton();
    currentVideoSystem = new VideoSystem();
    initTwitchClipsSystem();
    initScrollSystem();
    initLoader();
    initRevealAnimations();
    showWelcomeMessageOnce();
    
    if (typeof gtag !== 'undefined') {
        gtag('event', 'page_view', { page_title: 'Mortis Play - Главная', page_location: window.location.href });
    }
});

window.addEventListener('error', (e) => { console.error(e.error); showNotification('Произошла ошибка. Обновите страницу.'); });
window.addEventListener('resize', debounce(() => window.dispatchEvent(new Event('scroll')), 250));

// === АНИМАЦИИ ПОЯВЛЕНИЯ ПРИ СКРОЛЛЕ ===
function initRevealAnimations() {
    const reduced = document.body.classList.contains('reduced-motion') ||
        (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (reduced) return;

    const targets = document.querySelectorAll(
        '.modern-card, .stat-card, .twitch-clip-card, .walkthrough-card, .news-card, .video-card, .social-btn'
    );
    if (!targets.length) return;

    targets.forEach((el, i) => {
        if (el.classList.contains('reveal')) return;
        el.classList.add('reveal');
        if (i % 5 === 0) el.classList.add('reveal-delay-1');
        else if (i % 5 === 1) el.classList.add('reveal-delay-2');
        else if (i % 5 === 2) el.classList.add('reveal-delay-3');
        else if (i % 5 === 3) el.classList.add('reveal-delay-4');
        else el.classList.add('reveal-delay-5');
    });

    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

        targets.forEach((el) => io.observe(el));
    } else {
        targets.forEach((el) => el.classList.add('revealed'));
    }
}
