const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Encryption key derived from machine-specific data
function getMachineKey() {
  const os = require('os');
  const machineId = os.hostname() + os.platform() + os.arch();
  return crypto.createHash('sha256').update(machineId).digest();
}

// Encrypt data
function encrypt(text) {
  try {
    const key = getMachineKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    return text; // Fallback to plain text if encryption fails
  }
}

// Decrypt data
function decrypt(encryptedText) {
  try {
    const key = getMachineKey();
    const parts = encryptedText.split(':');

    if (parts.length !== 2) {
      return encryptedText; // Not encrypted
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return encryptedText; // Return as-is if decryption fails
  }
}

// Secure config storage in hidden system-like location
function getSecureConfigPath(app) {
  const homeDir = require('os').homedir();
  // Store in hidden system-like location
  const configDir = path.join(homeDir, 'Library', 'Caches', '.SystemData');

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  }

  return path.join(configDir, '.webkit-network-cache');
}

// Load encrypted config
function loadSecureConfig(app) {
  const configPath = getSecureConfigPath(app);

  if (fs.existsSync(configPath)) {
    try {
      const encryptedData = fs.readFileSync(configPath, 'utf8');
      const decryptedData = decrypt(encryptedData);
      return JSON.parse(decryptedData);
    } catch (error) {
      console.error('Error loading secure config:', error);
      return getDefaultConfig();
    }
  }

  return getDefaultConfig();
}

// Save encrypted config
function saveSecureConfig(app, config) {
  const configPath = getSecureConfigPath(app);

  try {
    const jsonData = JSON.stringify(config, null, 2);
    const encryptedData = encrypt(jsonData);

    // Write with restricted permissions
    fs.writeFileSync(configPath, encryptedData, { mode: 0o600 });

    // Clear from memory after a delay
    setTimeout(() => {
      if (typeof global.gc === 'function') {
        global.gc();
      }
    }, 1000);

    return true;
  } catch (error) {
    console.error('Error saving secure config:', error);
    return false;
  }
}

// Default config
function getDefaultConfig() {
  return {
    openaiApiKey: null,
    chatSettings: {
      width: 480,
      height: 600,
      position: { x: 0, y: 0 }
    },
    overlaySettings: {
      enabled: true,
      preventFocusSteal: true,
      screenshotProtection: true
    }
  };
}

// Securely wipe config on exit
function wipeSecureConfig(app) {
  const configPath = getSecureConfigPath(app);

  if (fs.existsSync(configPath)) {
    try {
      // Overwrite with random data before deletion
      const size = fs.statSync(configPath).size;
      const randomData = crypto.randomBytes(size);
      fs.writeFileSync(configPath, randomData);
      fs.unlinkSync(configPath);

      console.log('🗑️ Secure config wiped');
    } catch (error) {
      console.error('Error wiping config:', error);
    }
  }
}

// Encrypt sensitive string in memory
function secureString(str) {
  if (!str) return null;

  // Return encrypted buffer instead of plain string
  return {
    encrypted: true,
    data: encrypt(str),
    get: function() {
      return decrypt(this.data);
    },
    clear: function() {
      this.data = null;
    }
  };
}

module.exports = {
  loadSecureConfig,
  saveSecureConfig,
  wipeSecureConfig,
  secureString,
  encrypt,
  decrypt
};
