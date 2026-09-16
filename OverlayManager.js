// OverlayManager.js - Overlay persistence management
// Robust overlay persistence with state tracking and event emitters

const { BrowserWindow } = require('electron');
const { EventEmitter } = require('events');
const { FocusManager } = require('./FocusManager');

class OverlayManager extends EventEmitter {
    constructor(config = {}) {
        super();

        this.window = null;
        this.platform = process.platform;

        this.config = {
            priority: 'maximum',
            persistent: true,
            monitorInterval: 1000,
            platformOptimizations: true,
            preventFocusSteal: true,
            ...config
        };

        this.state = {
            isActive: false,
            currentLevel: 'normal',
            lastRestored: 0,
            monitoringActive: false
        };

        this.monitorTimer = null;
        this.persistenceTimer = null;
        this.persistenceChecks = 0;

        this.focusManager = new FocusManager({
            preventFocusSteal: this.config.preventFocusSteal,
            allowUserFocus: false,
            restorePreviousFocus: true
        });

        this.setupFocusManagerListeners();
    }

    setupFocusManagerListeners() {
        this.focusManager.on('focusPrevented', (data) => {
            this.emit('focusPrevented', data);
        });

        this.focusManager.on('windowFocused', () => {
            this.emit('windowFocused');
        });

        this.focusManager.on('windowBlurred', () => {
            this.emit('windowBlurred');
        });
    }

    setWindow(window) {
        if (this.window && !this.window.isDestroyed()) {
            this.stopMonitoring();
            this.stopPersistenceMonitoring();
        }

        this.window = window;
        this.focusManager.setWindow(window);
        this.setupWindowListeners();
    }

    setupWindowListeners() {
        if (!this.window) return;

        this.window.on('show', () => {
            if (this.state.isActive) {
                this.applyOverlayLevel();
            }
        });

        this.window.on('closed', () => {
            this.stopMonitoring();
            this.stopPersistenceMonitoring();
            this.focusManager.stopManaging();
            this.window = null;
        });

        this.window.on('minimize', () => {
            if (this.state.isActive) {
                this.emit('overlayMinimized');
            }
        });

        this.window.on('restore', () => {
            if (this.state.isActive) {
                setTimeout(() => this.applyOverlayLevel(), 100);
                this.emit('overlayRestored');
            }
        });

        // Debounced blur handler
        let blurDebounceTimer = null;
        this.window.on('blur', () => {
            if (this.state.isActive && this.platform === 'darwin') {
                if (blurDebounceTimer) {
                    clearTimeout(blurDebounceTimer);
                }

                blurDebounceTimer = setTimeout(() => {
                    if (this.window && !this.window.isDestroyed()) {
                        this.window.setAlwaysOnTop(true, 'screen-saver');
                        console.log('🔄 Re-applied screen-saver level after blur event');
                    }
                    blurDebounceTimer = null;
                }, 200);
            }
        });

        // Debounced focus handler
        let focusDebounceTimer = null;
        this.window.on('focus', () => {
            if (this.state.isActive && this.platform === 'darwin') {
                if (focusDebounceTimer) {
                    clearTimeout(focusDebounceTimer);
                }

                focusDebounceTimer = setTimeout(() => {
                    if (this.window && !this.window.isDestroyed()) {
                        this.window.setAlwaysOnTop(true, 'screen-saver');
                    }
                    focusDebounceTimer = null;
                }, 200);
            }
        });
    }

    async enableOverlay() {
        if (!this.window || this.window.isDestroyed()) {
            this.emit('error', new Error('No valid window available'));
            return false;
        }

        try {
            await this.applyOverlayLevel();
            await this.applyPlatformOptimizations();

            if (this.config.preventFocusSteal) {
                this.focusManager.startManaging();
            }

            this.state.isActive = true;
            this.state.lastRestored = Date.now();

            if (this.config.persistent) {
                this.startMonitoring();
                this.startPersistenceMonitoring();
            }

            this.emit('overlayEnabled', this.state);
            return true;
        } catch (error) {
            this.emit('error', error);
            return false;
        }
    }

    async disableOverlay() {
        if (!this.window || this.window.isDestroyed()) {
            return false;
        }

        try {
            this.stopMonitoring();
            this.stopPersistenceMonitoring();
            this.focusManager.stopManaging();

            this.window.setAlwaysOnTop(false);

            this.state.isActive = false;
            this.state.currentLevel = 'normal';

            this.emit('overlayDisabled', this.state);
            return true;
        } catch (error) {
            this.emit('error', error);
            return false;
        }
    }

    async applyOverlayLevel() {
        if (!this.window || this.window.isDestroyed()) return;

        try {
            // Force screen-saver level (highest standard level)
            this.window.setAlwaysOnTop(true, 'screen-saver');
            this.state.currentLevel = 'screen-saver';

            if (this.platform === 'darwin') {
                this.applyMacOSMaximumOverlay();
            }
        } catch (error) {
            this.window.setAlwaysOnTop(true);
            this.state.currentLevel = 'fallback';
            console.warn('Failed to set specific window level, using fallback:', error);
        }
    }

    applyMacOSMaximumOverlay() {
        if (!this.window || this.window.isDestroyed() || this.platform !== 'darwin') return;

        try {
            this.window.setAlwaysOnTop(true, 'screen-saver');
            this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
            this.window.setAlwaysOnTop(true, 'screen-saver');

            if (this.window.setWindowButtonVisibility) {
                this.window.setWindowButtonVisibility(false);
            }

            this.window.setHiddenInMissionControl(true);
            this.window.setMinimizable(false);
            this.window.setIgnoreMouseEvents(false);
            this.window.setAlwaysOnTop(true, 'screen-saver');

            console.log('✅ Applied macOS maximum overlay settings with screen-saver level');
        } catch (error) {
            console.warn('❌ Failed to apply some macOS overlay optimizations:', error);
        }
    }

    async applyPlatformOptimizations() {
        if (!this.window || this.window.isDestroyed() || !this.config.platformOptimizations) return;

        try {
            switch (this.platform) {
                case 'darwin':
                    this.window.setHiddenInMissionControl(true);
                    if (this.window.setWindowButtonVisibility) {
                        this.window.setWindowButtonVisibility(false);
                    }
                    break;

                case 'win32':
                case 'linux':
                    this.window.setSkipTaskbar(true);
                    break;
            }
        } catch (error) {
            console.warn('Platform optimization failed:', error);
        }
    }

    startMonitoring() {
        if (this.monitorTimer || !this.config.persistent) return;

        this.state.monitoringActive = true;

        // Aggressive 250ms interval for macOS
        const interval = this.platform === 'darwin' ? 250 : this.config.monitorInterval;

        this.monitorTimer = setInterval(() => {
            this.checkAndRestoreOverlay();
        }, interval);

        console.log(`🔍 Started aggressive overlay monitoring (${interval}ms interval)`);
        this.emit('monitoringStarted');
    }

    stopMonitoring() {
        if (this.monitorTimer) {
            clearInterval(this.monitorTimer);
            this.monitorTimer = null;
        }

        this.state.monitoringActive = false;
        this.emit('monitoringStopped');
    }

    startPersistenceMonitoring() {
        if (this.persistenceTimer || !this.config.persistent) return;

        this.persistenceTimer = setInterval(() => {
            this.checkOverlayPersistence();
        }, this.config.monitorInterval * 2);

        this.emit('persistenceMonitoringStarted');
    }

    stopPersistenceMonitoring() {
        if (this.persistenceTimer) {
            clearInterval(this.persistenceTimer);
            this.persistenceTimer = null;
        }

        this.persistenceChecks = 0;
        this.emit('persistenceMonitoringStopped');
    }

    async checkOverlayPersistence() {
        if (!this.window || this.window.isDestroyed() || !this.state.isActive) {
            return;
        }

        try {
            const isAlwaysOnTop = this.window.isAlwaysOnTop();

            if (!isAlwaysOnTop) {
                await this.applyOverlayLevel();
                this.persistenceChecks++;
                this.emit('overlayPersistenceRestored', {
                    checks: this.persistenceChecks,
                    timestamp: Date.now()
                });
            } else if (this.platform === 'darwin') {
                const now = Date.now();
                if (now - this.state.lastRestored > 2000) {
                    await this.applyOverlayLevel();
                    this.state.lastRestored = now;
                    console.log('🔄 Re-applied screen-saver level to maintain always-on-top');
                }
            }
        } catch (error) {
            this.emit('error', error);
        }
    }

    async checkAndRestoreOverlay() {
        if (!this.window || this.window.isDestroyed() || !this.state.isActive) {
            return;
        }

        try {
            const focusedWindow = BrowserWindow.getFocusedWindow();

            if (focusedWindow && focusedWindow !== this.window) {
                const now = Date.now();
                if (now - this.state.lastRestored > 500) {
                    await this.applyOverlayLevel();
                    this.state.lastRestored = now;
                    this.emit('overlayRestored', { timestamp: now });
                }
            }
        } catch (error) {
            this.emit('error', error);
        }
    }

    updateConfig(newConfig) {
        const oldConfig = { ...this.config };
        this.config = { ...this.config, ...newConfig };

        if (oldConfig.priority !== this.config.priority && this.state.isActive) {
            this.applyOverlayLevel();
        }

        if (oldConfig.persistent !== this.config.persistent) {
            if (this.config.persistent && this.state.isActive) {
                this.startMonitoring();
            } else {
                this.stopMonitoring();
            }
        }

        this.emit('configUpdated', this.config);
    }

    getState() {
        return { ...this.state };
    }

    getConfig() {
        return { ...this.config };
    }

    isOverlayActive() {
        return this.state.isActive;
    }

    async forceRestoreOverlay() {
        if (!this.state.isActive) return false;

        try {
            await this.applyOverlayLevel();
            this.state.lastRestored = Date.now();
            this.emit('overlayForceRestored');
            return true;
        } catch (error) {
            this.emit('error', error);
            return false;
        }
    }

    destroy() {
        this.stopMonitoring();
        this.stopPersistenceMonitoring();
        this.focusManager.destroy();
        this.removeAllListeners();
        this.window = null;
    }
}

module.exports = { OverlayManager };
