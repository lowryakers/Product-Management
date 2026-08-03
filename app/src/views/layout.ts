import { html, raw, Html } from '../lib/html';
import { tipHideScript } from './tips';

export type NavKey = 'capture' | 'triage' | 'catalog' | 'pos' | 'guide' | 'more' | 'none';

interface LayoutOpts {
  title: string;
  nav?: NavKey;
  user?: { name: string; role: string } | null;
  /** Suppresses the bottom tab bar (login, approval pages). */
  bare?: boolean;
  head?: Html;
}

const NAV: Array<{ key: NavKey; href: string; label: string; icon: Html }> = [
  {
    key: 'capture',
    href: '/capture',
    label: 'Capture',
    icon: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'),
  },
  {
    key: 'triage',
    href: '/inbox',
    label: 'Inbox',
    icon: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13h5l2 3h4l2-3h5"/><path d="M4 6h16v12H4z"/></svg>'),
  },
  {
    key: 'catalog',
    href: '/products',
    label: 'SKUs',
    icon: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7l8-4 8 4v10l-8 4-8-4z"/><path d="M4 7l8 4 8-4M12 11v10"/></svg>'),
  },
  {
    key: 'pos',
    href: '/pos',
    label: 'Orders',
    icon: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l1 5H5zM5 8h14v13H5z"/><path d="M9 12h6"/></svg>'),
  },
  {
    key: 'guide',
    href: '/guide',
    label: 'Guide',
    icon: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4z"/><path d="M20 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7z"/></svg>'),
  },
];

export function layout(opts: LayoutOpts, body: Html): string {
  const { title, nav = 'none', user = null, bare = false } = opts;

  return `<!doctype html>
<html lang="en" data-theme-auto>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#FCFBF9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#16130F" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="ProDough">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/icon-180.png">
<link rel="icon" href="/icons/icon-192.png">
<link rel="stylesheet" href="/app.css">
<title>${escapeTitle(title)}</title>
${tipHideScript.value}
${opts.head ? opts.head.value : ''}
</head>
<body${bare ? ' class="bare"' : ''}>
${bare ? '' : topbar(user, title).value}
<main class="${bare ? 'main-bare' : 'main'}">
${body.value}
</main>
${bare ? '' : tabbar(nav).value}
<script src="/app.js" defer></script>
</body>
</html>`;
}

function escapeTitle(t: string) {
  return t.replace(/[<>&]/g, '');
}

function topbar(user: { name: string; role: string } | null, title: string): Html {
  return html`
    <header class="topbar">
      <span class="topbar-title">${title}</span>
      ${user
        ? html`<a class="topbar-user" href="/account" title="${user.name}"
            >${initials(user.name)}</a
          >`
        : raw('')}
    </header>
  `;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] || '')
    .join('')
    .toUpperCase();
}

function tabbar(active: NavKey): Html {
  return html`
    <nav class="tabbar" aria-label="Main">
      ${NAV.map(
        (n) => html`
          <a
            class="tab${n.key === active ? ' is-active' : ''}"
            href="${n.href}"
            ${n.key === active ? raw('aria-current="page"') : raw('')}
          >
            <span class="tab-icon">${n.icon}</span>
            <span class="tab-label">${n.label}</span>
          </a>
        `,
      )}
    </nav>
  `;
}

/** Full-page state for empty lists — used instead of a bare "no results". */
export function emptyState(headline: string, detail: string, action?: Html): Html {
  return html`
    <div class="empty">
      <p class="empty-h">${headline}</p>
      <p class="empty-d">${detail}</p>
      ${action ?? raw('')}
    </div>
  `;
}

export function flash(kind: 'ok' | 'warn' | 'err', message: string): Html {
  return html`<p class="flash flash-${kind}" role="status">${message}</p>`;
}
