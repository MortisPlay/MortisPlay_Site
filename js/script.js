(() => {
  'use strict';

  const logAction = (message) => console.log(message);
  const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  };
  let lastNotificationTime = 0;
  const showNotification = (message, notificationElement) => {
    const now = Date.now();
    if (now - lastNotificationTime < 10000) return;
    lastNotificationTime = now;
    if (notificationElement) {
      const span = notificationElement.querySelector('span');
      if (span) {
        document.querySelectorAll('.notification.show').forEach(el => el.classList.remove('show'));
        span.textContent = message;
        notificationElement.classList.add('show');
        gtag('event', 'notification_shown', { event_category: 'settings', event_label: message });
        const timeout = setTimeout(() => {
          notificationElement.classList.remove('show');
        }, 5000);
        const closeButton = notificationElement.querySelector('button');
        if (closeButton) {
          closeButton.addEventListener('click', () => {
            notificationElement.classList.remove('show');
            clearTimeout(timeout);
            gtag('event', 'notification_dismiss', { event_category: 'settings', event_label: 'dismiss_notification' });
            logAction('Уведомление закрыто');
          }, { once: true });
        }
      }
    }
  };
  const root = document.documentElement;
  const setTheme = (theme, isPreview = false) => {
    try {
      logAction(`Тема установлена: ${theme}${isPreview ? ' (предпросмотр)' : ''}`);
      if (!isPreview) localStorage.setItem('theme', theme);
      root.classList.toggle('dark', theme === 'dark');
      const themeToggle = document.getElementById('themeToggle');
      if (themeToggle) {
        const themeIcon = themeToggle.querySelector('i');
        const themeText = themeToggle.querySelector('span');
        if (themeIcon && themeText) {
          themeIcon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
          themeText.textContent = theme === 'dark' ? 'Тёмная' : 'Светлая';
        }
      }
      if (!isPreview) gtag('event', 'theme_toggle', { event_category: 'engagement', event_label: theme });
    } catch (e) {
      logAction('Ошибка в setTheme: ' + e.message);
    }
  };
  const setupThemeToggle = () => {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        const isDark = root.classList.contains('dark');
        setTheme(isDark ? 'light' : 'dark');
      });
    }
  };
  const setupThemeSelect = () => {
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
      let savedTheme;
      try {
        savedTheme = localStorage.getItem('theme') || 'auto';
      } catch (e) {
        savedTheme = 'auto';
        logAction('Ошибка чтения localStorage для theme: ' + e.message);
      }
      themeSelect.value = savedTheme;
      setTheme(savedTheme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : savedTheme);
      let previewTimeout;
      themeSelect.addEventListener('change', () => {
        const theme = themeSelect.value;
        const effectiveTheme = theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : theme;
        clearTimeout(previewTimeout);
        setTheme(effectiveTheme, true);
        showNotification(`Предпросмотр темы: ${theme === 'auto' ? 'Авто' : theme === 'light' ? 'Светлая' : 'Тёмная'}`, document.getElementById('appearanceNotification'));
        previewTimeout = setTimeout(() => {
          setTheme(effectiveTheme);
          showNotification(`Тема: ${theme === 'auto' ? 'Авто' : theme === 'light' ? 'Светлая' : 'Тёмная'}`, document.getElementById('appearanceNotification'));
          gtag('event', 'theme_select', { event_category: 'settings', event_label: theme });
          logAction(`Тема выбрана: ${theme}`);
        }, 2000);
      });
    }
  };
  const setupPerformance = () => {
    const toggle = document.getElementById('lowPerformanceToggle');
    const notification = document.getElementById('performanceNotification');
    if (toggle && notification) {
      let savedMode;
      try {
        savedMode = localStorage.getItem('lowPerformance') === 'true';
      } catch (e) {
        savedMode = false;
        logAction('Ошибка чтения localStorage для lowPerformance: ' + e.message);
      }
      toggle.checked = savedMode;
      root.classList.toggle('low-performance', savedMode);
      toggle.addEventListener('change', debounce(() => {
        const isLowPerformance = toggle.checked;
        try {
          localStorage.setItem('lowPerformance', isLowPerformance);
        } catch (e) {
          logAction('Ошибка записи localStorage для lowPerformance: ' + e.message);
        }
        root.classList.toggle('low-performance', isLowPerformance);
        showNotification(isLowPerformance ? 'Лёгкий режим включён' : 'Лёгкий режим выключен', notification);
        gtag('event', 'performance_toggle', { event_category: 'settings', event_label: isLowPerformance ? 'low' : 'normal' });
        logAction(`Режим производительности: ${isLowPerformance ? 'Лёгкий' : 'Нормальный'}`);
      }, 300));
    }
  };
  const setupAnimations = () => {
    const animationsToggle = document.getElementById('disableAnimationsToggle');
    const notification = document.getElementById('performanceNotification');
    if (animationsToggle && notification) {
      let savedAnimations;
      try {
        savedAnimations = localStorage.getItem('disableAnimations') === 'true';
      } catch (e) {
        savedAnimations = false;
        logAction('Ошибка чтения localStorage для disableAnimations: ' + e.message);
      }
      animationsToggle.checked = savedAnimations;
      root.classList.toggle('no-animations', savedAnimations);
      animationsToggle.addEventListener('change', debounce(() => {
        const disableAnimations = animationsToggle.checked;
        try {
          localStorage.setItem('disableAnimations', disableAnimations);
        } catch (e) {
          logAction('Ошибка записи localStorage для disableAnimations: ' + e.message);
        }
        root.classList.toggle('no-animations', disableAnimations);
        showNotification(disableAnimations ? 'Анимации отключены' : 'Анимации включены', notification);
        gtag('event', 'animations_toggle', { event_category: 'settings', event_label: disableAnimations ? 'off' : 'on' });
        logAction(`Анимации: ${disableAnimations ? 'Отключены' : 'Включены'}`);
      }, 300));
    }
  };
  const setupParticleToggle = () => {
    const toggle = document.getElementById('disableParticlesToggle');
    const notification = document.getElementById('performanceNotification');
    if (toggle && notification) {
      let savedParticles;
      try {
        savedParticles = localStorage.getItem('disableParticles') === 'true';
      } catch (e) {
        savedParticles = false;
        logAction('Ошибка чтения localStorage для disableParticles: ' + e.message);
      }
      toggle.checked = savedParticles;
      root.classList.toggle('no-particles', savedParticles);
      toggle.addEventListener('change', debounce(() => {
        const disableParticles = toggle.checked;
        try {
          localStorage.setItem('disableParticles', disableParticles);
        } catch (e) {
          logAction('Ошибка записи localStorage для disableParticles: ' + e.message);
        }
        root.classList.toggle('no-particles', disableParticles);
        showNotification(disableParticles ? 'Фоновые частицы отключены' : 'Фоновые частицы включены', notification);
        gtag('event', 'particles_toggle', { event_category: 'settings', event_label: disableParticles ? 'off' : 'on' });
        logAction(`Фоновые частицы: ${disableParticles ? 'Отключены' : 'Включены'}`);
      }, 300));
    }
  };
  const setupFontSize = () => {
    const slider = document.getElementById('fontSizeSlider');
    const notification = document.getElementById('appearanceNotification');
    if (slider && notification) {
      let savedFontSize;
      try {
        savedFontSize = localStorage.getItem('fontSize') || '100';
      } catch (e) {
        savedFontSize = '100';
        logAction('Ошибка чтения localStorage для fontSize: ' + e.message);
      }
      slider.value = savedFontSize;
      root.style.setProperty('--font-scale', savedFontSize / 100);
      slider.addEventListener('input', debounce(() => {
        const fontSize = slider.value;
        root.style.setProperty('--font-scale', fontSize / 100);
        showNotification(`Размер шрифта: ${fontSize}%`, notification);
        try {
          localStorage.setItem('fontSize', fontSize);
        } catch (e) {
          logAction('Ошибка записи localStorage для fontSize: ' + e.message);
        }
        gtag('event', 'font_size_change', { event_category: 'settings', event_label: fontSize });
        logAction(`Размер шрифта изменён: ${fontSize}%`);
      }, 300));
    }
  };
  const setupHighContrast = () => {
    const toggle = document.getElementById('highContrastToggle');
    const notification = document.getElementById('appearanceNotification');
    if (toggle && notification) {
      let savedHighContrast;
      try {
        savedHighContrast = localStorage.getItem('highContrast') === 'true';
      } catch (e) {
        savedHighContrast = false;
        logAction('Ошибка чтения localStorage для highContrast: ' + e.message);
      }
      toggle.checked = savedHighContrast;
      root.classList.toggle('high-contrast', savedHighContrast);
      toggle.addEventListener('change', debounce(() => {
        const highContrast = toggle.checked;
        try {
          localStorage.setItem('highContrast', highContrast);
        } catch (e) {
          logAction('Ошибка записи localStorage для highContrast: ' + e.message);
        }
        root.classList.toggle('high-contrast', highContrast);
        showNotification(highContrast ? 'Высокая контрастность включена' : 'Высокая контрастность выключена', notification);
        gtag('event', 'high_contrast_toggle', { event_category: 'settings', event_label: highContrast ? 'on' : 'off' });
        logAction(`Высокая контрастность: ${highContrast ? 'Включена' : 'Выключена'}`);
      }, 300));
    }
  };
  const setupResetSettings = () => {
    const resetButton = document.getElementById('resetSettings');
    const notification = document.getElementById('appearanceNotification');
    if (resetButton && notification) {
      resetButton.addEventListener('click', () => {
        localStorage.clear();
        location.reload();
      });
    }
  };
  const setupProfileBetaNotice = () => {
    const notice = document.getElementById('profileBetaNotice');
    if (!notice) return;
    const hidden = localStorage.getItem('profileBetaNoticeHidden');
    if (!hidden) {
      notice.classList.add('show');
      notice.querySelector('button').addEventListener('click', () => {
        notice.classList.remove('show');
        localStorage.setItem('profileBetaNoticeHidden', 'true');
      });
    }
  };
  // === БЕЙДЖИ ===
  const badgeDefinitions = [
    { name: 'Фанат', icon: 'fa-solid fa-star', description: 'Выдаётся за посещение сайта!', earned: () => true },
    {
      name: 'Мемолог',
      icon: 'fa-solid fa-laugh',
      description: 'Посмотрите 4 видео в категории «Угар»',
      earned: () => {
        const watchedVideos = JSON.parse(localStorage.getItem('watchedVideos') || '{}');
        return Object.values(watchedVideos).filter(v => v.category === 'fun').length >= 4;
      },
      progress: () => {
        const watchedVideos = JSON.parse(localStorage.getItem('watchedVideos') || '{}');
        return Math.min(Object.values(watchedVideos).filter(v => v.category === 'fun').length, 4);
      }
    },
    {
      name: 'Стример',
      icon: 'fa-solid fa-video',
      description: 'Загрузите аватар и установите имя пользователя',
      earned: () => !!localStorage.getItem('userAvatar') && !!localStorage.getItem('username')
    },
    {
      name: 'Легенда',
      icon: 'fa-solid fa-crown',
      description: 'Получите все остальные бейджи',
      earned: () => {
        const savedBadges = JSON.parse(localStorage.getItem('userBadges') || '[]');
        return ['Фанат', 'Мемолог', 'Стример', 'Эпик Мемолог'].every(b => savedBadges.includes(b));
      }
    },
    {
      name: 'Эпик Мемолог',
      icon: 'fa-solid fa-trophy',
      description: 'Просмотрите 50 видео в категории «Угар» (почти невозможно!)',
      earned: () => {
        const watchedVideos = JSON.parse(localStorage.getItem('watchedVideos') || '{}');
        return Object.values(watchedVideos).filter(v => v.category === 'fun').length >= 50;
      },
      progress: () => {
        const watchedVideos = JSON.parse(localStorage.getItem('watchedVideos') || '{}');
        return Math.min(Object.values(watchedVideos).filter(v => v.category === 'fun').length, 50);
      }
    },
  ];
  const openBadgeModal = (badge) => {
    const modal = document.getElementById('badgeModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalDesc = document.getElementById('modalDesc');
    if (!modal || !modalTitle || !modalDesc) return;
    modalTitle.textContent = badge.name;
    modalDesc.textContent = badge.description;
    modal.style.display = 'flex';
    modal.style.animation = 'modalFadeIn 0.3s ease forwards';
    const newCloseBtn = document.getElementById('closeModal').cloneNode(true);
    document.getElementById('closeModal').replaceWith(newCloseBtn);
    newCloseBtn.addEventListener('click', () => {
      modal.style.animation = 'modalFadeOut 0.3s ease forwards';
      setTimeout(() => { modal.style.display = 'none'; }, 300);
    });
  };
  const setupBadges = () => {
    const badges = document.getElementById('badges');
    const badgeList = document.getElementById('badgeList');
    const notification = document.getElementById('appearanceNotification');
    if (!badges || !badgeList || !notification) return;
    let savedBadges = JSON.parse(localStorage.getItem('userBadges') || '[]');
    if (!savedBadges.includes('Фанат')) {
      savedBadges.push('Фанат');
      localStorage.setItem('userBadges', JSON.stringify(savedBadges));
      showNotification('Получен бейдж: Фанат!', notification);
    }
    badges.innerHTML = '';
    badgeList.innerHTML = '';
    badgeDefinitions.forEach(badge => {
      const isEarned = savedBadges.includes(badge.name) || badge.earned();
      if (isEarned && !savedBadges.includes(badge.name)) {
        savedBadges.push(badge.name);
        localStorage.setItem('userBadges', JSON.stringify(savedBadges));
        showNotification(`Новый бейдж: ${badge.name}!`, notification);
        gtag('event', 'badge_earned', { event_category: 'profile', event_label: badge.name });
      }
      if (isEarned) {
        const badgeEl = document.createElement('span');
        badgeEl.className = 'badge inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-600 text-white text-xs font-medium';
        badgeEl.innerHTML = `<i class="${badge.icon}"></i> ${badge.name}`;
        badges.appendChild(badgeEl);
      }
      const badgeItem = document.createElement('div');
      badgeItem.className = 'flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer';
      const progress = badge.progress ? ` (${badge.progress()}/${badge.name === 'Мемолог' ? 4 : 50})` : '';
      badgeItem.innerHTML = `
        <div class="flex items-center gap-2">
          <i class="${badge.icon} ${isEarned ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-600'}"></i>
          <span class="${isEarned ? 'font-medium text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'}">
            ${badge.name}${progress}
          </span>
        </div>
        <span class="text-lg">${isEarned ? '✅' : '🔒'}</span>
      `;
      badgeItem.onclick = () => openBadgeModal(badge);
      badgeList.appendChild(badgeItem);
    });
    updateProjectProgress();
  };
  const checkBadgeConditions = () => {
    setupBadges();
  };
  const updateProjectProgress = () => {
    const savedBadges = JSON.parse(localStorage.getItem('userBadges') || '[]');
    const totalBadges = 5;
    const percent = Math.min(100, Math.round((savedBadges.length / totalBadges) * 100));
    const bar = document.getElementById('projectProgressBar');
    const label = document.getElementById('projectProgressLabel');
    if (bar && label) {
      bar.style.width = `${percent}%`;
      label.textContent = `${percent}%`;
    }
  };
  const setupProfile = () => {
    const avatarUpload = document.getElementById('avatarUpload');
    const userAvatar = document.getElementById('userAvatar');
    const usernameInput = document.getElementById('usernameInput');
    const notification = document.getElementById('appearanceNotification');
    if (avatarUpload && userAvatar && notification) {
      const savedAvatar = localStorage.getItem('userAvatar');
      if (savedAvatar) userAvatar.src = savedAvatar;
      avatarUpload.addEventListener('change', () => {
        const file = avatarUpload.files[0];
        if (file && file.size <= 1024 * 1024 && /^image\/(jpeg|png|gif|webp)$/.test(file.type)) {
          const reader = new FileReader();
          reader.onload = () => {
            const img = new Image();
            img.src = reader.result;
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              const maxSize = 100;
              let width = img.width;
              let height = img.height;
              if (width > height && width > maxSize) {
                height *= maxSize / width;
                width = maxSize;
              } else if (height > maxSize) {
                width *= maxSize / height;
                height = maxSize;
              }
              canvas.width = width;
              canvas.height = height;
              ctx.drawImage(img, 0, 0, width, height);
              const compressed = canvas.toDataURL('image/jpeg', 0.8);
              userAvatar.src = compressed;
              localStorage.setItem('userAvatar', compressed);
              showNotification('Аватар обновлён', notification);
              checkBadgeConditions();
            };
          };
          reader.readAsDataURL(file);
        } else {
          showNotification('Выберите изображение (до 1МБ)', notification);
        }
      });
    }
    if (usernameInput && notification) {
      const savedUsername = localStorage.getItem('username');
      if (savedUsername) usernameInput.value = savedUsername;
      usernameInput.addEventListener('input', debounce(() => {
        const username = usernameInput.value.trim();
        if (username.length <= 20) {
          localStorage.setItem('username', username);
          showNotification('Имя обновлено', notification);
          checkBadgeConditions();
        }
      }, 500));
    }
    setupBadges();
  };
  const videoData = [
    { src: 'https://rutube.ru/play/embed/17ab491deff35ceaacdbe027e266e9f6/', title: 'Угар в Content Warning', category: 'fun' },
    { src: 'https://rutube.ru/play/embed/ea7fa319476924cad6ae44e7972f7f7e/', title: 'УГАР В REPO', category: 'fun' },
    { src: 'https://rutube.ru/play/embed/46b92548cd13429c14348feb10dbd35d/', title: 'Игра CS2 (feat. Johnny Drill)', category: 'streams' },
    { src: 'https://rutube.ru/play/embed/2ba4872771e827b6ce560a8390462643/', title: 'ВРЕМЯ УГАРА И ПРЕДАТЕЛЬСТВА PEAK!', category: 'fun' },
    { src: 'https://rutube.ru/play/embed/4e88d1d8cacec555ddb17bff2720394a/', title: 'Mortisplay32 ИГРАЕТ В PEAK', category: 'streams' },
    { src: 'https://rutube.ru/play/embed/3de912692f3520aad3ccf648b30f0247', title: 'ВРЕМЯ БЕЗУМИЙ В РАБОТЕ!!!', category: 'fun' },
    { src: 'https://rutube.ru/play/embed/1cb1388800c0a573bb4c6942bc12c752', title: 'УМНЫЙ НО КОСОЙ', category: 'fun' },
    { src: 'https://rutube.ru/play/embed/8e2f7da5ca6582d3b66ea73d39b53130', title: 'СПЕЦ ВЫПУСК!!! СМЕРТЕЛЬНЫЙ КОНТЕНТ!', category: 'fun' },
    { src: 'https://rutube.ru/play/embed/f50e8d94d8228d9a8ffce5e37773a8e2', title: 'НОВЫЕ ВРЕМЕНА НАЧИНАЮТСЯ С РЕЛАКСА', category: 'fun' },
    { src: 'https://rutube.ru/play/embed/522c3d4a29970e19b74f8cdfa9e2eb3e', title: 'СПЕЦ ВЫПУСК! ЧАС РАБОТЫ В ЛЕТАЛ КОМПАНИ!', category: 'fun' },
    { src: 'https://rutube.ru/play/embed/2c266a516ea35150036cd6298ef6db68', title: 'ВРОДЕ ОБНОВА ТОП НО НЕ СОВСЕМ...', category: 'fun' },
    { src: 'https://rutube.ru/play/embed/36faf3fd0b2c5dac09f907297925db41', title: 'НОВАЯ ВЕБКА, НОВЫЕ ГОРИЗОНТЫ!', category: 'fun' },
    { src: 'https://rutube.ru/play/embed/5b51c9a3e15b4d75bfb08783c90bcc85', title: 'БЛИЦ Play: КОНЕЦ ГОДА, ЧТО ДАЛЬШЕ?', category: 'blitz' },
    { src: 'https://rutube.ru/play/embed/171e2dae98076c82e5c49f3dfda7bb33', title: 'БЛИЦ Play: ПОСЛЕЖНИЙ РУБЕЖ!', category: 'blitz' },
    { src: 'https://rutube.ru/play/embed/0f958e52a3a7023734bfa562186a9bce', title: 'БЛИЦ Play: ВСЕ? ВСЕ.', category: 'blitz' }
  ];
  const setupVideos = () => {
    const grid = document.getElementById('videosGrid');
    const loadMoreButton = document.getElementById('loadMoreVideos');
    if (!grid || !loadMoreButton) return;
    let currentPage = 1;
    const videosPerPage = 6;
    let currentFilter = 'all';
    let filteredVideos = videoData;
    const renderVideos = (append = false) => {
      if (!append) {
        grid.innerHTML = '';
        currentPage = 1;
      }
      const start = (currentPage - 1) * videosPerPage;
      const end = start + videosPerPage;
      const videosToShow = (currentFilter === 'all' ? videoData : filteredVideos).slice(start, end);
      videosToShow.forEach(v => {
        const card = document.createElement('div');
        card.className = 'video-card card-hover rounded-2xl bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 p-4';
        card.dataset.category = v.category;
        card.innerHTML = `
          <div class="relative aspect-video rounded-xl overflow-hidden">
            <iframe class="w-full h-full" loading="lazy" allow="autoplay; encrypted-media" allowfullscreen title="${v.title}"></iframe>
          </div>
          <p class="mt-3 text-sm text-slate-600 dark:text-slate-300">${v.title}</p>
        `;
        const iframe = card.querySelector('iframe');
        iframe.src = v.src;
        grid.appendChild(card);
      });
      loadMoreButton.style.display = end >= (currentFilter === 'all' ? videoData.length : filteredVideos.length) ? 'none' : 'inline-flex';
      if (!append) setupVideoTracking();
      else setTimeout(setupVideoTracking, 100);
    };
    loadMoreButton.addEventListener('click', () => {
      currentPage++;
      renderVideos(true);
      gtag('event', 'load_more_videos', { event_category: 'videos', event_label: `page_${currentPage}` });
    });
    const filterButtons = document.querySelectorAll('.video-filter');
    const categoryDesc = document.getElementById('category-desc');
    const categoryDescriptions = {
      all: 'Все видео от Mortis Play: стримы, мемы и подкасты!',
      streams: 'Стримы с эпичными моментами и геймплеем!',
      fun: 'Угарные видео и мемы для настроения!',
      blitz: 'Короткие и динамичные БЛИЦ Play ролики!'
    };
    filterButtons.forEach(button => {
      button.addEventListener('click', () => {
        const filter = button.dataset.filter;
        filterButtons.forEach(btn => {
          btn.classList.toggle('active', btn.dataset.filter === filter);
          btn.setAttribute('aria-pressed', btn.dataset.filter === filter);
        });
        currentFilter = filter;
        filteredVideos = filter === 'all' ? videoData : videoData.filter(v => v.category === filter);
        renderVideos();
        categoryDesc.textContent = categoryDescriptions[filter];
        loadMoreButton.style.display = filteredVideos.length <= videosPerPage ? 'none' : 'inline-flex';
        gtag('event', 'video_filter', { event_category: 'videos', event_label: filter });
        logAction(`Фильтр видео: ${filter}`);
      });
    });
    renderVideos();
  };
  const setupVideoTracking = () => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
          const iframe = entry.target;
          const card = iframe.closest('.video-card');
          const title = card.querySelector('p').textContent;
          const category = card.dataset.category;
          setTimeout(() => {
            if (iframe.offsetParent !== null) {
              let watched = JSON.parse(localStorage.getItem('watchedVideos') || '{}');
              if (!watched[title]) {
                watched[title] = { category, watched: true, timestamp: Date.now() };
                localStorage.setItem('watchedVideos', JSON.stringify(watched));
                showNotification(`Просмотрено: ${title}`, document.getElementById('appearanceNotification'));
                checkBadgeConditions();
              }
            }
          }, 2000);
          observer.unobserve(iframe);
        }
      });
    }, { threshold: 0.5 });
    setTimeout(() => {
      document.querySelectorAll('#videosGrid iframe').forEach(iframe => observer.observe(iframe));
    }, 100);
  };
  const newsData = [
    { title: "Обновили немного сайт", date: "25 сентября 2025", content: "Вернули узоры на сайт, также обновили чуть чуть дизайн и обновили бота. Также, сообщаем вам новость о том, что сайт не будет обновляться в течение месяца, ведь мы сейчас начнем заниматься контентом поэтому все изменения которые у вас попадутся на сайте, будут исправлены только когда мы закончим с контентом, если вы обнаружите проблему на сайте, пишите в Telegram: <a href=\"https://t.me/dimap7221\" class=\"underline text-indigo-600 dark:text-indigo-400\" rel=\"noopener\">MortisPlay</a>. Приятного времяпровождение на сайте :3" },
    { title: "Технический перерыв завершён!", date: "22 сентября 2025", content: "Йоу, геймеры! 🎮🔥 Сайт Mortis Play вернулся! Проверь новые фичи, обновления и Q&A. Пиши вопросы боту: <a href=\"https://t.me/MortisplayQABot\" class=\"underline text-indigo-600 dark:text-indigo-400\" rel=\"noopener\">MortisplayQABot</a>. Следи за новостями в Telegram: <a href=\"https://t.me/MortisPlayTG\" class=\"underline text-indigo-600 dark:text-indigo-400\" rel=\"noopener\">@MortisPlayTG</a>." },
    { title: "Новый раздел «Настройки» и бот готов!", date: "18 сентября 2025", content: "Йоу, геймеры! 🎮🔥 Новый раздел «Настройки» уже на сайте — настраивай тему, шрифты и производительность под себя! В будущем добавим ещё больше кастомизаций. 😎 Плюс, наш бот закончен и ждёт вопросов: <a href=\"https://t.me/MortisplayQABot\" class=\"underline text-indigo-600 dark:text-indigo-400\" rel=\"noopener\">MortisplayQABot</a>." },
    { title: "Q&A открыт!", date: "15 сентября 2025", content: "Йоу, геймеры! 🎮🔥 Q&A стартовал! Пиши вопросы в Telegram: <a href=\"https://t.me/MortisplayQABot\" class=\"underline text-indigo-600 dark:text-indigo-400\" rel=\"noopener\">MortisplayQABot</a>. Раздел «Видео» теперь с категориями (Все, Стримы, Угар). «FAQ» переехал на отдельную страницу. «Биография» получила новый стиль и плейлист! 🔥" },
    { title: "Улучшена Биография!", date: "10 сентября 2025", content: "Переработали страницу Биографии! Больше деталей о моём пути и планах. Проверь по кнопке \"Биография\"! 😎" },
    { title: "Редизайн сайта!", date: "19 августа 2025", content: "Новый дизайн сайта: красивый, уникальный, обновлённый! Оцени и следи за апдейтами! 😎" },
    { title: "Форум временно убран", date: "27 июля 2025", content: "Спам-боты атаковали форум, поэтому мы его временно убрали. Планируем вернуть в августе с новым дизайном! Вопросы пока в Telegram: <a href=\"https://t.me/MortisplayQABot\" class=\"underline text-indigo-600 dark:text-indigo-400\" rel=\"noopener\">MortisplayQABot</a>." },
    { title: "Новые мемы!", date: "16 июля 2025", content: "Добавили 7 новых мемов! Проверь на сайте и удиви друзей! 😋" }
  ];
  const setupNews = () => {
    const grid = document.getElementById('newsGrid');
    const loadMore = document.getElementById('loadMoreNews');
    let page = 1;
    const perPage = 3;
    const renderNews = (append = false) => {
      if (!append) {
        grid.innerHTML = '';
        page = 1;
      }
      const start = (page - 1) * perPage;
      const end = start + perPage;
      const items = newsData.slice(start, end);
      items.forEach(item => {
        const article = document.createElement('article');
        article.className = 'card-hover rounded-2xl p-6 fade-in bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700';
        article.innerHTML = `
          <h3 class="text-lg font-semibold text-indigo-600 dark:text-indigo-400">${item.title}</h3>
          <p class="mt-2 text-sm text-slate-600 dark:text-slate-300">${item.content}</p>
          <p class="mt-3 text-xs text-slate-500 dark:text-slate-400">С любовью Mortis32 &lt;3 · ${item.date}</p>
        `;
        grid.appendChild(article);
      });
      loadMore.style.display = end >= newsData.length ? 'none' : 'inline-flex';
      setupFadeIn();
    };
    loadMore.addEventListener('click', () => {
      page++;
      renderNews(true);
    });
    renderNews();
  };
  const setupNavigation = () => {
    const menuToggle = document.getElementById('menuToggle');
    const sidebarMenu = document.getElementById('sidebarMenu');
    const closeMenu = document.getElementById('closeMenu');
    if (menuToggle && sidebarMenu && closeMenu) {
      menuToggle.addEventListener('click', () => {
        sidebarMenu.classList.toggle('open');
        menuToggle.setAttribute('aria-expanded', sidebarMenu.classList.contains('open'));
        gtag('event', 'menu_toggle', { event_category: 'navigation', event_label: sidebarMenu.classList.contains('open') ? 'open' : 'close' });
        logAction(`Меню: ${sidebarMenu.classList.contains('open') ? 'Открыто' : 'Закрыто'}`);
      });
      closeMenu.addEventListener('click', () => {
        sidebarMenu.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
        gtag('event', 'menu_close', { event_category: 'navigation', event_label: 'close' });
        logAction('Меню закрыто');
      });
    }
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = anchor.getAttribute('href').substring(1);
        const target = document.getElementById(targetId);
        if (target) {
          const headerOffset = 80;
          const elementPosition = target.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
          gtag('event', 'nav_click', { event_category: 'navigation', event_label: targetId });
          logAction(`Переход к секции: ${targetId}`);
        }
        if (sidebarMenu && sidebarMenu.classList.contains('open')) {
          sidebarMenu.classList.remove('open');
          menuToggle.setAttribute('aria-expanded', 'false');
        }
      });
    });
  };
  const setupParticles = () => {
    const canvas = document.getElementById('backgroundParticles');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const particles = [];
    const particleCount = Math.floor(window.innerWidth / 20);
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 3 + 1,
        speedX: Math.random() * 0.5 - 0.25,
        speedY: Math.random() * 0.5 - 0.25
      });
    }
    const animateParticles = () => {
      if (root.classList.contains('no-particles') || root.classList.contains('low-performance')) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.speedX;
        p.y += p.speedY;
        if (p.x < 0 || p.x > canvas.width) p.speedX *= -1;
        if (p.y < 0 || p.y > canvas.height) p.speedY *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = root.classList.contains('dark') ? '#e5e7eb' : '#1f2937';
        ctx.fill();
      });
      requestAnimationFrame(animateParticles);
    };
    window.addEventListener('resize', () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    });
    animateParticles();
  };
  const setupFadeIn = () => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
  };
  const setupVideoErrorHandling = () => {
    const video = document.querySelector('.banner-video');
    if (video) {
      video.addEventListener('error', () => {
        const fallbackImg = video.nextElementSibling;
        if (fallbackImg) {
          video.classList.add('hidden');
          fallbackImg.classList.remove('hidden');
          logAction('Ошибка загрузки видео в баннере');
        }
      });
    }
  };
  const setupLoader = () => {
    const loader = document.getElementById('loader');
    const siteContent = document.getElementById('siteContent');
    if (loader && siteContent) {
      const hideLoader = () => {
        loader.style.display = 'none';
        siteContent.classList.remove('hidden');
        gtag('event', 'page_load', { event_category: 'performance', event_label: 'site_loaded' });
        logAction('Сайт загружен');
      };
      window.addEventListener('load', () => {
        setTimeout(hideLoader, 500);
      });
      setTimeout(hideLoader, 10000);
    }
  };

  // === НОВЫЕ ФИКСЫ: ГЛАДКИЙ СКРОЛЛ + ХЕДЕР ПРИ СКРОЛЛЕ ===
  const enableSmoothScroll = () => {
    const supportsSmooth = CSS.supports('scroll-behavior', 'smooth');
    if (!supportsSmooth) {
      document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
          e.preventDefault();
          const targetId = this.getAttribute('href');
          const target = document.querySelector(targetId);
          if (target) {
            const headerOffset = 80;
            const elementPosition = target.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
            window.scrollTo({
              top: offsetPosition,
              behavior: 'smooth'
            });
          }
        });
      });
    }
    document.documentElement.classList.add('js-smooth-scroll');
  };

  const headerHideOnScroll = () => {
    let lastScroll = 0;
    const header = document.querySelector('header');
    if (!header) return;
    window.addEventListener('scroll', () => {
      const currentScroll = window.pageYOffset;
      if (currentScroll > lastScroll && currentScroll > 100) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
      lastScroll = currentScroll;
    });
  };

  window.addEventListener('storage', (e) => {
    if (e.key === 'theme') {
      setTheme(e.newValue);
    } else if (e.key === 'lowPerformance') {
      root.classList.toggle('low-performance', e.newValue === 'true');
    } else if (e.key === 'disableAnimations') {
      root.classList.toggle('no-animations', e.newValue === 'true');
    } else if (e.key === 'disableParticles') {
      root.classList.toggle('no-particles', e.newValue === 'true');
    } else if (e.key === 'fontSize') {
      root.style.setProperty('--font-scale', e.newValue / 100);
    } else if (e.key === 'highContrast') {
      root.classList.toggle('high-contrast', e.newValue === 'true');
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    setupProfileBetaNotice();
    setupThemeToggle();
    setupThemeSelect();
    setupPerformance();
    setupAnimations();
    setupParticleToggle();
    setupFontSize();
    setupHighContrast();
    setupResetSettings();
    setupProfile();
    updateProjectProgress();
    setupVideos();
    setupNews();
    setupNavigation();
    setupParticles();
    setupFadeIn();
    setupLoader();
    setupVideoErrorHandling();
    enableSmoothScroll();     // ← Гладкий скролл
    headerHideOnScroll();     // ← Хедер при скролле
  });
})();
