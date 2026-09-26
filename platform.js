/* ============================================================
   ПЛАТФОРМА — логика страницы
   Каталог анимационных сериалов Mortis Play:
   «Багажное возмездие», «Бароны», «Типичные случаи и ситуации»
   Переключатель проектов, карусель роликов, киноплеер
   (система наград отключена — только просмотр)
   ============================================================ */
(function () {
  'use strict';

  /* ===================== КОНФИГ ПЛАТФОРМЫ ===================== */
  // status: 'live' — проект доступен, 'dev' — в разработке.
  // videoId — YouTube ID ролика (11 символов). Пока ролик не вышел,
  // оставьте плейсхолдер — карточки будут показывать статус «Скоро».
  var SHOWS = [
    {
      slug: 'baggage-revenge',
      title: 'Багажное возмездие',
      heroTitle: 'БАГАЖНОЕ<br>ВОЗМЕЗДИЕ',
      status: 'live',
      kicker: 'Эксклюзивный сериал Mortis Play',
      poster: 'assets/dlyasite.png', // фоновый баннер hero — текст поверх, фон затемняется шейдом
      metaYear: '2026',
      metaAge: '16+',
      logline: 'Его гнобили, изгнали - он теперь готов отомстить всем, кто мешал его пути.',
      aboutLead: '«Багажное возмездие» — анимационный мини-сериал Mortis Play о том, что каждый обдуманный вариант имеет выгоду. И память. И план.',
      aboutCards: [
        {
          icon: 'fas fa-suitcase-rolling',
          title: 'Сюжет',
          text: 'Сюжет разворачивается вокруг группы криминальных дельцов и изгоев, которые были в шаге от полного контроля над мегаполисом.'
        },
        {
          icon: 'fas fa-clapperboard',
          title: 'Формат',
          text: 'Короткие серии в фирменном стиле Mortis Play: динамичный монтаж, отсылки к стримам и мемам комьюнити.'
        }
      ],
      detailsTitle: 'Багажное возмездие',
      detailsText: '«Багажное возмездие» — анимационный мини-сериал от Mortis Play. Сюжет разворачивается вокруг группы криминальных дельцов и изгоев, которые были в шаге от полного контроля над мегаполисом. Однако из-за глупой ошибки и проваленной операции все планы рушатся, а главные герои оказываются на самом дне.\n\nГлавный герой, на которого команда взвалила всю вину за провал, сталкивается с жестокостью как со стороны бывших соратников, так и со стороны безжалостной охраны местной верхушки. Пережив унижение, экстрим и предательство (его буквально выбрасывают за борт как ненужный багаж), он доходит до грани отчаяния.\n\nОднако вместо того чтобы сдаться, герой решает совершить радикальный поворот. Поняв, что терять ему больше нечего, он находит неожиданный и коварный выход из ситуации. Собирая новую команду и объединяя силы с теми, кого раньше не брали в расчет, он готовится вернуть себе город и переписать правила игры.',
      episodes: [
        {
          id: 'br-trailer',
          type: 'trailer',
          title: 'Трейлер',
          videoId: 'Y3Meb8Z-nyU', // ID трейлера с YouTube
          duration: '1:02',
          date: '25 сентября 2026',
          desc: 'Это будет Absolute cinema.'
        },
        // Серии 1–8: ещё не вышли — без videoId карточки показывают статус «Скоро».
        { id: 'br-ep1', type: 'episode', title: 'Серия 1 · Скоро', date: 'Скоро' },
        { id: 'br-ep2', type: 'episode', title: 'Серия 2 · Скоро', date: 'Скоро' },
        { id: 'br-ep3', type: 'episode', title: 'Серия 3 · Скоро', date: 'Скоро' },
        { id: 'br-ep4', type: 'episode', title: 'Серия 4 · Скоро', date: 'Скоро' },
        { id: 'br-ep5', type: 'episode', title: 'Серия 5 · Скоро', date: 'Скоро' },
        { id: 'br-ep6', type: 'episode', title: 'Серия 6 · Скоро', date: 'Скоро' },
        { id: 'br-ep7', type: 'episode', title: 'Серия 7 · Скоро', date: 'Скоро' },
        { id: 'br-ep8', type: 'episode', title: 'Серия 8 · Скоро', date: 'Скоро' }
      ]
    },
    {
      slug: 'barons',
      title: 'Бароны',
      heroTitle: 'БАРОНЫ',
      status: 'dev',
      kicker: 'Новый проект в разработке',
      poster: null,
      metaYear: 'Скоро',
      metaAge: '16+',
      logline: 'За кулисами уже кипит работа — подробности совсем скоро.',
      aboutLead: '«Бароны» — новый анимационный сериал Mortis Play. Сейчас проект находится в разработке: пишется сценарий, рисуются раскадровки и собирается команда.',
      aboutCards: [
        {
          icon: 'fas fa-wrench',
          title: 'В разработке',
          text: 'Производство идёт полным ходом. Мы показываем процесс за кадром — следи за разделом «За кадром».'
        },
        {
          icon: 'fas fa-rocket',
          title: 'Скоро',
          text: 'Дата премьеры будет объявлена позже. Не пропусти анонс на платформе и в новостях.'
        }
      ],
      detailsTitle: 'Бароны',
      detailsText: '«Бароны» — новый анимационный сериал Mortis Play, который сейчас находится в разработке. Следите за новостями — подробности совсем скоро.',
      episodes: []
    },
    {
      slug: 'typical-cases',
      title: 'Типичные случаи и ситуации',
      heroTitle: 'ТИПИЧНЫЕ СЛУЧАИ<br>И СИТУАЦИИ',
      status: 'dev',
      kicker: 'Новый проект в разработке',
      poster: null,
      metaYear: 'Скоро',
      metaAge: '16+',
      logline: 'Истории, которые случаются с каждым, — скоро на платформе.',
      aboutLead: '«Типичные случаи и ситуации» — новый анимационный сериал Mortis Play. Проект в разработке: готовим знакомые каждому ситуации в фирменном стиле студии.',
      aboutCards: [
        {
          icon: 'fas fa-face-grin-squint',
          title: 'Жанр',
          text: 'Комедийные зарисовки о повседневных ситуациях, которые узнает каждый.'
        },
        {
          icon: 'fas fa-wrench',
          title: 'В разработке',
          text: 'Производство уже идёт — следи за закулисьем в разделе «За кадром».'
        }
      ],
      detailsTitle: 'Типичные случаи и ситуации',
      detailsText: 'Новый анимационный сериал Mortis Play в жанре комедийных зарисовок. Сейчас проект в разработке — подробности появятся позже.',
      episodes: []
    }
  ];

  // Общее закулисье платформы (раздел «О проекте» → «За кадром»)
  var BEHIND_SCENES = {
    title: 'За кадром · В разработке',
    lead: 'То, что обычно остаётся за кадром: рабочие материалы, раскадровки, скриншоты производства и черновики будущих сериалов. Проекты в разработке уже видны на платформе — следи за обновлениями!',
    photos: [
      'assets2/Снимок экрана 2026-09-25 204004.png',
      'assets2/photo_5291782115840172013_y.jpg',
      'assets2/photo_5291782115840172014_y.jpg',
      'assets2/photo_5291782115840172015_y.jpg'
    ]
  };

  var VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

  /* ===================== ХЕЛПЕРЫ ===================== */
  function isEpisodeLive(episode) {
    return VIDEO_ID_RE.test(String(episode.videoId || ''));
  }
  function findEpisodeByType(show, type) {
    if (!show || !show.episodes) return null;
    for (var i = 0; i < show.episodes.length; i++) {
      if (show.episodes[i].type === type) return show.episodes[i];
    }
    return null;
  }
  function findTrailer(show) {
    return findEpisodeByType(show, 'trailer');
  }
  function $(id) { return document.getElementById(id); }
  function escapeHtml(str) {
    // Сущности собираются через fromCharCode(38) (&), чтобы они не
    // терялись при записи/передаче файла как HTML-код.
    var amp = String.fromCharCode(38);
    return String(str == null ? '' : str)
      .replace(/&/g, amp + 'amp;')
      .replace(/</g, amp + 'lt;')
      .replace(/>/g, amp + 'gt;')
      .replace(/"/g, amp + 'quot;')
      .replace(/'/g, amp + '#039;');
  }

  /* ===================== ЛОАДЕР ===================== */
  function hidePageLoader() {
    var loader = document.getElementById('brLoader');
    if (!loader || loader._hidden) return;
    loader._hidden = true;
    loader.classList.add('br-loader--hidden');
    setTimeout(function () {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
    }, 500);
  }
  // Скрываем после полной загрузки ресурсов страницы…
  window.addEventListener('load', hidePageLoader);
  // …и по страховочному таймеру, чтобы лоадер не завис при медленной сети.
  setTimeout(hidePageLoader, 3500);

  /* ===================== УВЕДОМЛЕНИЯ ===================== */
  function showToast(message, type) {
    var container = $('brToasts');
    if (!container) return;
    var el = document.createElement('div');
    el.className = 'br-toast br-toast--' + (type || 'info');
    el.textContent = message;
    container.appendChild(el);
    setTimeout(function () {
      el.classList.add('hide');
      setTimeout(function () { el.remove(); }, 350);
    }, 3800);
  }

  /* ===================== СОСТОЯНИЕ ПЛАТФОРМЫ ===================== */
  var currentShow = SHOWS[0];

  /* ===================== ПЕРЕКЛЮЧАТЕЛЬ ПРОЕКТОВ ===================== */
  function renderTabs() {
    var tabs = $('brTabs');
    if (!tabs) return;
    tabs.innerHTML = '';
    SHOWS.forEach(function (show, index) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'br-tab' + (show === currentShow ? ' is-active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', show === currentShow ? 'true' : 'false');
      btn.innerHTML =
        '<span class="br-tab-name">' + escapeHtml(show.title) + '</span>' +
        (show.status === 'dev' ? '<span class="br-tab-badge"><span class="br-dot br-dot--blink"></span>В разработке</span>' : '');
      btn.addEventListener('click', function () {
        if (show !== currentShow) switchShow(index);
      });
      tabs.appendChild(btn);
    });
  }

  function switchShow(index) {
    var show = SHOWS[index] || SHOWS[0];
    currentShow = show;
    closePlayer(true);
    renderTabs();
    renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ===================== HERO ===================== */
  function renderHero() {
    var show = currentShow;
    var bg = $('brHeroBg');
    if (show.poster) {
      bg.style.backgroundImage = "url('" + show.poster + "')";
      bg.classList.add('has-poster');
    } else {
      bg.style.backgroundImage = 'none';
      bg.classList.remove('has-poster');
    }

    $('brHeroKicker').innerHTML =
      '<span class="br-dot br-dot--blink"></span> ' + escapeHtml(show.kicker || 'Проект Mortis Play');
    $('brHeroTitle').innerHTML = show.heroTitle || escapeHtml(show.title).toUpperCase();
    $('brHeroLogline').textContent = show.logline || '';

    var meta = [
      show.metaYear || 'Скоро',
      show.metaAge || '16+',
      show.status === 'live' ? 'Трейлер' : 'В разработке'
    ];
    if (show.status === 'live') meta.push('HD');
    $('brHeroMeta').innerHTML = meta
      .map(function (m) { return '<span class="br-meta-' + (m === 'HD' ? 'hd' : 'season') + '">' + escapeHtml(m) + '</span>'; })
      .join('');

    var trailer = findTrailer(show);
    var watchBtn = $('brWatchTrailerBtn');
    if (trailer && isEpisodeLive(trailer)) {
      watchBtn.classList.remove('br-hidden');
      watchBtn.innerHTML = '<i class="fas fa-play"></i> Смотреть трейлер';
      watchBtn.disabled = false;
      watchBtn.onclick = function () { openPlayer(trailer); };
    } else {
      watchBtn.classList.add('br-hidden');
    }
    $('brMoreInfoBtn').onclick = function () { openModal('brDetailsModal'); };
  }

  /* ===================== О ПРОЕКТЕ ===================== */
  function renderAbout() {
    var show = currentShow;
    $('brAboutLead').textContent = show.aboutLead || '';

    var cards = $('brAboutCards');
    if (!cards) return;
    cards.innerHTML = '';
    (show.aboutCards || []).forEach(function (card) {
      var article = document.createElement('article');
      article.className = 'br-card-info';
      article.innerHTML =
        '<div class="br-card-info-icon"><i class="' + escapeHtml(card.icon) + '"></i></div>' +
        '<h3>' + escapeHtml(card.title) + '</h3>' +
        '<p>' + escapeHtml(card.text) + '</p>';
      cards.appendChild(article);
    });
  }

  /* ===================== ЗА КАДРОМ ===================== */
  function renderBehindScenes() {
    var block = $('brBehind');
    if (!block) return;
    $('brBehindTitle').innerHTML =
      '<span class="br-dot br-dot--blink"></span> ' + escapeHtml(BEHIND_SCENES.title);
    $('brBehindLead').textContent = BEHIND_SCENES.lead;

    var gallery = $('brBehindGallery');
    if (!gallery) return;
    gallery.innerHTML = '';
    BEHIND_SCENES.photos.forEach(function (src, i) {
      var fig = document.createElement('figure');
      fig.className = 'br-gallery-item';
      fig.innerHTML =
        '<img src="' + escapeHtml(src) + '" alt="Кадр за кулисами ' + (i + 1) + '" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=\'https://placehold.co/640x360/141414/ffffff?text=Backstage\';">' +
        '<figcaption>За кадром · ' + (i + 1) + '</figcaption>';
      gallery.appendChild(fig);
    });
  }

  /* ===================== ТРЕЙЛЕР ===================== */
  function renderTrailer() {
    var show = currentShow;
    var section = $('trailer');
    var trailer = findTrailer(show);

    if (!trailer || !isEpisodeLive(trailer)) {
      if (section) section.classList.add('br-hidden');
      return;
    }
    if (section) section.classList.remove('br-hidden');

    $('brTrailerTitle').textContent = 'Трейлер «' + show.title + '»';
    $('brTrailerDesc').textContent = trailer.desc || '';
    $('brTrailerDuration').textContent = trailer.duration || '—';

    var thumb = $('brTrailerThumb');
    thumb.style.display = '';
    thumb.src = 'https://i.ytimg.com/vi/' + trailer.videoId + '/hqdefault.jpg';
    $('brTrailerPlay').innerHTML = '<i class="fas fa-play"></i>';
    $('brTrailerBadge').textContent = 'Трейлер';

    var watchBtn = $('brTrailerWatchBtn');
    watchBtn.innerHTML = '<i class="fas fa-play"></i> Смотреть трейлер';
    watchBtn.disabled = false;
    watchBtn.classList.remove('br-btn--disabled');
    watchBtn.onclick = function () { openPlayer(trailer); };

    // Клик по оверлею на постере тоже открывает трейлер
    var playOverlay = $('brTrailerPlay');
    if (playOverlay) {
      playOverlay.onclick = function () { openPlayer(trailer); };
    }
  }

  /* ===================== ЛЕНТА СЕРИЙ ===================== */
  function renderEpisodes() {
    var show = currentShow;
    var section = $('episodes');
    var track = $('brTrack');

    // В ленте «Серии» — только серии, без трейлера
    var episodes = (show.episodes || []).filter(function (ep) { return ep.type !== 'trailer'; });

    if (!track) return;
    track.innerHTML = '';

    if (!episodes.length) {
      if (section) section.classList.add('br-hidden');
      return;
    }
    if (section) section.classList.remove('br-hidden');

    episodes.forEach(function (episode) {
      var live = isEpisodeLive(episode);
      var card = document.createElement('article');
      card.className = 'br-card';
      card.setAttribute('data-episode', episode.id);
      card.innerHTML =
        '<div class="br-card-poster">' +
          (live
            ? '<img src="https://i.ytimg.com/vi/' + episode.videoId + '/hqdefault.jpg" alt="' + escapeHtml(episode.title) + '" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display=\'none\';">'
            : '') +
          '<div class="br-card-number">' + (live ? escapeHtml(episode.title) : 'Скоро') + '</div>' +
          '<div class="br-card-duration">' + escapeHtml(episode.duration || '—') + '</div>' +
          (live ? '<div class="br-card-play"><i class="fas fa-play"></i></div>' : '') +
        '</div>' +
        '<div class="br-card-hover">' +
          '<h4>' + escapeHtml(episode.title) + '</h4>' +
          '<p>' + escapeHtml(episode.date || '') + '</p>' +
          (live ? '<button class="br-btn br-btn--white" data-play="' + episode.id + '"><i class="fas fa-play"></i> Смотреть</button>' : '') +
        '</div>';
      track.appendChild(card);

      card.addEventListener('click', function () {
        if (!live) {
          showToast('Этот ролик появится совсем скоро', 'info');
          return;
        }
        openPlayer(episode);
      });
    });

    // Сбрасываем стрелки карусели после перерисовки
    var prev = $('brRowPrev');
    var next = $('brRowNext');
    if (prev) prev.disabled = true;
    if (next) next.disabled = false;
  }

  /* ===================== КАРУСЕЛЬ ===================== */
  function initCarousel() {
    var row = $('brRow');
    var prev = $('brRowPrev');
    var next = $('brRowNext');
    if (!row) return;
    var scrollStep = function () {
      var card = row.querySelector('.br-card');
      return card ? card.getBoundingClientRect().width + 16 : 320;
    };
    prev.addEventListener('click', function () {
      row.scrollBy({ left: -scrollStep() * 2, behavior: 'smooth' });
    });
    next.addEventListener('click', function () {
      row.scrollBy({ left: scrollStep() * 2, behavior: 'smooth' });
    });
    row.addEventListener('scroll', function () {
      var max = row.scrollWidth - row.clientWidth - 4;
      prev.disabled = row.scrollLeft <= 4;
      next.disabled = row.scrollLeft >= max;
    });
  }

  /* ===================== МОДАЛКИ ===================== */
  function openModal(id) {
    var modal = $(id);
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(id) {
    var modal = $(id);
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  function initModals() {
    document.querySelectorAll('[data-br-close]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.getAttribute('data-br-close');
        closeModal(target === 'details' ? 'brDetailsModal' : target);
      });
    });
  }
  function renderDetails() {
    var show = currentShow;
    $('brDetailsTitle').textContent = show.detailsTitle || show.title;
    $('brDetailsText').textContent = show.detailsText || '';
  }

  /* ===================== КИНОПЛЕЕР ===================== */
  // Плеер на встроенном YouTube-iframe (без IFrame API).
  // Важно: IFrame API (new YT.Player) ЗАМЕНЯЕТ iframe на свой и теряет
  // id="brPlayerIframe" — после первого закрытия кнопка переставала работать.
  // Здесь элемент с id никогда не заменяется, поэтому повторные открытия надёжны.
  var currentEpisode = null;

  function openPlayer(episode) {
    if (!episode || !isEpisodeLive(episode)) {
      showToast('Этот ролик появится совсем скоро 🎬', 'info');
      return;
    }
    if (currentEpisode && currentEpisode.id === episode.id && $('brPlayerModal').classList.contains('open')) {
      return; // уже открыт этот ролик
    }
    closePlayer(true);

    currentEpisode = episode;
    var modal = $('brPlayerModal');
    var frame = $('brPlayerIframe');
    if (!modal || !frame) return;

    $('brPlayerTitle').textContent = episode.title + ' · ' + currentShow.title;
    $('brPlayerStatus').textContent = 'Загрузка…';

    frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(episode.videoId) +
      '?autoplay=1&playsinline=1&modestbranding=1&rel=0&origin=' + encodeURIComponent(window.location.origin);

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closePlayer(resetFrame) {
    currentEpisode = null;
    var modal = $('brPlayerModal');
    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
    if (resetFrame) {
      var frame = $('brPlayerIframe');
      if (frame) frame.src = '';
    }
  }

  /* ===================== ОТРИСОВКА ВСЕГО ===================== */
  function renderAll() {
    renderHero();
    renderAbout();
    renderBehindScenes();
    renderTrailer();
    renderEpisodes();
    renderDetails();
  }

  /* ===================== ИНИЦИАЛИЗАЦИЯ ===================== */
  function initReveal() {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.br-reveal').forEach(function (el) { observer.observe(el); });
  }

  function initHeaderScroll() {
    var header = document.querySelector('.br-header');
    window.addEventListener('scroll', function () {
      header.classList.toggle('scrolled', window.scrollY > 24);
    }, { passive: true });
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('brYear').textContent = String(new Date().getFullYear());
    $('brPlayerClose').addEventListener('click', function () { closePlayer(true); });
    $('brPlayerModal').addEventListener('click', function (e) {
      if (e.target === this || e.target.classList.contains('br-player-letterbox')) closePlayer(false);
    });

    renderTabs();
    renderAll();
    initCarousel();
    initModals();
    initReveal();
    initHeaderScroll();
  });

  // Публичный доступ (для отладки)
  window.brPlatform = {
    shows: SHOWS,
    currentShow: function () { return currentShow; },
    openPlayer: openPlayer,
    closePlayer: closePlayer
  };
})();
