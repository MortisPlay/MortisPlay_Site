// Функция логирования (без вывода в консоль)
const logAction = (message) => {
  // Логирование отключено для производительности
  console.log = () => {};
};

// Управление темой
const root = document.documentElement;
const setTheme = (theme) => {
  logAction(`Тема установлена: ${theme}`);
  localStorage.setItem('theme', theme);
  root.classList.toggle('dark', theme === 'dark');
};

// Инициализация темы
const initializeTheme = () => {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    setTheme(savedTheme);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    setTheme('dark');
  } else {
    setTheme('light');
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) =>
    setTheme(e.matches ? 'dark' : 'light')
  );
};

// Обработчик меню
const setupMenu = () => {
  const toggle = document.getElementById('menuToggle');
  const close = document.getElementById('closeMenu');
  const sidebar = document.getElementById('sidebarMenu');

  if (toggle && sidebar) {
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      sidebar.classList.toggle('open');
      toggle.setAttribute('aria-expanded', sidebar.classList.contains('open'));
    });
  }
  if (close && sidebar) {
    close.addEventListener('click', (e) => {
      e.preventDefault();
      sidebar.classList.remove('open');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    });
  }
  document.addEventListener('click', (e) => {
    if (sidebar && toggle && !sidebar.contains(e.target) && e.target !== toggle) {
      sidebar.classList.remove('open');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    }
  });
};

// Настройка анимации появления
const setupFadeIn = () => {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px' }
  );
  const fadeElements = document.querySelectorAll('.fade-in, section');
  if (fadeElements.length > 0) {
    fadeElements.forEach((el) => {
      if (el instanceof Element) {
        io.observe(el);
      }
    });
  } else {
    logAction('Элементы для fade-in не найдены');
  }
};

// Инициализация видео
const setupVideos = () => {
  const tpl = document.getElementById('ytCardTpl');
  const grid = document.querySelector('#videos .mt-8.grid');
  if (tpl && grid) {
    const videoData = [
      { src: 'https://rutube.ru/play/embed/17ab491deff35ceaacdbe027e266e9f6/', title: 'Угар в Content Warning' },
      { src: 'https://rutube.ru/play/embed/ea7fa319476924cad6ae44e7972f7f7e/', title: 'УГАР В REPO' },
      { src: 'https://rutube.ru/play/embed/46b92548cd13429c14348feb10dbd35d/', title: 'Игра CS2 (feat. Johnny Drill)' },
      { src: 'https://rutube.ru/play/embed/2ba4872771e827b6ce560a8390462643/', title: 'ВРЕМЯ УГАРА И ПРЕДАТЕЛЬСТВА PEAK!' },
      { src: 'https://rutube.ru/play/embed/4e88d1d8cacec555ddb17bff2720394a/', title: 'Mortisplay32 ИГРАЕТ В PEAK' }
    ];
    videoData.forEach((v) => {
      const node = tpl.content.cloneNode(true);
      const iframe = node.querySelector('iframe');
      const title = node.querySelector('p');
      if (iframe && title) {
        iframe.src = v.src;
        iframe.setAttribute('title', `Видео: ${v.title}`);
        title.textContent = v.title;
        grid.appendChild(node);
      }
    });
  }
};

// Управление лоадером
const setupLoader = () => {
  window.addEventListener('load', () => {
    logAction('Загрузка завершена');
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
  });

  setTimeout(() => {
    logAction('Таймаут 5с сработал');
    const loader = document.getElementById('loader');
    const site = document.getElementById('siteContent');
    if (loader && site) {
      loader.style.display = 'none';
      site.classList.remove('hidden');
    }
  }, 5000);
};

// Инициализация всех компонентов
const initializeApp = () => {
  initializeTheme();
  setupMenu();
  setupFadeIn();
  setupVideos();
  setupLoader();
};

// Запуск приложения
document.addEventListener('DOMContentLoaded', initializeApp);
