/**
 * notes.js — Lightweight persistent notepad
 */
export class Notes {
  /** @param {string} storageKey */
  constructor(storageKey = 'focusfi-notes') {
    this.key = storageKey;
  }

  /** Load saved text (empty string if nothing saved). */
  load() {
    return localStorage.getItem(this.key) || '';
  }

  /** Persist the current text. */
  save(text) {
    localStorage.setItem(this.key, text);
  }

  /** Remove saved notes. */
  clear() {
    localStorage.removeItem(this.key);
  }
}
