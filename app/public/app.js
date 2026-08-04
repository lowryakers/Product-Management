/* ProDough PM — client shell.
   Three jobs: keep capture working with no signal, keep the draft alive,
   and manage push subscription. Nothing else. */

(function () {
  'use strict';

  var QUEUE_KEY = 'pd_capture_queue';
  var DRAFT_KEY = 'pd_capture_draft';

  // ------------------------------------------------------ service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function (e) {
        console.warn('sw registration failed', e);
      });
    });
  }

  // -------------------------------------------------------- offline state
  function setOnlineState() {
    document.body.classList.toggle('is-offline', !navigator.onLine);
  }
  window.addEventListener('online', function () {
    setOnlineState();
    flushQueue();
  });
  window.addEventListener('offline', setOnlineState);
  setOnlineState();

  // ------------------------------------------------------- capture queue
  function readQueue() {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function writeQueue(q) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    } catch (e) {
      /* storage full — nothing useful to do */
    }
  }

  function enqueue(entry) {
    var q = readQueue();
    q.push(entry);
    writeQueue(q);
    renderPending();
  }

  function flushQueue() {
    var q = readQueue();
    if (!q.length) return Promise.resolve();

    return q
      .reduce(function (chain, entry) {
        return chain.then(function (remaining) {
          return fetch('/api/capture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(entry),
          })
            .then(function (res) {
              // 401 means the session lapsed — keep it queued for next sign-in.
              if (res.ok || res.status === 400) return remaining;
              return remaining.concat([entry]);
            })
            .catch(function () {
              return remaining.concat([entry]);
            });
        });
      }, Promise.resolve([]))
      .then(function (remaining) {
        writeQueue(remaining);
        renderPending();
      });
  }

  function renderPending() {
    var n = readQueue().length;
    var el = document.querySelector('[data-pending-count]');
    if (!el) return;
    el.textContent = n ? n + ' capture' + (n === 1 ? '' : 's') + ' waiting to sync' : '';
  }

  // -------------------------------------------------------- capture form
  var form = document.getElementById('capture-form');
  if (form) {
    var note = form.querySelector('#rawNote');

    // Keep the draft so a reload or crash never loses what was dictated.
    if (note) {
      var saved = localStorage.getItem(DRAFT_KEY);
      if (saved && !note.value) note.value = saved;
      note.addEventListener('input', function () {
        localStorage.setItem(DRAFT_KEY, note.value);
      });
    }

    form.addEventListener('submit', function (ev) {
      if (navigator.onLine) {
        localStorage.removeItem(DRAFT_KEY);
        return; // let the normal POST happen
      }

      ev.preventDefault();
      var data = new FormData(form);
      var entry = {
        clientId:
          (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
          String(Date.now()) + Math.random().toString(16).slice(2),
        rawNote: (data.get('rawNote') || '').toString(),
        area: (data.get('area') || 'OTHER').toString(),
        channel: (data.get('channel') || 'TEXT').toString(),
        sourceContactId: (data.get('sourceContactId') || '').toString(),
      };
      if (!entry.rawNote.trim()) return;

      enqueue(entry);
      localStorage.removeItem(DRAFT_KEY);
      form.reset();

      var msg = document.createElement('p');
      msg.className = 'flash flash-warn';
      msg.setAttribute('role', 'status');
      msg.textContent = 'No signal — saved on this phone. It syncs when you are back online.';
      form.parentNode.insertBefore(msg, form);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  renderPending();
  if (navigator.onLine) flushQueue();

  // ------------------------------------------------------------- tips
  var TIPS_KEY = 'pd_tips_dismissed';

  function dismissedTips() {
    try {
      return JSON.parse(localStorage.getItem(TIPS_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest && ev.target.closest('[data-tip-dismiss]');
    if (!btn) return;
    var key = btn.getAttribute('data-tip-dismiss');
    var list = dismissedTips();
    if (list.indexOf(key) === -1) list.push(key);
    try {
      localStorage.setItem(TIPS_KEY, JSON.stringify(list));
    } catch (e) {
      /* private mode — the tip just reappears next visit */
    }
    var card = document.querySelector('[data-tip="' + key + '"]');
    if (card) card.remove();
  });

  var resetTips = document.querySelector('[data-tips-reset]');
  if (resetTips) {
    resetTips.addEventListener('click', function () {
      try {
        localStorage.removeItem(TIPS_KEY);
      } catch (e) {}
      resetTips.textContent = 'Tips will show again';
      resetTips.disabled = true;
    });
  }

  // ------------------------------------------------------- copy to clipboard
  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest && ev.target.closest('[data-copy]');
    if (!btn) return;
    var text = btn.getAttribute('data-copy');
    var done = function () {
      var was = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function () {
        btn.textContent = was;
      }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        window.prompt('Copy this link', text);
      });
    } else {
      // Older iOS Safari in standalone mode has no clipboard API.
      window.prompt('Copy this link', text);
    }
  });

  // ------------------------------------------------------ password reveal
  var reveal = document.querySelector('[data-reveal-pw]');
  if (reveal) {
    reveal.addEventListener('change', function () {
      var form = document.getElementById('pw-form');
      if (!form) return;
      var type = reveal.checked ? 'text' : 'password';
      ['current', 'next'].forEach(function (id) {
        var el = form.querySelector('#' + id);
        if (el) el.type = type;
      });
    });
  }

  // ---------------------------------------------------------------- push
  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = atob(base64);
    var out = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
    return out;
  }

  function status(text) {
    var el = document.querySelector('[data-push-status]');
    if (el) el.textContent = text;
  }

  var enableBtn = document.querySelector('[data-push-enable]');
  if (enableBtn) {
    enableBtn.addEventListener('click', function () {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        status('This browser cannot do push. On iPhone, add the app to your home screen first.');
        return;
      }
      status('Asking for permission…');

      Notification.requestPermission()
        .then(function (perm) {
          if (perm !== 'granted') {
            status('Permission denied. Enable it in Settings → Notifications → ProDough.');
            return null;
          }
          return fetch('/api/push/key', { credentials: 'same-origin' }).then(function (r) {
            return r.json();
          });
        })
        .then(function (cfg) {
          if (!cfg) return null;
          if (!cfg.enabled) {
            status('Push keys are not configured on the server yet.');
            return null;
          }
          return navigator.serviceWorker.ready.then(function (reg) {
            return reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(cfg.key),
            });
          });
        })
        .then(function (sub) {
          if (!sub) return null;
          return fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(sub.toJSON()),
          });
        })
        .then(function (res) {
          if (res && res.ok) status('Enabled on this device.');
        })
        .catch(function (e) {
          status('Could not enable: ' + e.message);
        });
    });
  }

  var testBtn = document.querySelector('[data-push-test]');
  if (testBtn) {
    testBtn.addEventListener('click', function () {
      status('Sending…');
      fetch('/api/push/test', { method: 'POST', credentials: 'same-origin' })
        .then(function (r) {
          return r.json();
        })
        .then(function (j) {
          status(j.sent ? 'Sent to ' + j.sent + ' device(s).' : 'No subscribed devices yet.');
        })
        .catch(function (e) {
          status('Failed: ' + e.message);
        });
    });
  }
})();
