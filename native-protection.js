// Native macOS window protection via Objective-C bridge
// This provides MAXIMUM system-level screenshot protection

let nativeProtection = null;

// Try to load native module
try {
  nativeProtection = require('bindings')('window_protection');
  console.log('✅ Native protection module loaded successfully');
} catch (error) {
  console.warn('⚠️ Native protection module not available:', error.message);
  console.warn('Building native module with: npm run rebuild');
}

function enableNativeProtection(window) {
  if (process.platform !== 'darwin') {
    console.log('Native protection is macOS-only');
    return false;
  }

  if (!nativeProtection) {
    console.warn('⚠️ Native module not loaded - using fallback protection');
    return false;
  }

  try {
    // Electron's getNativeWindowHandle() returns a Buffer
    // We need to pass it directly to the native module
    const handle = window.getNativeWindowHandle();

    console.log('📍 Applying native protection...');
    console.log('   Handle type:', typeof handle);
    console.log('   Handle:', handle);

    // Apply MAXIMUM protection via native Objective-C code
    const result = nativeProtection.applyMaximumProtection(handle);

    if (result) {
      console.log('🔒 MAXIMUM PROTECTION APPLIED');
      console.log('   - NSWindowSharingNone: ACTIVE');
      console.log('   - CGShieldingWindowLevel: ACTIVE');
      console.log('   - Private CGS APIs: ACTIVE');
      console.log('   - Window is now UNCAPTURABLE by ANY tool');

      // Verify protection
      const capturable = nativeProtection.isWindowCapturable(handle);
      console.log(`   - Capturable: ${capturable ? '❌ YES (protection failed)' : '✅ NO (fully protected)'}`);

      return !capturable;
    }

  } catch (error) {
    console.error('❌ Error applying native protection:', error.message);
    console.error('   Stack:', error.stack);
    return false;
  }

  return false;
}

function setWindowSharingType(window, sharingType = 0) {
  if (process.platform !== 'darwin' || !nativeProtection) {
    return false;
  }

  try {
    const handle = window.getNativeWindowHandle();
    return nativeProtection.setWindowSharingType(handle, sharingType);
  } catch (error) {
    console.error('Error setting window sharing type:', error);
    return false;
  }
}

function isWindowCapturable(window) {
  if (process.platform !== 'darwin' || !nativeProtection) {
    return true; // Assume capturable if we can't check
  }

  try {
    const handle = window.getNativeWindowHandle();
    return nativeProtection.isWindowCapturable(handle);
  } catch (error) {
    console.error('Error checking if window is capturable:', error);
    return true;
  }
}

// Enable anti-debugging on startup
function enableAntiDebugging() {
  if (process.platform !== 'darwin' || !nativeProtection) {
    return false;
  }

  try {
    nativeProtection.enableAntiDebugging();
    console.log('🛡️ Anti-debugging protection active');
    return true;
  } catch (error) {
    console.error('Error enabling anti-debugging:', error);
    return false;
  }
}

// Obfuscate process name
function obfuscateProcess() {
  if (process.platform !== 'darwin' || !nativeProtection) {
    return false;
  }

  try {
    nativeProtection.obfuscateProcessName();
    console.log('🥷 Process obfuscated as: com.apple.WebKit.Networking');
    return true;
  } catch (error) {
    console.error('Error obfuscating process:', error);
    return false;
  }
}

// Enable full stealth mode
function enableStealthMode() {
  if (process.platform !== 'darwin' || !nativeProtection) {
    return false;
  }

  try {
    nativeProtection.enableStealthMode();
    console.log('👻 Full stealth mode enabled');
    return true;
  } catch (error) {
    console.error('Error enabling stealth mode:', error);
    return false;
  }
}

module.exports = {
  enableNativeProtection,
  setWindowSharingType,
  isWindowCapturable,
  enableAntiDebugging,
  obfuscateProcess,
  enableStealthMode,
  hasNativeModule: () => nativeProtection !== null
};
