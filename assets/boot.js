/**
 * Pre-paint boot script.
 *
 * Two settings that must land BEFORE the rest of the app initialises:
 *   1. `html.js` — progressive-enhancement marker. CSS rules gated on it
 *      (e.g. `.js-only` visibility) need it before first paint, otherwise
 *      no-JS-shaped layouts flash for a frame.
 *   2. `history.scrollRestoration = 'manual'` — turn off the browser's
 *      automatic scroll restoration on history navigation. Our hash-routed
 *      SPA does its own per-view scroll memory; the browser otherwise
 *      tries to restore the OLD position during the View Transition,
 *      which looks like a hard scroll jump immediately after the
 *      animation completes.
 *
 * Lives as an external file (not inline) because the deployed CSP has
 * `script-src 'self'` and no `unsafe-inline`/hash.
 */
document.documentElement.classList.add('js');
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
