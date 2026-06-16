/**
 * Custom dialog module — replaces native window.alert / window.confirm.
 *
 * Native browser dialogs ignore the page theme (always light, always
 * system fonts) and break the M3 visual language. This module renders
 * dialogs using the same M3 token set as the rest of the app, so they
 * theme automatically in both light and dark mode.
 *
 * API:
 *   Xdialog.alert(message, opts?)        -> Promise<void>
 *   Xdialog.confirm(message, opts?)      -> Promise<boolean>
 *
 * opts = {
 *   title?: string,            // default: "Hinweis" (alert) / "Bestätigen" (confirm)
 *   okLabel?: string,          // default: "OK"
 *   cancelLabel?: string,      // default: "Abbrechen"
 *   destructive?: boolean,     // styles primary button red, focuses cancel
 * }
 *
 * Keyboard: Esc = cancel/close, Enter = primary action.
 * Backdrop click = cancel/close.
 */
(function (global) {
  'use strict';

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---- scroll-lock stack ----
     Multiple modals can stack (e.g. settings overlay opens a confirm).
     Only release the body lock when the LAST modal closes — otherwise
     the parent modal would suddenly become scrollable. */
  let lockCount = 0;
  let savedScroll = 0;
  function pushScrollLock() {
    if (lockCount === 0) {
      savedScroll = window.scrollY;
      document.body.classList.add('scroll-locked');
    }
    lockCount++;
  }
  function popScrollLock() {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.body.classList.remove('scroll-locked');
      // Don't animate — the user's eye is on the modal that just closed.
      window.scrollTo({ top: savedScroll, behavior: 'instant' });
    }
  }

  /* ---- focus trap ----
     Tab and Shift+Tab cycle through the modal's focusables; nothing
     escapes back to the page underneath while the modal is open. */
  const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type=hidden])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  function trapFocus(container, e) {
    if (e.key !== 'Tab') return;
    const items = container.querySelectorAll(FOCUSABLE);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function show(kind, message, opts) {
    opts = opts || {};
    const isConfirm = kind === 'confirm';
    const title = opts.title || (isConfirm ? 'Bestätigen' : 'Hinweis');
    const okLabel = opts.okLabel || 'OK';
    const cancelLabel = opts.cancelLabel || 'Abbrechen';
    const destructive = !!opts.destructive;

    return new Promise((resolve) => {
      const overlay = el('div', 'overlay xdialog-overlay');
      const card = el('div', 'xdialog-card');
      card.setAttribute('role', 'alertdialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-labelledby', 'xdialog-title');
      card.setAttribute('aria-describedby', 'xdialog-message');

      const titleEl = el('h3', 'xdialog-title');
      titleEl.id = 'xdialog-title';
      titleEl.textContent = title;

      const messageEl = el('p', 'xdialog-message');
      messageEl.id = 'xdialog-message';
      // Honour explicit newlines in the message
      const lines = String(message).split('\n');
      lines.forEach((line, i) => {
        if (i > 0) messageEl.appendChild(document.createElement('br'));
        messageEl.appendChild(document.createTextNode(line));
      });

      const actions = el('div', 'xdialog-actions');
      let cancelBtn = null;
      if (isConfirm) {
        cancelBtn = el('button', 'btn xdialog-btn-cancel');
        cancelBtn.type = 'button';
        cancelBtn.textContent = cancelLabel;
        actions.appendChild(cancelBtn);
      }
      const okBtn = el('button', 'btn ' + (destructive ? 'btn-danger' : 'primary') + ' xdialog-btn-ok');
      okBtn.type = 'button';
      okBtn.textContent = okLabel;
      actions.appendChild(okBtn);

      card.appendChild(titleEl);
      card.appendChild(messageEl);
      card.appendChild(actions);
      overlay.appendChild(card);
      document.body.appendChild(overlay);

      const prevFocus = document.activeElement;
      let keyHandler;
      pushScrollLock();

      function cleanup() {
        document.removeEventListener('keydown', keyHandler, true);
        overlay.classList.remove('show');
        popScrollLock();
        // Match the scale-out transition before removing from DOM
        setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 220);
        try { if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true }); } catch (e) {}
      }

      function accept() { cleanup(); resolve(isConfirm ? true : undefined); }
      function decline() { cleanup(); resolve(isConfirm ? false : undefined); }

      okBtn.addEventListener('click', accept);
      if (cancelBtn) cancelBtn.addEventListener('click', decline);
      // Backdrop click cancels (or closes, for alert)
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) decline();
      });

      keyHandler = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          decline();
          return;
        }
        if (e.key === 'Enter') {
          // Only treat as confirmation if the focused element isn't the
          // cancel button (so the user can still Enter on cancel to cancel).
          if (document.activeElement === cancelBtn) return;
          e.preventDefault();
          accept();
          return;
        }
        trapFocus(card, e);
      };
      document.addEventListener('keydown', keyHandler, true);

      // Trigger the transition on the next frame so it actually animates
      requestAnimationFrame(() => {
        overlay.classList.add('show');
        // For destructive confirm, focus cancel by default so accidental
        // Enter does not commit the destructive action.
        const initial = destructive && cancelBtn ? cancelBtn : okBtn;
        try { initial.focus({ preventScroll: true }); } catch (e) {}
      });
    });
  }

  /**
   * Custom-content variant. Renders a card with the given title and
   * arbitrary body DOM. Caller controls actions completely.
   *
   * opts = {
   *   title:    string,
   *   body:     HTMLElement,    // appended verbatim into the card
   *   onClose?: () => void,     // called when dialog closes via any path
   *   closeLabel?: string,      // default 'Schließen' — primary close button
   * }
   *
   * Returns a control object: { close() }.
   */
  function showCustom(opts) {
    opts = opts || {};
    const title = opts.title || '';
    const closeLabel = opts.closeLabel || 'Schließen';

    const overlay = el('div', 'overlay xdialog-overlay');
    const card = el('div', 'xdialog-card xdialog-card-custom');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'xdialog-title');

    const titleEl = el('h3', 'xdialog-title');
    titleEl.id = 'xdialog-title';
    titleEl.textContent = title;

    card.appendChild(titleEl);
    if (opts.body) card.appendChild(opts.body);

    const actions = el('div', 'xdialog-actions');
    const okBtn = el('button', 'btn primary xdialog-btn-ok');
    okBtn.type = 'button';
    okBtn.textContent = closeLabel;
    actions.appendChild(okBtn);
    card.appendChild(actions);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const prevFocus = document.activeElement;
    let keyHandler;
    let closed = false;
    pushScrollLock();

    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', keyHandler, true);
      overlay.classList.remove('show');
      popScrollLock();
      setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 220);
      try { if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true }); } catch (e) {}
      if (typeof opts.onClose === 'function') opts.onClose();
    }

    okBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    keyHandler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Enter' && document.activeElement === okBtn) { e.preventDefault(); close(); return; }
      trapFocus(card, e);
    };
    document.addEventListener('keydown', keyHandler, true);

    requestAnimationFrame(() => {
      overlay.classList.add('show');
      try { okBtn.focus({ preventScroll: true }); } catch (e) {}
    });

    return { close };
  }

  global.Xdialog = {
    alert: (message, opts) => show('alert', message, opts),
    confirm: (message, opts) => show('confirm', message, opts),
    show: showCustom,
  };
})(typeof window !== 'undefined' ? window : globalThis);
