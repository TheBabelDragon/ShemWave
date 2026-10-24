/**
 * YAML loading, validation, and triplet selection.
 * Order and duplicates are preserved exactly.
 */

import { validateTripletLetters, gematria, tripletToWaveParams } from './gematria.js';

export class TripletStore {
  constructor() {
    this.triplets = [];
    this.version = null;
    this.errors = [];
    this.selectedIndex = 0;
  }

  /**
   * @param {object} data parsed YAML root
   */
  load(data) {
    this.errors = [];
    if (!data || typeof data !== 'object') {
      this.errors.push('triplets root is not an object');
      return false;
    }
    this.version = data.version ?? null;
    const list = data.triplets;
    if (!Array.isArray(list)) {
      this.errors.push('triplets must be an array');
      return false;
    }
    const out = [];
    list.forEach((entry, i) => {
      if (!entry || typeof entry !== 'object') {
        this.errors.push(`entry ${i}: not an object`);
        return;
      }
      const letters = entry.letters ?? entry.display;
      const v = validateTripletLetters(letters);
      if (!v.ok) {
        this.errors.push(`entry ${i} (${entry.id ?? '?'}): ${v.error}`);
        return;
      }
      out.push({
        id: entry.id ?? `t${String(i).padStart(3, '0')}`,
        letters,
        display: entry.display ?? letters,
        source_index: entry.source_index ?? i,
        notes: entry.notes ?? null,
        gematria: gematria(letters),
      });
    });
    this.triplets = out;
    if (this.selectedIndex >= out.length) this.selectedIndex = 0;
    return this.errors.length === 0;
  }

  get length() {
    return this.triplets.length;
  }

  get selected() {
    return this.triplets[this.selectedIndex] ?? null;
  }

  select(index) {
    if (index < 0 || index >= this.triplets.length) return null;
    this.selectedIndex = index;
    return this.selected;
  }

  selectById(id) {
    const i = this.triplets.findIndex((t) => t.id === id);
    return i >= 0 ? this.select(i) : null;
  }

  waveParams(mapping) {
    const t = this.selected;
    if (!t) return null;
    return tripletToWaveParams(t.letters, mapping);
  }
}
