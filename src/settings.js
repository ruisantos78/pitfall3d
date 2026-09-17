// User settings and persistent preferences (localStorage)
export const SETTINGS_STORAGE_KEY = 'pitfall3d-settings';

export class SettingsManager {
  constructor(storageKey = SETTINGS_STORAGE_KEY) {
    this.storageKey = storageKey;
    this.lang = 'pt';
    this.showHelp = false;
    this.highScore = 0;
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.lang === 'pt' || saved.lang === 'en') this.lang = saved.lang;
        if (typeof saved.showHelp === 'boolean') this.showHelp = saved.showHelp;
        if (Number.isFinite(saved.highScore) && saved.highScore > 0) {
          this.highScore = Math.floor(saved.highScore);
        }
      }
    } catch {
      // localStorage unavailable: fall back to defaults
    }
  }

  persist() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({
        lang: this.lang,
        showHelp: this.showHelp,
        highScore: this.highScore,
      }));
    } catch {
      // Silently ignore storage errors (private mode, quota exceeded, etc.)
    }
  }

  getLanguage() {
    return this.lang;
  }

  setLanguage(next) {
    if (next !== 'pt' && next !== 'en') return;
    this.lang = next;
    this.persist();
    this.notify('language', this.lang);
  }

  getShowHelp() {
    return this.showHelp;
  }

  setShowHelp(next) {
    this.showHelp = !!next;
    this.persist();
    this.notify('showHelp', this.showHelp);
  }

  getHighScore() {
    return this.highScore;
  }

  submitScore(score) {
    const value = Math.floor(score);
    if (value > this.highScore) {
      this.highScore = value;
      this.persist();
      this.notify('highScore', this.highScore);
      return true;
    }
    return false;
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify(key, value) {
    for (const listener of this.listeners) {
      try {
        listener(key, value, this);
      } catch (err) {
        console.error('Settings listener error:', err);
      }
    }
  }
}

// Global settings singleton instance
export const settings = new SettingsManager();

export const getLanguage = () => settings.getLanguage();
export const setLanguage = (next) => settings.setLanguage(next);
export const getShowHelp = () => settings.getShowHelp();
export const setShowHelp = (next) => settings.setShowHelp(next);
export const getHighScore = () => settings.getHighScore();
export const submitScore = (score) => settings.submitScore(score);
