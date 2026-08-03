import { html, raw, Html } from '../lib/html';

/**
 * Dismissible coach marks.
 *
 * Dismissal is stored per device in localStorage rather than in the database:
 * these are learning aids, not preferences, and seeing them once on the phone
 * and once on the desktop is the right behaviour. A snippet in the page head
 * hides already-dismissed tips before first paint so they never flash.
 */

export const TIP_STORAGE_KEY = 'pd_tips_dismissed';

/** Runs in <head>, before paint, so dismissed tips are never visible. */
export const tipHideScript = raw(`<script>
(function(){try{
  var d=JSON.parse(localStorage.getItem('${TIP_STORAGE_KEY}')||'[]');
  if(!d.length)return;
  var s=document.createElement('style');
  s.textContent=d.map(function(k){return '[data-tip="'+k+'"]{display:none!important}'}).join('');
  document.head.appendChild(s);
}catch(e){}})();
</script>`);

export interface TipOpts {
  /** Stable id — changing it re-shows the tip to everyone. */
  key: string;
  title: string;
  /** Keep to two or three sentences. Longer belongs in the guide. */
  body: Html;
  /** Adds a "How this works" link through to the guide. */
  guide?: boolean;
}

export function tip({ key, title, body, guide = true }: TipOpts): Html {
  return html`
    <aside class="tip" data-tip="${key}">
      <div class="tip-head">
        <span class="tip-label">Getting started</span>
        <button
          class="tip-x"
          type="button"
          data-tip-dismiss="${key}"
          aria-label="Dismiss this tip"
        >
          ✕
        </button>
      </div>
      <p class="tip-title">${title}</p>
      <div class="tip-body">${body}</div>
      ${guide ? html`<a class="tip-more" href="/guide">How the whole thing works →</a>` : raw('')}
    </aside>
  `;
}
