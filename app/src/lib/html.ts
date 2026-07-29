/** Minimal HTML templating. Interpolations are escaped unless wrapped in raw(). */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

class Raw {
  constructor(readonly value: string) {}
  toString() {
    return this.value;
  }
}

export function raw(value: string): Raw {
  return new Raw(value);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): Raw {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v instanceof Raw) out += v.value;
    else if (Array.isArray(v)) out += v.map((x) => (x instanceof Raw ? x.value : escapeHtml(x))).join('');
    else out += escapeHtml(v);
    out += strings[i + 1];
  }
  return new Raw(out);
}

export type Html = Raw;

/** Renders `when` only if the condition holds — keeps templates flat. */
export function when(cond: unknown, node: Raw | string): Raw {
  if (!cond) return raw('');
  return node instanceof Raw ? node : raw(escapeHtml(node));
}
