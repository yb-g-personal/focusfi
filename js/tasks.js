/**
 * tasks.js — Simple to-do list with localStorage persistence
 */
export class TaskList {
  /** @param {string} storageKey */
  constructor(storageKey = 'focusfi-tasks') {
    this.key   = storageKey;
    this.items = this._load();
  }

  // ── Mutation ─────────────────────────────────────────────

  /**
   * Add a new task.
   * @param {string} text
   * @returns {object} the new task object
   */
  add(text) {
    const task = { id: Date.now(), text: text.trim(), done: false };
    this.items.push(task);
    this._save();
    return task;
  }

  /**
   * Toggle the done state of a task.
   * @param {number} id
   */
  toggle(id) {
    const task = this.items.find((t) => t.id === id);
    if (task) { task.done = !task.done; this._save(); }
  }

  /**
   * Remove a task by id.
   * @param {number} id
   */
  remove(id) {
    this.items = this.items.filter((t) => t.id !== id);
    this._save();
  }

  // ── Queries ──────────────────────────────────────────────

  /** @returns {{ done: number, total: number }} */
  get progress() {
    return {
      done:  this.items.filter((t) => t.done).length,
      total: this.items.length,
    };
  }

  // ── Storage ──────────────────────────────────────────────

  _load() {
    try { return JSON.parse(localStorage.getItem(this.key)) || []; }
    catch { return []; }
  }

  _save() {
    localStorage.setItem(this.key, JSON.stringify(this.items));
  }
}
