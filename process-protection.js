const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class ProcessProtection {
  constructor() {
    this.launchAgentPath = path.join(
      process.env.HOME,
      'Library/LaunchAgents/com.safari-web-helper.plist'
    );
    this.watchdogScriptPath = '/tmp/safari-web-helper-watchdog.sh';
    this.watchdogProcess = null;
  }

  async enableProtection() {
    console.log('🛡️ Enabling process protection...');

    // Check for existing instances first
    if (await this.isAlreadyRunning()) {
      console.log('⚠️  Another instance is already running - exiting this one');
      app.quit();
      return false;
    }

    // Kill any orphaned watchdogs from previous runs
    await this.cleanupOrphanedWatchdogs();

    try {
      await this.setHighPriority();
    } catch (err) {
      console.log('Could not set high priority (requires sudo):', err.message);
    }

    await this.installLaunchAgent();
    await this.startWatchdog();
    await this.preventForceQuit();

    console.log('✅ Process protection enabled successfully');
    return true;
  }

  async isAlreadyRunning() {
    return new Promise((resolve) => {
      exec('pgrep -f "Safari Web Helper"', (error, stdout) => {
        if (error) {
          resolve(false);
          return;
        }
        const pids = stdout.trim().split('\n').filter(pid => pid && pid !== process.pid.toString());
        resolve(pids.length > 0);
      });
    });
  }

  async cleanupOrphanedWatchdogs() {
    return new Promise((resolve) => {
      exec('pkill -f "safari-web-helper-watchdog"', () => {
        console.log('✓ Cleaned up orphaned watchdog processes');
        resolve();
      });
    });
  }

  async setHighPriority() {
    return new Promise((resolve, reject) => {
      exec(`renice -n -10 -p ${process.pid}`, (error) => {
        if (error) reject(error);
        else {
          console.log('✓ Set process priority to high');
          resolve();
        }
      });
    });
  }

  async installLaunchAgent() {
    const appPath = app.getPath('exe');

    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.safari-web-helper</string>
    <key>ProgramArguments</key>
    <array>
        <string>${appPath}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>1</integer>
</dict>
</plist>`;

    fs.writeFileSync(this.launchAgentPath, plist);

    return new Promise((resolve) => {
      exec(`launchctl load ${this.launchAgentPath}`, () => {
        console.log('✓ LaunchAgent installed (auto-restart enabled)');
        resolve();
      });
    });
  }

  async startWatchdog() {
    const appPath = app.getPath('exe');

    const watchdogScript = `#!/bin/bash
while true; do
    if ! pgrep -f "Safari Web Helper" > /dev/null; then
        open -a "${appPath}"
    fi
    sleep 5
done`;

    fs.writeFileSync(this.watchdogScriptPath, watchdogScript);
    fs.chmodSync(this.watchdogScriptPath, '0755');

    this.watchdogProcess = spawn('bash', [this.watchdogScriptPath], {
      detached: true,
      stdio: 'ignore'
    });

    this.watchdogProcess.unref();
    console.log('✓ Watchdog process started (monitors for kills)');
  }

  async preventForceQuit() {
    const { app } = require('electron');

    app.on('before-quit', (event) => {
      if (!global.allowQuit) {
        event.preventDefault();
      }
    });

    app.on('will-quit', (event) => {
      if (!global.allowQuit) {
        event.preventDefault();
      }
    });

    console.log('✓ Force quit prevention enabled');
  }

  async disableProtection() {
    console.log('🛡️ Disabling process protection...');

    if (this.watchdogProcess) {
      try {
        process.kill(this.watchdogProcess.pid);
      } catch (err) {}
    }

    exec('pkill -f "safari-web-helper-watchdog"', () => {});

    if (fs.existsSync(this.launchAgentPath)) {
      exec(`launchctl unload ${this.launchAgentPath}`, () => {
        fs.unlinkSync(this.launchAgentPath);
      });
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('✅ Process protection disabled');
  }
}

module.exports = ProcessProtection;
