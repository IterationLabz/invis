// FocusManager.js - Overlay focus management
// Intelligent focus management to prevent detection

const { app, BrowserWindow } = require('electron');
const { EventEmitter } = require('events');

class FocusManager extends EventEmitter {
    constructor(config = {}) {
        super();

        this.window = null;
        this.config = {
            preventFocusSteal: true,
            allowUserFocus: false,
            focusTimeout: 50,
            restorePreviousFocus: true,
            debugMode: false,
            ...config
        };

        this.state = {
            isManaging: false,
            lastFocusedWindow: null,
            focusHistory: [],
            preventionActive: false
        };

        this.focusTimer = null;
        this.blurTimer = null;

        this.setupGlobalListeners();
    }

    setupGlobalListeners() {
        app.on('browser-window-focus', (event, window) => {
            this.handleGlobalFocus(window);
        });

        app.on('browser-window-blur', (event, window) => {
            this.handleGlobalBlur(window);
        });
    }

    handleGlobalFocus(window) {
        if (this.config.debugMode) {
            console.log('FocusManager: Window focused:', window.getTitle());
        }

        this.updateFocusHistory(window);

        if (window === this.window && this.state.preventionActive) {
            this.handleOverlayFocus();
        } else if (window !== this.window && this.state.isManaging) {
            this.state.lastFocusedWindow = window;
        }
    }

    handleGlobalBlur(window) {
        if (this.config.debugMode) {
            console.log('FocusManager: Window blurred:', window.getTitle());
        }
    }

    updateFocusHistory(window) {
        const now = Date.now();
        this.state.focusHistory.push({ window, timestamp: now });
        this.state.focusHistory = this.state.focusHistory
            .filter(entry => now - entry.timestamp < 30000)
            .slice(-10);
    }

    handleOverlayFocus() {
        if (!this.window || this.window.isDestroyed() || !this.config.preventFocusSteal) {
            return;
        }

        if (this.blurTimer) {
            clearTimeout(this.blurTimer);
        }

        this.blurTimer = setTimeout(() => {
            if (this.window && !this.window.isDestroyed() && this.window.isFocused()) {
                this.window.blur();

                if (this.config.restorePreviousFocus && this.state.lastFocusedWindow) {
                    try {
                        if (!this.state.lastFocusedWindow.isDestroyed()) {
                            this.state.lastFocusedWindow.focus();
                        }
                    } catch (error) {
                        if (this.config.debugMode) {
                            console.warn('Failed to restore focus:', error);
                        }
                    }
                }

                this.emit('focusPrevented', {
                    timestamp: Date.now(),
                    restoredTo: this.state.lastFocusedWindow?.getTitle() || 'unknown'
                });
            }
        }, this.config.focusTimeout);
    }

    setWindow(window) {
        if (this.window && !this.window.isDestroyed()) {
            this.stopManaging();
        }

        this.window = window;
        this.setupWindowListeners();
    }

    setupWindowListeners() {
        if (!this.window) return;

        this.window.on('focus', () => {
            this.emit('windowFocused');
        });

        this.window.on('blur', () => {
            this.emit('windowBlurred');
        });

        this.window.on('closed', () => {
            this.stopManaging();
            this.window = null;
        });
    }

    startManaging() {
        if (this.state.isManaging) return;

        this.state.isManaging = true;
        this.state.preventionActive = this.config.preventFocusSteal;

        this.emit('managingStarted');

        if (this.config.debugMode) {
            console.log('FocusManager: Started managing focus');
        }
    }

    stopManaging() {
        if (!this.state.isManaging) return;

        this.state.isManaging = false;
        this.state.preventionActive = false;

        if (this.focusTimer) {
            clearTimeout(this.focusTimer);
            this.focusTimer = null;
        }

        if (this.blurTimer) {
            clearTimeout(this.blurTimer);
            this.blurTimer = null;
        }

        this.emit('managingStopped');

        if (this.config.debugMode) {
            console.log('FocusManager: Stopped managing focus');
        }
    }

    enableFocusPrevention() {
        this.state.preventionActive = true;
        this.emit('focusPreventionEnabled');
    }

    disableFocusPrevention() {
        this.state.preventionActive = false;

        if (this.blurTimer) {
            clearTimeout(this.blurTimer);
            this.blurTimer = null;
        }

        this.emit('focusPreventionDisabled');
    }

    allowTemporaryFocus(duration = 5000) {
        if (!this.state.preventionActive) return;

        this.disableFocusPrevention();

        setTimeout(() => {
            if (this.state.isManaging) {
                this.enableFocusPrevention();
            }
        }, duration);

        this.emit('temporaryFocusAllowed', { duration });
    }

    async focusWindow() {
        if (!this.window || this.window.isDestroyed()) {
            return false;
        }

        const wasPreventionActive = this.state.preventionActive;
        if (wasPreventionActive) {
            this.disableFocusPrevention();
        }

        try {
            this.window.focus();

            if (wasPreventionActive) {
                setTimeout(() => {
                    if (this.state.isManaging) {
                        this.enableFocusPrevention();
                    }
                }, 1000);
            }

            return true;
        } catch (error) {
            if (wasPreventionActive && this.state.isManaging) {
                this.enableFocusPrevention();
            }
            return false;
        }
    }

    async blurWindow() {
        if (!this.window || this.window.isDestroyed()) {
            return false;
        }

        try {
            this.window.blur();

            if (this.config.restorePreviousFocus && this.state.lastFocusedWindow) {
                setTimeout(() => {
                    if (this.state.lastFocusedWindow && !this.state.lastFocusedWindow.isDestroyed()) {
                        this.state.lastFocusedWindow.focus();
                    }
                }, 50);
            }

            return true;
        } catch (error) {
            return false;
        }
    }

    getPreviouslyFocusedWindow() {
        for (let i = this.state.focusHistory.length - 1; i >= 0; i--) {
            const entry = this.state.focusHistory[i];
            if (entry.window !== this.window && !entry.window.isDestroyed()) {
                return entry.window;
            }
        }
        return this.state.lastFocusedWindow;
    }

    getState() {
        return {
            ...this.state,
            focusHistory: [...this.state.focusHistory]
        };
    }

    getConfig() {
        return { ...this.config };
    }

    isManaging() {
        return this.state.isManaging;
    }

    isFocusPreventionActive() {
        return this.state.preventionActive;
    }

    destroy() {
        this.stopManaging();
        this.removeAllListeners();
        this.window = null;
        this.state.lastFocusedWindow = null;
        this.state.focusHistory = [];
    }
}

module.exports = { FocusManager };
