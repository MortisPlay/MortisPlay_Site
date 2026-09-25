/* ============================================================
   БАГАЖНОЕ ВОЗМЕЗДИЕ — логика страницы
   Конфиг сериала, карусель серий, киноплеер, награды за просмотр
   ============================================================ */
(function () {
  'use strict';

  /* ===================== КОНФИГ СЕРИАЛА ===================== */
  // videoId — YouTube ID ролика (11 символов). Пока трейлер не вышел,
  // оставьте плейсхолдер — карточки будут показывать статус «Скоро».
  var SERIES = {
    slug: 'baggage-revenge',
    title: 'Багажное возмездие',
    poster: 'assets/dlyasite.png', // фоновый баннер hero — текст поверх, фон затемняется шейдом
    metaYear: '2026',
    metaAge: '16+',
    logline: 'Потерянный багаж не забывает. Он возвращается — чтобы забрать своё.',
    coins: 1000,          // награда за полный просмотр
    giftEnabled: false,   // включить рандомный подарок, когда выйдут серии
    gifts: [              // пул подарков (используется при giftEnabled: true)
      { slug: 'gold_frame', weight: 40 },
      { slug: 'neon_frame', weight: 30 },
      { slug: 'fire_frame', weight: 15 },
      { slug: 'cosmic_frame', weight: 10 },
      { slug: 'royal_frame', weight: 5 }
    ],
    episodes: [
      {
        id: 'br-trailer',
        type: 'trailer',
        title: 'Трейлер',
        videoId: 'Y3Meb8Z-nyU', // ← ВСТАВЬТЕ ID трейлера с YouTube
        duration: '1:03',
        durationSeconds: 102,
        date: '25 сентября 2026',
        desc: 'Первый взгляд на мир, где багаж берёт реванш. Досмотри трейлер до конца и забери свою награду.'
      }
      // Пример добавления серии:
      // { id: 'br-ep1', type: 'episode', title: 'Серия 1 · Пропажа', videoId: '...', duration: '6:40', durationSeconds: 400, date: '...', desc: '...' }
    ]
  };

  var VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
  var PROFILE_KEY = 'profile-user';
  var AUTH_TOKEN_KEY = 'auth-token';
  var WATCH_STATE = {}; // episodeId -> { watchedMs, playing, interval, rewarded, rewardedOnServer }

  /* ===================== ХЕЛПЕРЫ ===================== */
  function getStoredProfile() {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || null; } catch (e) { return null; }
  }
  function saveProfile(profile) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (e) {}
  }
  function getAuthToken() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY); } catch (e) { return null; }
  }
  function isLoggedIn() {
    return Boolean(getStoredProfile() && getStoredProfile().email);
  }
  function getRewardedSeriesVideos() {
    var p = getStoredProfile();
    var list = (p && Array.isArray(p.seriesRewardVideos)) ? p.seriesRewardVideos : [];
    return list.map(String);
  }
  function addRewardedSeriesVideo(videoId) {
    var p = getStoredProfile();
    if (!p) return;
    var list = (Array.isArray(p.seriesRewardVideos) ? p.seriesRewardVideos : []).map(String);
    if (!list.includes(String(videoId))) list.push(String(videoId));
    p.seriesRewardVideos = list;
    saveProfile(p);
  }
  function isEpisodeLive(episode) {
    return VIDEO_ID_RE.test(String(episode.videoId || ''));
  }
  function isEpisodeRewarded(episode) {
    return getRewardedSeriesVideos().indexOf(String(episode.videoId)) >= 0;
  }
  function formatTime(totalSeconds) {
    var t = Math.max(0, totalSeconds);
    var m = Math.floor(t / 60);
    var s = t % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  function $(id) { return document.getElementById(id); }

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

  function coinsBurst() {
    var container = document.createElement('div');
    container.className = 'br-coins-burst';
    document.body.appendChild(container);
    for (var i = 0; i < 18; i++) {
      var coin = document.createElement('span');
      coin.className = 'br-coin';
      coin.textContent = ['🪙', '✨', '💰'][i % 3];
      coin.style.left = (6 + Math.random() * 88) + '%';
      coin.style.animationDuration = (1.1 + Math.random() * 1.3) + 's';
      coin.style.animationDelay = (Math.random() * 0.5) + 's';
      container.appendChild(coin);
    }
    setTimeout(function () { container.remove(); }, 3200);
  }

  /* ===================== БАЛАНС ===================== */
  function renderBalance() {
    var balanceEl = $('brBalance');
    var textEl = $('brBalanceText');
    var p = getStoredProfile();
    if (balanceEl && textEl) {
      if (p && Number.isFinite(Number(p.coins))) {
        textEl.textContent = Number(p.coins).toLocaleString('ru-RU');
        balanceEl.style.display = 'inline-flex';
      } else {
        balanceEl.style.display = 'none';
      }
    }
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

    updateTrailerRewardLine(trailer);
  }

  function updateTrailerRewardLine(episode) {
    var line = $('brTrailerRewardLine');
    var text = $('brTrailerRewardText');
    if (!line || !text) return;
    var rewarded = isEpisodeRewarded(episode);
    if (rewarded) {
      line.classList.add('done');
      line.innerHTML = '<i class="fas fa-circle-check"></i> <span>Просмотрено — награда получена (+' + SERIES.coins + ' монет)</span>';
    } else {
      line.classList.remove('done');
      line.innerHTML = '<i class="fas fa-coins"></i> <span>' + text.textContent.replace(/^\s*\+/, '+') + '</span>';
    }
  }

  /* ===================== ОТРИСОВКА ЛЕНТЫ СЕРИЙ ===================== */
  function renderEpisodes() {
    var track = $('brTrack');
    if (!track) return;
    track.innerHTML = '';
    SERIES.episodes.forEach(function (episode) {
      var live = isEpisodeLive(episode);
      var rewarded = isEpisodeRewarded(episode);
      var card = document.createElement('article');
      card.className = 'br-card' + (rewarded ? ' rewarded' : '');
      card.setAttribute('data-episode', episode.id);
      card.innerHTML =
        '<div class="br-card-poster">' +
          (live
            ? '<img src="https://i.ytimg.com/vi/' + episode.videoId + '/hqdefault.jpg" alt="' + escapeHtml(episode.title) + '" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display=\'none\';">'
            : '') +
          '<div class="br-card-number">' + (live ? escapeHtml(episode.title) : 'Скоро') + '</div>' +
          '<div class="br-card-duration">' + escapeHtml(episode.duration || '—') + '</div>' +
          '<div class="br-card-reward"><i class="fas ' + (rewarded ? 'fa-circle-check' : 'fa-coins') + '"></i>' + (rewarded ? 'Награда получена' : '+' + SERIES.coins + ' монет') + '</div>' +
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

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')
      .replace(/"/g, '"').replace(/'/g, '&#039;');
  }

  function updateAllRewardStates() {
    renderTrailer();
    renderEpisodes();
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
    var st = WATCH_STATE[episode.id] = WATCH_STATE[episode.id] || {
      watchedMs: 0, playing: false, interval: null, rewarded: isEpisodeRewarded(episode)
    };

    $('brPlayerTitle').textContent = episode.title + ' · ' + SERIES.title;
    $('brPlayerStatus').textContent = st.rewarded
      ? 'Награда за этот ролик уже получена'
      : 'Досмотрите до конца — ' + SERIES.coins + ' монет!';
    $('brPlayerProgress').style.width = '0%';
    $('brWatchOverlay').textContent = formatTime(st.watchedMs / 1000) + ' / ' + episode.duration;
    $('brWatchOverlay').classList.add('br-watch-overlay--hidden');

    frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(episode.videoId) +
      '?enablejsapi=1&autoplay=1&playsinline=1&modestbranding=1&rel=0&origin=' + encodeURIComponent(window.location.origin);

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // API может долго грузиться (блокировки в РФ) — таймер-подсказка
    apiFailedTimer = setTimeout(function () {
      $('brPlayerStatus').textContent = 'Видео играет встроенным плеером. Для награды досмотрите до конца на YouTube.';
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
    if (currentEpisode) {
      stopTick(currentEpisode);
      currentEpisode = null;
    }
    var modal = $('brPlayerModal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (resetFrame) $('brPlayerIframe').src = '';
  }

  function handlePlayerState(episode, event) {
    var st = WATCH_STATE[episode.id];
    if (!st) return;
    if (event.data === YT.PlayerState.PLAYING) {
      st.playing = true;
      if (!st.interval) {
        st.interval = setInterval(function () { tick(episode); }, 1000);
      }
      $('brPlayerStatus').textContent = st.rewarded
        ? 'Просмотр идёт… Награда уже получена за этот ролик.'
        : 'Просмотр идёт… Досмотрите до конца для награды.';
    } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.BUFFERING) {
      st.playing = false;
      if (event.data === YT.PlayerState.PAUSED) {
        $('brPlayerStatus').textContent = 'Пауза — прогресс остановлен.';
      }
    } else if (event.data === YT.PlayerState.ENDED) {
      st.playing = false;
      if (!st.rewarded && st.watchedMs >= episode.durationSeconds * 900) {
        completeWatch(episode);
      } else {
        $('brPlayerStatus').textContent = 'Видео завершено.';
      }
    }
  }

  function tick(episode) {
    var st = WATCH_STATE[episode.id];
    if (!st || !st.playing || st.rewarded) return;
    st.watchedMs += 1000;
    updateWatchUI(episode);
    if (st.watchedMs >= episode.durationSeconds * 1000) {
      completeWatch(episode);
    }
  }

  function stopTick(episode) {
    var st = WATCH_STATE[episode.id];
    if (st && st.interval) {
      clearInterval(st.interval);
      st.interval = null;
    }
    if (st) st.playing = false;
  }

  function updateWatchUI(episode) {
    var st = WATCH_STATE[episode.id];
    if (!st) return;
    var overlay = $('brWatchOverlay');
    overlay.textContent = formatTime(st.watchedMs / 1000) + ' / ' + episode.duration;
    overlay.classList.remove('br-watch-overlay--hidden');
    var total = Math.max(1, episode.durationSeconds);
    $('brPlayerProgress').style.width = Math.min(100, (st.watchedMs / 1000 / total) * 100) + '%';
  }

  /* ===================== НАГРАДА ===================== */
  function completeWatch(episode) {
    var st = WATCH_STATE[episode.id];
    if (!st || st.rewarded) return;
    st.rewarded = true;
    stopTick(episode);
    claimReward(episode, function (ok, errorText) {
      if (!ok) {
        st.rewarded = false;
        $('brPlayerStatus').textContent = errorText || 'Награда не начислена.';
      } else {
        $('brPlayerStatus').textContent = 'Награда получена! +' + SERIES.coins + ' монет 🎉';
        $('brWatchOverlay').textContent = 'Награда получена!';
      }
    });
  }

  function claimReward(episode, done) {
    if (!isLoggedIn()) {
      done(false, 'Войдите в аккаунт, чтобы получить награду.');
      showToast('Сначала войдите в аккаунт, чтобы получить награду.', 'warning');
      return;
    }
    var token = getAuthToken();
    if (!token) {
      done(false, 'Сессия не найдена. Войдите в аккаунт.');
      return;
    }
    fetch('/api/series/reward', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        seriesSlug: SERIES.slug,
        episodeId: episode.id,
        videoId: episode.videoId,
        durationSeconds: episode.durationSeconds
      })
    })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, status: res.status, data: data }; }); })
      .then(function (result) {
        if (!result.ok) {
          done(false, result.data && result.data.error ? result.data.error : 'Не удалось начислить награду.');
          showToast(result.data && result.data.error ? result.data.error : 'Ошибка начисления награды.', 'warning');
          return;
        }
        var data = result.data;
        if (data.profile) {
          saveProfile(data.profile);
          addRewardedSeriesVideo(episode.videoId);
        }
        renderBalance();
        updateAllRewardStates();
        showToast('+' + SERIES.coins + ' монет за просмотр! 🎉', 'success');
        coinsBurst();
        var balanceEl = $('brBalance');
        if (balanceEl) {
          balanceEl.classList.remove('coins-flash');
          void balanceEl.offsetWidth; // перезапуск анимации
          balanceEl.classList.add('coins-flash');
        }
        done(true);
      })
      .catch(function (err) {
        console.error('Series reward request failed:', err);
        done(false, 'Ошибка сети при начислении награды.');
      });
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
    renderBalance();
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
    closePlayer: closePlayer,
    reloadProfile: function () { renderBalance(); updateAllRewardStates(); }
  };
})();