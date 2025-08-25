/**
 * Shared HTML injection utilities for SSR/CSR/HMR.
 * Centralizes how we augment SSR HTML for client runtime and live reload.
 */

export interface HmrOptions {
  enabled: boolean;
  /** EventSource endpoint path (default: "/_hipst/hmr") */
  eventPath?: string;
}

export interface CsrOptions {
  /** Module script src URL to load client runtime/entry */
  scriptSrc: string;
  /** Optional CSS href to include as <link rel="stylesheet"> */
  cssHref?: string;
}

export interface InjectOptions {
  csr?: CsrOptions;
  hmr?: HmrOptions;
}

/**
 * Injects CSR and/or HMR tags into given HTML.
 * - Adds link/script into head/body as needed.
 * - Always preserves SSR content by wrapping it in the mount container and appending the client script.
 */
export function injectHtmlAssets(htmlIn: string, opts: InjectOptions): string {
  let html = htmlIn;

  // Build head additions first (HMR + optional CSS)
  const headParts: string[] = [];
  if (opts.hmr?.enabled) {
    const ep = opts.hmr.eventPath || "/_hipst/hmr";
    // Minimal SSE reload client. Keep try/catch to avoid breaking prod.
    headParts.push(
      `<script>try{const es=new EventSource(${JSON.stringify(ep)});es.onmessage=(e)=>{if(e.data==="reload"){location.reload();}}}catch{}</script>`
    );
  }
  if (opts.csr?.cssHref) {
    headParts.push(`<link rel="stylesheet" href="${escapeHtmlAttr(opts.csr.cssHref)}">`);
  }
  if (headParts.length > 0) {
    html = html.replace(/<head(\s*[^>]*)>/i, (m) => m + headParts.join(""));
  }

  // CSR body injection
  if (opts.csr) {
    const scriptTag = `<script type="module" src="${escapeHtmlAttr(opts.csr.scriptSrc)}"></script>`;
    // Wrap existing SSR content within mount container then append script before </body>
    html = html.replace(/<body(\s*[^>]*)>/i, (m) => m + '<div id="__hipst_app__">');
    html = html.replace(/<\/body>/i, `</div>${scriptTag}</body>`);
  }

  return html;
}

function escapeHtmlAttr(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
