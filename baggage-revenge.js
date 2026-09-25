/* ============================================================
   ПЛАТФОРМА — логика страницы
   Конфиг проекта, карусель роликов, киноплеер
   (система наград отключена — только просмотр)
   ============================================================ */
(function () {
  'use strict';

  /* ===================== КОНФИГ ПРОЕКТА ===================== */
  // videoId — YouTube ID ролика (11 символов). Пока ролик не вышел,
  // оставьте плейсхолдер — карточки будут показывать статус «Скоро».
  var SERIES = {
    slug: 'baggage-revenge',
    title: 'Багажное возмездие',
    poster: 'assets/dlyasite.png', // фоновый баннер hero — текст поверх, фон затемняется шейдом
    metaYear: '2026',
    metaAge: '16+',
    logline: 'Его гнобили, изгнали - он теперь готов отомстить всем, кто мешал его пути.',
    episodes: [
      {
        id: 'br-trailer',
        type: 'trailer',
        title: 'Трейлер',
        videoId: 'Y3Meb8Z-nyU', // ← ВСТАВЬТЕ ID трейлера с YouTube
        duration: '1:02',
        date: '25 сентября 2026',
        desc: 'Это будет Absolute cinema.'
      }
      // Пример добавления серии:
      // { id: 'br-ep1', type: 'episode', title: 'Серия 1 · Пропажа', videoId: '...', duration: '6:40', date: '...', desc: '...' }
    ]
  };

  var VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

  /* ===================== ХЕЛПЕРЫ ===================== */
  function isEpisodeLive(episode) {
    return VIDEO_ID_RE.test(String(episode.videoId || ''));
  }
  function $(id) { return document.getElementById(id); }
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')
      .replace(/"/g, '"').replace(/'/g, '&#039;');
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

  /* ===================== ОТРИСОВКА ТРЕЙЛЕРА ===================== */
  function renderTrailer() {
    var trailer = null;
    for (var i = 0; i < SERIES.episodes.length; i++) {
      if (SERIES.episodes[i].type === 'trailer') { trailer = SERIES.episodes[i]; break; }
    }
    if (!trailer) return;

    $('brTrailerTitle').textContent = 'Трейлер «' + SERIES.title + '»';
    $('brTrailerDesc').textContent = trailer.desc || '';
    $('brTrailerDuration').textContent = trailer.duration || '—';

    var live = isEpisodeLive(trailer);
    var thumb = $('brTrailerThumb');
    if (live) {
      thumb.style.display = '';
      thumb.src = 'https://i.ytimg.com/vi/' + trailer.videoId + '/hqdefault.jpg';
    } else {
      thumb.style.display = 'none';
      $('brTrailerPlay').innerHTML = '<i class="fas fa-hourglass-half"></i>';
    }
    $('brTrailerBadge').textContent = live ? 'Трейлер' : 'Скоро';

    var watchBtn = $('brTrailerWatchBtn');
    watchBtn.innerHTML = live
      ? '<i class="fas fa-play"></i> Смотреть трейлер'
      : '<i class="fas fa-hourglass-half"></i> Трейлер скоро';
    watchBtn.disabled = !live;
    watchBtn.classList.toggle('br-btn--disabled', !live);
  }

  /* ===================== ОТРИСОВКА ЛЕНТЫ РОЛИКОВ ===================== */
  function renderEpisodes() {
    var track = $('brTrack');
    if (!track) return;
    track.innerHTML = '';
    SERIES.episodes.forEach(function (episode) {
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
          showToast('Этот ролик появится совсем скоро 🧳', 'info');
          return;
        }
        openPlayer(episode);
      });
    });
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

  /* ===================== HERO ===================== */
  function initHero() {
    var bg = $('brHeroBg');
    if (SERIES.poster) {
      bg.style.backgroundImage = "url('" + SERIES.poster + "')";
      bg.classList.add('has-poster');
    }
    $('brHeroMeta').innerHTML =
      '<span class="br-meta-year">' + escapeHtml(SERIES.metaYear) + '</span>' +
      '<span class="br-meta-age">' + escapeHtml(SERIES.metaAge) + '</span>' +
      '<span class="br-meta-season">Трейлер</span>' +
      '<span class="br-meta-hd">HD</span>';
    $('brHeroLogline').textContent = SERIES.logline;

    var trailer = SERIES.episodes.find(function (e) { return e.type === 'trailer'; });
    $('brWatchTrailerBtn').addEventListener('click', function () {
      if (trailer && isEpisodeLive(trailer)) {
        openPlayer(trailer);
      } else {
        showToast('Трейлер выйдет совсем скоро 🎬', 'info');
      }
    });
    $('brMoreInfoBtn').addEventListener('click', function () {
      openModal('brDetailsModal');
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

  /* ===================== КИНОПЛЕЕР ===================== */
  var currentEpisode = null;
  var currentPlayer = null;
  var ytApiPromise = null;
  var apiFailedTimer = null;

  function loadYouTubeIframeApi() {
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if (ytApiPromise) return ytApiPromise;
    ytApiPromise = new Promise(function (resolve) {
      window.onYouTubeIframeAPIReady = function () { resolve(window.YT); };
      var tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.head.appendChild(tag);
    });
    return ytApiPromise;
  }

  function openPlayer(episode) {
    if (currentEpisode && currentEpisode.id === episode.id && $('brPlayerModal').classList.contains('open')) {
      return; // уже открыт этот ролик
    }
    closePlayer(true);

    currentEpisode = episode;
    var modal = $('brPlayerModal');
    var frame = $('brPlayerIframe');

    $('brPlayerTitle').textContent = episode.title + ' · ' + SERIES.title;
    $('brPlayerStatus').textContent = 'Нажмите Play, чтобы начать просмотр.';

    frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(episode.videoId) +
      '?enablejsapi=1&autoplay=1&playsinline=1&modestbranding=1&rel=0&origin=' + encodeURIComponent(window.location.origin);

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // API может долго грузиться (блокировки в РФ) — таймер-подсказка
    apiFailedTimer = setTimeout(function () {
      $('brPlayerStatus').textContent = 'Видео играет встроенным плеером.';
    }, 8000);

    loadYouTubeIframeApi().then(function (YT) {
      clearTimeout(apiFailedTimer);
      try {
        currentPlayer = new YT.Player(frame.id, {
          events: {
            onStateChange: function (event) { handlePlayerState(episode, event); },
            onError: function () {
              $('brPlayerStatus').textContent = 'Видео недоступно или заблокировано.';
            }
          }
        });
      } catch (err) {
        console.warn('Не удалось создать YT.Player:', err);
      }
    }).catch(function () {
      clearTimeout(apiFailedTimer);
      $('brPlayerStatus').textContent = 'Видео играет встроенным плеером.';
    });
  }

  function closePlayer(resetFrame) {
    clearTimeout(apiFailedTimer);
    if (currentPlayer) {
      try { currentPlayer.destroy(); } catch (e) {}
      currentPlayer = null;
    }
    currentEpisode = null;
    var modal = $('brPlayerModal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (resetFrame) $('brPlayerIframe').src = '';
  }

  function handlePlayerState(episode, event) {
    if (event.data === YT.PlayerState.PLAYING) {
      $('brPlayerStatus').textContent = 'Просмотр идёт…';
    } else if (event.data === YT.PlayerState.PAUSED) {
      $('brPlayerStatus').textContent = 'Пауза.';
    } else if (event.data === YT.PlayerState.BUFFERING) {
      $('brPlayerStatus').textContent = 'Загрузка…';
    } else if (event.data === YT.PlayerState.ENDED) {
      $('brPlayerStatus').textContent = 'Видео завершено.';
    }
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
    $('brTrailerWatchBtn').addEventListener('click', function () {
      var trailer = SERIES.episodes.find(function (e) { return e.type === 'trailer'; });
      if (trailer && isEpisodeLive(trailer)) openPlayer(trailer);
    });

    renderTrailer();
    renderEpisodes();
    initCarousel();
    initHero();
    initModals();
    initReveal();
    initHeaderScroll();
  });

  // Публичный доступ (для отладки)
  window.brSeries = {
    config: SERIES,
    openPlayer: openPlayer,
    closePlayer: closePlayer
  };
})();