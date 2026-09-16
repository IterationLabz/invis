const { app, BrowserWindow, globalShortcut, desktopCapturer, screen, systemPreferences, ipcMain } = require('electron');
const path = require('path');
const { loadSecureConfig, saveSecureConfig } = require('./secure-storage');
const { enableNativeProtection, isWindowCapturable, enableAntiDebugging, obfuscateProcess, enableStealthMode } = require('./native-protection');
const { ProcessProtection } = require('./ProcessProtection'); // Use new ported version
const { OverlayManager } = require('./OverlayManager');
const { ChatHelper } = require('./ChatHelper');
const gpuRenderer = require('./gpu-renderer');
const windowPrivacy = require('./window-privacy');

let mainWindow = null;
let isVisible = false;
let config = {};
let screenRecordingDetected = false;
let allowQuit = false;
let processProtection = null;
let overlayManager = null;
let chatHelper = null;

// Ultra-stealth initialization
app.whenReady().then(async () => {
  // 🤫 LOG SUPPRESSION (Production Stealth)
  // Redirect logs to void to prevent Console.app detection
  const noop = () => { };
  console.log = noop;
  console.warn = noop;
  console.error = noop;

  // 🕵️ NETWORK SPOOFING
  // Set global User-Agent to match real Safari exactly
  const safariUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
  app.userAgentFallback = safariUserAgent;

  // We still want to see our own internal logs during dev, but for "10/10" stealth we kill them.
  // If you need to debug, comment out the log suppression above.

  // process.stdout.write('🚀 Initializing ultra-stealth mode...\n'); // Use stdout directly if really needed

  // Enable maximum protection (LaunchAgent + Watchdog + Force-quit prevention)
  processProtection = ProcessProtection.getInstance();
  await processProtection.enableProtection();
  console.log('🛡️  Maximum protection ENABLED');
  console.log('   ⚠️  App is now unkillable - use Cmd+Shift+Q to quit properly');

  // Initialize ChatHelper for server-side chat memory
  chatHelper = new ChatHelper();
  console.log('💬 ChatHelper initialized with server-side memory');

  // Enable anti-debugging
  try {
    await enableAntiDebugging();
    console.log('🛡️ Anti-debugging protection active');
  } catch (err) {
    console.error('⚠️ Could not enable anti-debugging:', err);
  }

  // Obfuscate process name
  try {
    await obfuscateProcess();
    console.log('🥷 Process obfuscated as: Safari Web Helper');
  } catch (err) {
    console.error('⚠️ Could not obfuscate process:', err);
  }

  // Enable stealth mode
  try {
    await enableStealthMode();
    console.log('👻 Full stealth mode enabled');
  } catch (err) {
    console.error('⚠️ Could not enable stealth mode:', err);
  }

  console.log('✅ Ultra-stealth initialization complete');

  // Enable Secure Input (Anti-Keylogger) by default
  app.setSecureKeyboardEntryEnabled(true);
  console.log('🔒 Secure Input Mode ENABLED (Anti-Keylogger active)');

  // Load config
  config = await loadSecureConfig(app);

  createWindow();
  registerHotkeys();
});

function createWindow() {
  const safariUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

  mainWindow = new BrowserWindow({
    width: 600,
    height: 800,
    show: false,
    frame: false,
    transparent: true, // Required for the overlay effect
    // Use the panel window type for overlay behavior
    type: 'panel',
    focusable: true, // Need focus for typing, but will yield intelligently
    hasShadow: false,
    enableLargerThanScreen: true,
    visualEffectState: 'active',
    backgroundMaterial: 'none',
    resizable: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    titleBarStyle: 'customButtonsOnHover',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: ""
  });

  // Standard Electron content protection
  mainWindow.setContentProtection(true);

  // macOS-specific window behavior
  if (process.platform === 'darwin') {
    mainWindow.setWindowButtonVisibility(false);
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setHiddenInMissionControl(true);
  }

  // Initialize OverlayManager (Replaces basic persistence loop)
  overlayManager = new OverlayManager({
    priority: 'maximum',
    persistent: true,
    monitorInterval: 250,
    platformOptimizations: true,
    preventFocusSteal: true
  });
  overlayManager.setWindow(mainWindow);
  overlayManager.enableOverlay().then(success => {
    if (success) {
      console.log('✅ OverlayManager enabled with maximum priority');
    } else {
      console.error('❌ Failed to enable OverlayManager, falling back to basic mode');
    }
  });

  // Clean up on close
  mainWindow.on('closed', () => {
    if (overlayManager) {
      overlayManager.destroy();
    }
  });


  mainWindow.loadFile('index.html');

  mainWindow.on('ready-to-show', () => {
    console.log('📍 Applying native protection...');

    // Set screen-saver level (highest standard macOS window level)
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    console.log('✅ Set window level to screen-saver (highest standard level)');

    const handle = mainWindow.getNativeWindowHandle();
    console.log('   Handle type:', typeof handle);
    console.log('   Handle:', handle);
    console.log('   ✅ Content protection active');

    // Initialize Window Privacy Bypass (E DETECTION BYPASS)
    if (windowPrivacy.initialize()) {
      windowPrivacy.applyFullProtection(mainWindow);
      console.log('🎯 MONITORING CHECKS BYPASSED');
      console.log('   Process monitoring: EVADED');
      console.log('   Focus detection: BLOCKED');
      console.log('   Window enumeration: HIDDEN');
    }
  });
}

function registerHotkeys() {
  // Main toggle hotkey
  globalShortcut.register('CommandOrControl+B', () => {
    if (isVisible) {
      mainWindow.hide();
      isVisible = false;
    } else {
      mainWindow.show();
      mainWindow.focus();
      isVisible = true;
    }
  });

  // Screenshot capture hotkey
  globalShortcut.register('CommandOrControl+Shift+B', async () => {
    if (isVisible && mainWindow) {
      console.log('📸 Capturing screenshot...');

      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: {
            width: screen.getPrimaryDisplay().size.width,
            height: screen.getPrimaryDisplay().size.height
          }
        });

        if (sources.length > 0) {
          const screenshot = sources[0].thumbnail.toDataURL();
          console.log('✅ Screenshot captured');

          mainWindow.webContents.send('screenshot-captured', screenshot);
        }
      } catch (error) {
        console.error('❌ Error capturing screenshot:', error);
        mainWindow.webContents.send('screenshot-error', error.message);
      }
    }
  });

  // Quit hotkey - properly disable protection before quitting
  globalShortcut.register('CommandOrControl+Shift+Q', async () => {
    console.log('🚪 Quit requested by user');

    // CRITICAL: Set global flag FIRST
    global.allowQuit = true;
    allowQuit = true;

    if (processProtection) {
      console.log('🔓 Disabling process protection...');
      await processProtection.disableProtection();
      console.log('✅ Protection disabled - waiting for LaunchAgent cleanup...');

      // Wait longer for LaunchAgent to be fully removed
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('👋 Quitting now...');
    app.exit(0); // Force exit instead of quit
  });

  console.log('⌨️ Hotkeys registered:');
  console.log('   Cmd+B - Show/Hide window');
  console.log('   Cmd+Shift+B - Capture screenshot');
  console.log('   Cmd+Shift+Q - Quit app');
}

app.on('window-all-closed', () => {
  // Keep app running even when window is closed
});

// Prevent force-quit by E or similar apps
app.on('before-quit', (event) => {
  if (!allowQuit) {
    event.preventDefault();
    console.log('🛡️ Quit attempt prevented - InvisAI is protected');
  }
});

app.on('will-quit', (event) => {
  if (!allowQuit) {
    event.preventDefault();
    console.log('🛡️ Quit attempt prevented - InvisAI is protected');
  } else {
    globalShortcut.unregisterAll();
  }
});

// Handle SIGTERM and SIGINT gracefully (ignore force-kill attempts)
process.on('SIGTERM', () => {
  console.log('🛡️ SIGTERM received but ignored - InvisAI stays alive');
});

process.on('SIGINT', () => {
  console.log('🛡️ SIGINT received but ignored - InvisAI stays alive');
});

// IPC handlers for config
// Note: ipcMain is already imported at the top of the file

// Only allow quit through our internal command
ipcMain.on('force-quit-app', () => {
  allowQuit = true;
  app.quit();
});

ipcMain.handle('get-config', async () => {
  return config;
});

ipcMain.handle('save-config', async (event, newConfig) => {
  config = newConfig;
  await saveSecureConfig(app, config);
  return { success: true };
});

ipcMain.on('toggle-secure-input', (event, enabled) => {
  app.setSecureKeyboardEntryEnabled(enabled);
  console.log(`🔒 Secure Input Mode: ${enabled ? 'ENABLED' : 'DISABLED'}`);
});
