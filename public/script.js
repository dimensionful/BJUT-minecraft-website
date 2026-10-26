/* =========================================================
   BJUT-MC · interactions, notices & poll client
   ========================================================= */

(function () {
  'use strict';

  var root = document.documentElement;
  var themeToggle = document.getElementById('theme-toggle');
  var themeMeta = document.getElementById('theme-color');
  var THEME_KEY = 'bjut-mc-theme';
  var themeColors = { light: '#f4f6f0', dark: '#07110b' };

  function storedTheme() {
    try {
      var value = localStorage.getItem(THEME_KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch (error) {
      return null;
    }
  }

  function applyTheme(theme, persist) {
    var next = theme === 'dark' ? 'dark' : 'light';
    root.dataset.theme = next;

    if (themeToggle) {
      themeToggle.setAttribute('aria-label', next === 'dark' ? '切换到浅色模式' : '切换到深色模式');
      themeToggle.setAttribute('title', next === 'dark' ? '切换到浅色模式' : '切换到深色模式');
    }

    if (themeMeta) {
      themeMeta.setAttribute('content', themeColors[next]);
    }

    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (error) {}
    }
  }

  applyTheme(root.dataset.theme === 'dark' ? 'dark' : 'light', false);

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true);
    });
  }

  if (window.matchMedia) {
    var colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
    colorScheme.addEventListener('change', function (event) {
      if (!storedTheme()) {
        applyTheme(event.matches ? 'dark' : 'light', false);
      }
    });
  }

  /* Header shadow + active navigation */

  var header = document.querySelector('[data-header]');
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('[data-nav]'));
  var sections = ['announcements', 'server-status']
    .map(function (id) { return document.getElementById(id); })
    .filter(Boolean);
  var scrollTicking = false;

  function updateScrollState() {
    var scrollTop = window.scrollY || window.pageYOffset;

    if (header) {
      header.classList.toggle('is-scrolled', scrollTop > 12);
    }

    var activeId = '';
    sections.forEach(function (section) {
      if (section.offsetTop - 160 <= scrollTop) {
        activeId = section.id;
      }
    });

    navLinks.forEach(function (link) {
      var active = link.dataset.nav === activeId;
      link.classList.toggle('is-active', active);
      if (active) {
        link.setAttribute('aria-current', 'location');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    scrollTicking = false;
  }

  function requestScrollUpdate() {
    if (!scrollTicking) {
      scrollTicking = true;
      window.requestAnimationFrame(updateScrollState);
    }
  }

  window.addEventListener('scroll', requestScrollUpdate, { passive: true });
  window.addEventListener('resize', requestScrollUpdate);
  updateScrollState();

  /* Scroll reveal */

  var revealItems = Array.prototype.slice.call(document.querySelectorAll('.reveal'));

  if (!('IntersectionObserver' in window)) {
    revealItems.forEach(function (item) { item.classList.add('is-visible'); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: '0px 0px -7% 0px',
      threshold: 0.08
    });

    revealItems.forEach(function (item) { revealObserver.observe(item); });
  }

  /* Announcement content */

  var notices = {
    launch: {
      tag: '置顶公告',
      date: '2026.10.26',
      datetime: '2026-10-26',
      title: '关于拟建设北京工业大学 Minecraft 服务器的公告',
      lead: '我们拟建设一个面向北京工业大学玩家的 Minecraft 社区服务器，版本与玩法将结合公告区的统计结果确定。',
      body: [
        '<p>各位同学，大家好。</p>',
        '<p>我们拟建设 <strong>BJUT-MC</strong>——一个面向北京工业大学玩家的 Minecraft 社区服务器。目前处于拟建设阶段，尚未开放。</p>',
        '<h3>目前的计划</h3>',
        '<ul>',
        '<li>公告由所有服务器共享，服务器状态集中展示。</li>',
        '<li>首个世界的版本与玩法，先通过公告区的两项统计了解大家的需求。</li>',
        '<li>每题最多选择 2 项，统计结果会作为后续建设依据。</li>',
        '</ul>',
        '<h3>仍在讨论</h3>',
        '<p>服务端版本、网络接入、白名单、开放时间等均未确定。确定后会通过公告板发布。</p>',
        '<div class="callout">欢迎先参与公告区的两项统计：想建怎样的服、你更想玩什么。</div>',
        '<p class="dialog-signature">BJUT-MC 项目组<br><span>2026 年 10 月 26 日</span></p>'
      ].join('')
    }
  };

  var dialog = document.getElementById('notice-dialog');
  var dialogTag = document.getElementById('dialog-tag');
  var dialogDate = document.getElementById('dialog-date');
  var dialogTitle = document.getElementById('dialog-title');
  var dialogLead = document.getElementById('dialog-lead');
  var dialogBody = document.getElementById('dialog-body');
  var dialogClose = document.getElementById('dialog-close');
  var lastTrigger = null;

  function openNotice(id, trigger) {
    var data = notices[id];
    if (!data || !dialog) return;

    lastTrigger = trigger || null;
    dialogTag.textContent = data.tag;
    dialogDate.textContent = data.date;
    dialogDate.setAttribute('datetime', data.datetime);
    dialogTitle.textContent = data.title;
    dialogLead.textContent = data.lead;
    dialogBody.innerHTML = data.body;
    dialogBody.scrollTop = 0;

    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }

    document.body.classList.add('dialog-open');
  }

  function closeNotice() {
    if (!dialog) return;
    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
      document.body.classList.remove('dialog-open');
      if (lastTrigger) lastTrigger.focus();
    }
  }

  document.querySelectorAll('[data-notice]').forEach(function (card) {
    function activate() {
      openNotice(card.dataset.notice, card);
    }

    card.addEventListener('click', activate);
    card.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });
  });

  if (dialogClose) {
    dialogClose.addEventListener('click', closeNotice);
  }

  if (dialog) {
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) {
        closeNotice();
      }
    });

    dialog.addEventListener('close', function () {
      document.body.classList.remove('dialog-open');
      if (lastTrigger) {
        lastTrigger.focus();
        lastTrigger = null;
      }
    });
  }

  /* Polls */

  var pollCards = Array.prototype.slice.call(document.querySelectorAll('[data-poll]'));

  function getPanel(card) {
    return {
      id: card.dataset.poll,
      form: card.querySelector('[data-poll-form]'),
      checkboxes: Array.prototype.slice.call(card.querySelectorAll('[data-poll-option]')),
      submit: card.querySelector('[data-poll-submit]'),
      selectedCount: card.querySelector('[data-poll-count]'),
      total: card.querySelector('[data-poll-total]'),
      feedback: card.querySelector('[data-poll-feedback]'),
      customWrap: card.querySelector('[data-custom-version-wrap]'),
      customInput: card.querySelector('[data-custom-version]'),
      customResults: card.querySelector('[data-custom-version-results]'),
      customList: card.querySelector('[data-custom-version-list]')
    };
  }

  function selectedOptions(card) {
    return getPanel(card).checkboxes
      .filter(function (input) { return input.checked; })
      .map(function (input) { return input.value; });
  }

  function setFeedback(card, message, isError) {
    var feedback = getPanel(card).feedback;
    if (!feedback) return;
    feedback.textContent = message || '';
    feedback.classList.toggle('is-error', Boolean(isError));
  }

  function syncPollUI(card) {
    var panel = getPanel(card);
    var state = card._pollState;
    var selected = selectedOptions(card);

    if (panel.selectedCount) {
      panel.selectedCount.textContent = String(selected.length);
    }

    panel.checkboxes.forEach(function (input) {
      var option = input.closest('.poll-option');
      var locked = !state.available || !state.ready || (selected.length >= 2 && !input.checked);
      input.disabled = locked;
      if (option) {
        option.classList.toggle('is-locked', locked);
      }
    });

    if (panel.customWrap) {
      panel.customWrap.hidden = selected.indexOf('other-version') === -1;
    }
    if (panel.customInput) {
      panel.customInput.disabled = !state.available || !state.ready || state.saving;
    }

    if (panel.submit) {
      if (!state.available) {
        panel.submit.textContent = '服务未连接';
        panel.submit.disabled = true;
      } else if (!state.ready) {
        panel.submit.textContent = '统计加载中';
        panel.submit.disabled = true;
      } else if (state.saving) {
        panel.submit.textContent = '提交中…';
        panel.submit.disabled = true;
      } else {
        panel.submit.textContent = state.saved.length > 0 ? '更新选择' : '提交选择';
        panel.submit.disabled = selected.length === 0;
      }
    }
  }

  function setUnavailable(card, message) {
    var state = card._pollState;
    var panel = getPanel(card);

    state.available = false;
    state.ready = false;
    state.saving = false;
    card.classList.add('is-unavailable');

    if (panel.total) {
      panel.total.textContent = '统计服务未连接';
    }
    setFeedback(card, message || '统计服务暂时不可用，请稍后再试。', true);
    syncPollUI(card);
  }

  function renderCustomVersions(panel, versions) {
    if (!panel.customResults || !panel.customList) return;

    panel.customList.textContent = '';
    if (!Array.isArray(versions) || versions.length === 0) {
      panel.customResults.hidden = true;
      return;
    }

    versions.forEach(function (version) {
      var item = document.createElement('li');
      var label = document.createElement('span');
      var count = document.createElement('b');

      item.className = 'poll-custom-item';
      label.textContent = version.label;
      count.textContent = version.count + ' 人';
      item.title = version.label + ' · ' + version.count + ' 人选择 · ' + version.percent + '%';
      item.appendChild(label);
      item.appendChild(count);
      panel.customList.appendChild(item);
    });
    panel.customResults.hidden = false;
  }

  function applyPollData(card, data, message) {
    var panel = getPanel(card);
    var state = card._pollState;
    var optionStats = {};

    data.options.forEach(function (option) {
      optionStats[option.id] = option;
    });

    state.available = true;
    state.ready = true;
    state.saving = false;
    state.saved = Array.isArray(data.myVotes) ? data.myVotes.slice() : [];
    state.data = data;
    card.classList.remove('is-unavailable');

    panel.checkboxes.forEach(function (input) {
      var option = optionStats[input.value];
      var row = input.closest('.poll-option');
      var percent = option ? option.percent : 0;
      var votes = option ? option.count : 0;

      input.checked = state.saved.indexOf(input.value) !== -1;

      if (row) {
        var percentNode = row.querySelector('[data-option-percent]');
        var votesNode = row.querySelector('[data-option-votes]');
        var barNode = row.querySelector('[data-option-bar]');
        if (percentNode) percentNode.textContent = percent + '%';
        if (votesNode) votesNode.textContent = votes + ' 票';
        if (barNode) barNode.style.width = percent + '%';
      }
    });

    if (panel.customInput) {
      panel.customInput.value = typeof data.myCustomVersion === 'string' ? data.myCustomVersion : '';
    }
    renderCustomVersions(panel, data.customVersions);

    if (panel.total) {
      panel.total.textContent = data.totalVoters > 0
        ? data.totalVoters + ' 人参与'
        : '暂无投票';
    }

    setFeedback(card, message || '', false);
    syncPollUI(card);
  }

  function loadPollData() {
    pollCards.forEach(function (card) {
      syncPollUI(card);
    });

    if (!window.fetch || window.location.protocol === 'file:') {
      pollCards.forEach(function (card) {
        setUnavailable(card, '统计服务未连接，请通过 server.js 启动页面后再参与。');
      });
      return;
    }

    fetch('/api/polls', {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    })
      .then(function (response) {
        if (!response.ok) throw new Error('统计服务返回异常');
        return response.json();
      })
      .then(function (payload) {
        pollCards.forEach(function (card) {
          var data = payload.polls && payload.polls[card.dataset.poll];
          if (data) {
            applyPollData(card, data);
          } else {
            setUnavailable(card, '未找到这项统计。');
          }
        });
      })
      .catch(function () {
        pollCards.forEach(function (card) {
          setUnavailable(card, '统计服务暂时不可用，请稍后再试。');
        });
      });
  }

  pollCards.forEach(function (card) {
    var panel = getPanel(card);

    card._pollState = {
      available: true,
      ready: false,
      saving: false,
      saved: [],
      data: null
    };

    panel.checkboxes.forEach(function (input) {
      input.addEventListener('change', function () {
        var selected = selectedOptions(card);
        if (selected.length > 2) {
          input.checked = false;
          setFeedback(card, '每题最多选择 2 项。', true);
        } else if (card._pollState.saving) {
          setFeedback(card, '正在提交，请稍候。', true);
        } else {
          setFeedback(card, '', false);
        }
        syncPollUI(card);
      });
    });

    Array.prototype.slice.call(card.querySelectorAll('.poll-option__link')).forEach(function (link) {
      link.addEventListener('click', function (event) {
        event.stopPropagation();
      });
    });

    if (panel.customInput) {
      panel.customInput.addEventListener('input', function () {
        if (!card._pollState.saving) {
          setFeedback(card, '', false);
        }
      });
    }

    if (panel.form) {
      panel.form.addEventListener('submit', function (event) {
        event.preventDefault();
        var state = card._pollState;
        var selected = selectedOptions(card);
        var otherSelected = selected.indexOf('other-version') !== -1;
        var customVersion = '';

        if (!state.available || !state.ready || state.saving) return;
        if (selected.length < 1 || selected.length > 2) {
          setFeedback(card, '请选择 1 至 2 项。', true);
          return;
        }

        if (panel.customInput && otherSelected) {
          customVersion = panel.customInput.value
            .replace(/\s+/g, ' ')
            .trim();

          if (!customVersion) {
            setFeedback(card, '选择“其它版本”后，请填写版本名称。', true);
            panel.customInput.focus();
            return;
          }
          if (Array.from(customVersion).length > 32) {
            setFeedback(card, '版本名称不能超过 32 个字符。', true);
            panel.customInput.focus();
            return;
          }
        }

        var requestBody = { options: selected };
        if (customVersion) requestBody.customVersion = customVersion;

        state.saving = true;
        setFeedback(card, '', false);
        syncPollUI(card);

        fetch('/api/polls/' + encodeURIComponent(card.dataset.poll) + '/vote', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify(requestBody)
        })
          .then(function (response) {
            return response.json().then(function (payload) {
              if (!response.ok) {
                throw new Error(payload.error || '提交失败，请稍后再试。');
              }
              return payload;
            });
          })
          .then(function (payload) {
            applyPollData(card, payload.poll, '已记录，感谢参与。');
          })
          .catch(function (error) {
            state.saving = false;
            setFeedback(card, error.message || '提交失败，请稍后再试。', true);
            syncPollUI(card);
          });
      });
    }

    syncPollUI(card);
  });

  loadPollData();
})();
