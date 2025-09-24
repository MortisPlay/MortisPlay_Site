const CONFIG = {
  NOTIFICATION_TIMEOUT: 5000,
  DEBOUNCE_WAIT: 300,
  PARTICLE_COUNT: 3,
  PARTICLE_LIFE: 10,
};

const logAction = (message) => console.log(message);

const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};

const showNotification = (message, notificationElement) => {
  try {
    if (notificationElement?.querySelector('span')) {
      document.querySelectorAll('.notification.show').forEach(el => el.classList.remove('show'));
      notificationElement.querySelector('span').textContent = message;
      notificationElement.classList.add('show');
      gtag('event', 'notification_shown', { event_category: 'settings', event_label: message });
      const timeout = setTimeout(() => notificationElement.classList.remove('show'), CONFIG.NOTIFICATION_TIMEOUT);
      notificationElement.querySelector('button')?.addEventListener('click', () => {
        notificationElement.classList.remove('show');
        clearTimeout(timeout);
        gtag('event', 'notification_click', { event_category: 'settings', event_label: 'dismiss_notification' });
        logAction('Уведомление закрыто');
      }, { once: true });
    }
  } catch (error) {
    console.error('Ошибка уведомления:', error);
  }
};

const setTheme = (theme) => {
  logAction(`Тема установлена: ${theme}`);
  localStorage.setItem('theme', theme);
  document.documentElement.classList.toggle('dark', theme === 'dark');
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.classList.toggle('dark', theme === 'dark');
    const icon = themeToggle.querySelector('i');
    const text = themeToggle.querySelector('span');
    if (icon && text) {
      icon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
      text.textContent = theme === 'dark' ? 'Тёмная' : 'Светлая';
    }
  }
  gtag('event', 'theme_toggle', { event_category: 'engagement', event_label: theme });
};

const setupThemeParticles = () => {
  if (document.documentElement.classList.contains('low-performance')) return;
  const canvas = document.getElementById('particleCanvas');
  const themeToggle = document.getElementById('themeToggle');
  if (!canvas || !themeToggle) return;

  const ctx = canvas.getContext('2d');
  canvas.width = themeToggle.offsetWidth;
  canvas.height = themeToggle.offsetHeight;
  const particles = [];

  const createParticle = (x, y) => ({
    x, y,
    vx: (Math.random() - 0.5) * 3,
    vy: (Math.random() - 0.5) * 3,
    size: Math.random() * 2 + 1,
    life: CONFIG.PARTICLE_LIFE
  });

  const animateParticles = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p, i) => {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (p.life <= 0) {
        particles.splice(i, 1);
        return;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#6366f1' : '#ffffff';
      ctx.fill();
    });
    if (particles.length > 0) requestAnimationFrame(animateParticles);
  };

  themeToggle.addEventListener('click', (e) => {
    const rect = themeToggle.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) particles.push(createParticle(x, y));
    if (particles.length > 0) animateParticles();
  });
};

const initializeTheme = () => {
  const savedTheme = localStorage.getItem('theme') || 'auto';
  const theme = savedTheme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : savedTheme;
  setTheme(theme);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (localStorage.getItem('theme') === 'auto') setTheme(e.matches ? 'dark' : 'light');
  });
  document.getElementById('themeToggle')?.addEventListener('click', debounce(() => {
    setTheme(localStorage.getItem('theme') === 'light' ? 'dark' : 'light');
  }, CONFIG.DEBOUNCE_WAIT));
  setupThemeParticles();
};

const setupThemeSelect = () => {
  const themeSelect = document.getElementById('themeSelect');
  const notification = document.getElementById('appearanceNotification');
  if (!themeSelect || !notification) return;

  const savedTheme = localStorage.getItem('theme') || 'auto';
  themeSelect.value = savedTheme;
  setTheme(savedTheme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : savedTheme);
  themeSelect.addEventListener('change', () => {
    const theme = themeSelect.value;
    setTheme(theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : theme);
    showNotification(`Тема: ${theme === 'auto' ? 'Авто' : theme === 'light' ? 'Светлая' : 'Тёмная'}`, notification);
    gtag('event', 'theme_select', { event_category: 'settings', event_label: theme });
    logAction(`Тема выбрана: ${theme}`);
  });
  themeSelect.addEventListener('mouseenter', () => {
    showNotification('Выберите тему сайта', notification);
  });
};

const setupPerformance = () => {
  const toggle = document.getElementById('lowPerformanceToggle');
  const notification = document.getElementById('performanceNotification');
  if (!toggle || !notification) return;

  const savedMode = localStorage.getItem('lowPerformance') === 'true';
  toggle.checked = savedMode;
  document.documentElement.classList.toggle('low-performance', savedMode);
  toggle.addEventListener('change', debounce(() => {
    const isLowPerformance = toggle.checked;
    localStorage.setItem('lowPerformance', isLowPerformance);
    document.documentElement.classList.toggle('low-performance', isLowPerformance);
    showNotification(isLowPerformance ? 'Лёгкий режим включён' : 'Лёгкий режим выключен', notification);
    gtag('event', 'performance_toggle', { event_category: 'settings', event_label: isLowPerformance ? 'low' : 'normal' });
    logAction(`Режим производительности: ${isLowPerformance ? 'Лёгкий' : 'Нормальный'}`);
  }, CONFIG.DEBOUNCE_WAIT));
  toggle.addEventListener('mouseenter', () => {
    showNotification('Включите лёгкий режим для слабых устройств', notification);
  });
};

const setupAnimations = () => {
  const toggle = document.getElementById('disableAnimationsToggle');
  const notification = document.getElementById('performanceNotification');
  if (!toggle || !notification) return;

  const savedAnimations = localStorage.getItem('disableAnimations') === 'true';
  toggle.checked = savedAnimations;
  document.documentElement.classList.toggle('no-animations', savedAnimations);
  toggle.addEventListener('change', debounce(() => {
    const disableAnimations = toggle.checked;
    localStorage.setItem('disableAnimations', disableAnimations);
    document.documentElement.classList.toggle('no-animations', disableAnimations);
    showNotification(disableAnimations ? 'Анимации отключены' : 'Анимации включены', notification);
    gtag('event', 'animations_toggle', { event_category: 'settings', event_label: disableAnimations ? 'off' : 'on' });
    logAction(`Анимации: ${disableAnimations ? 'Отключены' : 'Включены'}`);
  }, CONFIG.DEBOUNCE_WAIT));
  toggle.addEventListener('mouseenter', () => {
    showNotification('Отключите анимации для улучшения производительности', notification);
  });
};

const setupFontSize = () => {
  const slider = document.getElementById('fontSizeSlider');
  const notification = document.getElementById('appearanceNotification');
  if (!slider || !notification) return;

  const savedFontSize = localStorage.getItem('fontSize') || '100';
  slider.value = savedFontSize;
  document.documentElement.style.setProperty('--font-scale', savedFontSize / 100);
  slider.addEventListener('input', debounce(() => {
    const fontSize = slider.value;
    localStorage.setItem('fontSize', fontSize);
    document.documentElement.style.setProperty('--font-scale', fontSize / 100);
    showNotification(`Размер шрифта: ${fontSize}%`, notification);
    gtag('event', 'font_size_change', { event_category: 'settings', event_label: fontSize });
    logAction(`Размер шрифта: ${fontSize}%`);
  }, CONFIG.DEBOUNCE_WAIT));
  slider.addEventListener('mouseenter', () => {
    showNotification('Измените размер шрифта для удобства чтения', notification);
  });
};

const setupHighContrast = () => {
  const toggle = document.getElementById('highContrastToggle');
  const notification = document.getElementById('appearanceNotification');
  if (!toggle || !notification) return;

  const savedContrast = localStorage.getItem('highContrast') === 'true';
  toggle.checked = savedContrast;
  document.documentElement.classList.toggle('high-contrast', savedContrast);
  toggle.addEventListener('change', debounce(() => {
    const highContrast = toggle.checked;
    localStorage.setItem('highContrast', highContrast);
    document.documentElement.classList.toggle('high-contrast', highContrast);
    showNotification(highContrast ? 'Высокая контрастность включена' : 'Высокая контрастность отключена', notification);
    gtag('event', 'high_contrast_toggle', { event_category: 'settings', event_label: highContrast ? 'on' : 'off' });
    logAction(`Контрастность: ${highContrast ? 'Высокая' : 'Нормальная'}`);
  }, CONFIG.DEBOUNCE_WAIT));
  toggle.addEventListener('mouseenter', () => {
    showNotification('Включите высокую контрастность для лучшей читаемости', notification);
  });
};

const setupMenu = () => {
  const toggle = document.getElementById('menuToggle');
  const close = document.getElementById('closeMenu');
  const sidebar = document.getElementById('sidebarMenu');
  if (!toggle || !sidebar) return;

  toggle.addEventListener('click', debounce(() => {
    sidebar.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
    gtag('event', 'menu_open', { event_category: 'engagement', event_label: 'mobile_menu' });
  }, CONFIG.DEBOUNCE_WAIT));
  close?.addEventListener('click', () => {
    sidebar.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    gtag('event', 'menu_close', { event_category: 'engagement', event_label: 'mobile_menu' });
  });
  document.addEventListener('click', (e) => {
    if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== toggle) {
      sidebar.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
};

const setupNavTracking = () => {
  document.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('click', (e) => {
      const section = e.target.getAttribute('href').substring(1);
      gtag('event', 'nav_click', { event_category: 'navigation', event_label: section });
    });
  });
};

const setupButtonTracking = () => {
  document.querySelectorAll('.glass-button').forEach(button => {
    button.addEventListener('click', (e) => {
      const label = e.target.textContent.trim();
      gtag('event', 'button_click', { event_category: 'engagement', event_label: label });
    });
  });
};

const setupObservers = () => {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        if (entry.target.classList.contains('fade-in') && !document.documentElement.classList.contains('low-performance') && !document.documentElement.classList.contains('no-animations')) {
          entry.target.classList.add('is-visible');
        }
        if (entry.target.tagName === 'SECTION') {
          gtag('event', 'section_view', { event_category: 'engagement', event_label: entry.target.id });
          io.unobserve(entry.target);
        }
      }
    });
  }, { threshold: 0.2, rootMargin: '-50px' });
  document.querySelectorAll('.fade-in, section').forEach(el => io.observe(el));

  const videoIO = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const iframe = entry.target;
        if (!iframe.src && iframe.dataset.src) {
          iframe.src = iframe.dataset.src;
          videoIO.unobserve(iframe);
        }
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.video-card iframe').forEach(iframe => {
    iframe.dataset.src = iframe.src;
    iframe.src = '';
    videoIO.observe(iframe);
  });
};

const setupVideos = async () => {
  const tpl = document.getElementById('ytCardTpl');
  const grid = document.querySelector('#videos .mt-8.grid');
  if (!tpl || !grid) return;

  try {
    const response = await fetch('/api/videos.json');
    const videoData = response.ok ? await response.json() : [
      { src: 'https://rutube.ru/play/embed/17ab491deff35ceaacdbe027e266e9f6/', title: 'Угар в Content Warning', category: 'fun' },
      { src: 'https://rutube.ru/play/embed/ea7fa319476924cad6ae44e7972f7f7e/', title: 'УГАР В REPO', category: 'fun' },
      { src: 'https://rutube.ru/play/embed/46b92548cd13429c14348feb10dbd35d/', title: 'Игра CS2 (feat. Johnny Drill)', category: 'streams' },
      { src: 'https://rutube.ru/play/embed/2ba4872771e827b6ce560a8390462643/', title: 'ВРЕМЯ УГАРА И ПРЕДАТЕЛЬСТВА PEAK!', category: 'fun' },
      { src: 'https://rutube.ru/play/embed/4e88d1d8cacec555ddb17bff2720394a/', title: 'Mortisplay32 ИГРАЕТ В PEAK', category: 'streams' }
    ];

    videoData.forEach(v => {
      const node = tpl.content.cloneNode(true);
      const iframe = node.querySelector('iframe');
      const title = node.querySelector('p');
      const card = node.querySelector('.video-card');
      const fallbackImg = node.querySelector('img');
      if (iframe && title && card && fallbackImg) {
        iframe.dataset.src = v.src;
        iframe.setAttribute('title', `Видео: ${v.title}`);
        iframe.onerror = () => {
          iframe.classList.add('hidden');
          fallbackImg.classList.remove('hidden');
        };
        title.textContent = v.title;
        card.dataset.category = v.category;
        grid.appendChild(node);
      }
    });

    document.querySelectorAll('.video-filter').forEach(button => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.video-filter').forEach(btn => btn.setAttribute('aria-pressed', 'false'));
        button.setAttribute('aria-pressed', 'true');
        button.classList.add('active');
        document.querySelectorAll('.video-filter').forEach(btn => btn !== button && btn.classList.remove('active'));
        const filter = button.dataset.filter;
        document.querySelectorAll('.video-card').forEach(card => {
          card.classList.toggle('hidden', filter !== 'all' && card.dataset.category !== filter);
        });
        gtag('event', 'video_filter', { event_category: 'engagement', event_label: filter });
      });
    });
    document.querySelector('.video-filter[data-filter="all"]')?.classList.add('active');
  } catch (error) {
    console.error('Ошибка загрузки видео:', error);
  }
};

const setupLoader = () => {
  if (document.readyState === 'complete') {
    hideLoader();
  } else {
    window.addEventListener('load', hideLoader);
  }

  function hideLoader() {
    const loader = document.getElementById('loader');
    const site = document.getElementById('siteContent');
    if (loader && site) {
      loader.classList.add('opacity-0', 'transition', 'duration-700');
      loader.addEventListener('transitionend', () => {
        loader.style.display = 'none';
        site.classList.remove('hidden');
        logAction('Лоадер скрыт');
      }, { once: true });
    }
  }
};

const initializeApp = () => {
  try {
    initializeTheme();
    setupThemeSelect();
    setupPerformance();
    setupAnimations();
    setupFontSize();
    setupHighContrast();
    setupMenu();
    setupObservers();
    setupVideos();
    setupLoader();
    setupNavTracking();
    setupButtonTracking();
  } catch (error) {
    console.error('Ошибка инициализации:', error);
  }
};

document.addEventListener('DOMContentLoaded', initializeApp);
