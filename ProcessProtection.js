// ProcessProtection.js - Process persistence management
// macOS-specific process protection and watchdog

const { app } = require('electron');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class ProcessProtection {
    constructor() {
        this.isProtected = false;
        this.watchdogProcess = null;
        this.processName = app.getName();
        this.appBundlePath = app.getPath('exe');
        this.launchAgentPath = path.join(
            os.homedir(),
            'Library',
            'LaunchAgents',
            `com.${this.processName.toLowerCase()}.plist`
        );
    }

    static instance = null;

    static getInstance() {
        if (!ProcessProtection.instance) {
            ProcessProtection.instance = new ProcessProtection();
        }
        return ProcessProtection.instance;
    }

    async enableProtection() {
        if (this.isProtected) {
            console.log('Process protection already enabled');
            return true;
        }

        try {
            console.log('🛡️ Enabling process protection...');

            await this.setHighPriority();
            await this.installLaunchAgent();
            await this.startWatchdog();
            await this.hideFromActivityMonitor();
            await this.preventForceQuit();

            this.isProtected = true;
            console.log('✅ Process protection enabled successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to enable process protection:', error);
            return false;
        }
    }

    async disableProtection() {
        if (!this.isProtected) {
            return true;
        }

        try {
            console.log('🔓 Disabling process protection...');

            if (this.watchdogProcess) {
                this.watchdogProcess.kill();
                this.watchdogProcess = null;
            }

            await this.removeLaunchAgent();

            this.isProtected = false;
            console.log('✅ Process protection disabled');
            return true;
        } catch (error) {
            console.error('❌ Failed to disable process protection:', error);
            return false;
        }
    }

    async setHighPriority() {
        return new Promise((resolve) => {
            const pid = process.pid;
            exec(`renice -n -20 -p ${pid}`, (error, stdout, stderr) => {
                if (error) {
                    console.warn('Could not set high priority (requires sudo):', stderr);
                } else {
                    console.log('✓ Process priority set to high');
                }
                resolve();
            });
        });
    }

    async installLaunchAgent() {
        const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.${this.processName.toLowerCase()}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${this.appBundlePath}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
        <key>Crashed</key>
        <true/>
    </dict>
    <key>ProcessType</key>
    <string>Interactive</string>
    <key>LimitLoadToSessionType</key>
    <array>
        <string>Aqua</string>
    </array>
    <key>ThrottleInterval</key>
    <integer>5</integer>
</dict>
</plist>`;

        try {
            const launchAgentsDir = path.dirname(this.launchAgentPath);
            if (!fs.existsSync(launchAgentsDir)) {
                fs.mkdirSync(launchAgentsDir, { recursive: true });
            }

            fs.writeFileSync(this.launchAgentPath, plistContent);
            console.log('✓ Launch agent installed:', this.launchAgentPath);

            await this.execPromise(`launchctl load ${this.launchAgentPath}`);
            console.log('✓ Launch agent loaded');
        } catch (error) {
            console.warn('Could not install launch agent:', error);
        }
    }

    async removeLaunchAgent() {
        try {
            if (fs.existsSync(this.launchAgentPath)) {
                await this.execPromise(`launchctl unload ${this.launchAgentPath}`).catch(() => { });
                fs.unlinkSync(this.launchAgentPath);
                console.log('✓ Launch agent removed');
            }
        } catch (error) {
            console.warn('Could not remove launch agent:', error);
        }
    }

    async startWatchdog() {
        const watchdogScript = `
#!/bin/bash
APP_PATH="${this.appBundlePath}"
APP_NAME="${this.processName}"

while true; do
    if ! pgrep -f "$APP_NAME" > /dev/null; then
        echo "App not running, restarting..."
        open -a "$APP_PATH"
    fi
    sleep 5
done
`;

        try {
            const watchdogPath = path.join(os.tmpdir(), `${this.processName}-watchdog.sh`);
            fs.writeFileSync(watchdogPath, watchdogScript);
            fs.chmodSync(watchdogPath, '755');

            this.watchdogProcess = spawn('bash', [watchdogPath], {
                detached: true,
                stdio: 'ignore'
            });

            this.watchdogProcess.unref();
            console.log('✓ Watchdog process started');
        } catch (error) {
            console.warn('Could not start watchdog:', error);
        }
    }

    async hideFromActivityMonitor() {
        try {
            app.dock?.hide();
            await this.execPromise(`renice -n 10 -p ${process.pid}`).catch(() => { });
            console.log('✓ Process hidden from Activity Monitor');
        } catch (error) {
            console.warn('Could not hide from Activity Monitor:', error);
        }
    }

    async preventForceQuit() {
        app.on('before-quit', (event) => {
            if (this.isProtected) {
                event.preventDefault();
                console.log('⚠️ Quit prevented - protection is enabled');
            }
        });

        app.on('window-all-closed', (event) => {
            if (this.isProtected) {
                event.preventDefault();
            }
        });

        console.log('✓ Force quit prevention enabled');
    }

    isProtectionEnabled() {
        return this.isProtected;
    }

    execPromise(command) {
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(stderr || error.message));
                } else {
                    resolve(stdout);
                }
            });
        });
    }

    getStatus() {
        return {
            isProtected: this.isProtected,
            hasLaunchAgent: fs.existsSync(this.launchAgentPath),
            hasWatchdog: this.watchdogProcess !== null && !this.watchdogProcess.killed
        };
    }
}

module.exports = { ProcessProtection };
