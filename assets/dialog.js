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

      function cleanup() {
        document.removeEventListener('keydown', keyHandler, true);
        overlay.classList.remove('show');
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
        } else if (e.key === 'Enter') {
          // Only treat as confirmation if the focused element isn't the
          // cancel button (so the user can still Enter on cancel to cancel).
          if (document.activeElement === cancelBtn) return;
          e.preventDefault();
          accept();
        }
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

  global.Xdialog = {
    alert: (message, opts) => show('alert', message, opts),
    confirm: (message, opts) => show('confirm', message, opts),
  };
})(typeof window !== 'undefined' ? window : globalThis);
