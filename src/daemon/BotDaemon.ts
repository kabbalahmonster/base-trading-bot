// src/daemon/BotDaemon.ts
// Daemon manager for persistent bot operation

import { spawn } from 'child_process';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DAEMON_PID_FILE = join(homedir(), '.base-trading-bot', 'daemon.pid');
const DAEMON_LOG_FILE = join(homedir(), '.base-trading-bot', 'daemon.log');

export interface DaemonStatus {
  running: boolean;
  pid?: number;
  uptime?: string;
  botsRunning?: number;
}

/**
 * Manages the bot daemon process for persistent operation
 */
export class BotDaemon {
  private dataDir: string;

  constructor() {
    this.dataDir = join(homedir(), '.base-trading-bot');
    this.ensureDataDir();
  }

  private ensureDataDir(): void {
    if (!existsSync(this.dataDir)) {
      const { mkdirSync } = require('fs');
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * Check if daemon is currently running
   */
  isRunning(): boolean {
    if (!existsSync(DAEMON_PID_FILE)) {
      return false;
    }

    try {
      const pid = parseInt(readFileSync(DAEMON_PID_FILE, 'utf8').trim());
      // Check if process exists (signal 0 doesn't actually send a signal)
      process.kill(pid, 0);
      return true;
    } catch {
      // Process doesn't exist, clean up stale PID file
      try {
        unlinkSync(DAEMON_PID_FILE);
      } catch {}
      return false;
    }
  }

  /**
   * Get daemon status
   */
  getStatus(): DaemonStatus {
    if (!this.isRunning()) {
      return { running: false };
    }

    try {
      const pid = parseInt(readFileSync(DAEMON_PID_FILE, 'utf8').trim());
      
      // Try to get process stats
      try {
        const { execSync } = require('child_process');
        const stats = execSync(`ps -p ${pid} -o etime=`, { encoding: 'utf8' }).trim();
        return {
          running: true,
          pid,
          uptime: stats,
        };
      } catch {
        return { running: true, pid };
      }
    } catch {
      return { running: false };
    }
  }

  /**
   * Start the daemon
   */
  start(): boolean {
    if (this.isRunning()) {
      return false; // Already running
    }

    // Spawn daemon process
    const daemon = spawn(process.execPath, [
      join(__dirname, 'daemon-process.js')
    ], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        BOT_DAEMON_MODE: 'true'
      }
    });

    // Write PID file
    writeFileSync(DAEMON_PID_FILE, daemon.pid!.toString());

    // Redirect output to log file
    const { createWriteStream } = require('fs');
    const logStream = createWriteStream(DAEMON_LOG_FILE, { flags: 'a' });
    daemon.stdout?.pipe(logStream);
    daemon.stderr?.pipe(logStream);

    // Unref so parent can exit
    daemon.unref();

    return true;
  }

  /**
   * Stop the daemon
   */
  stop(): boolean {
    if (!this.isRunning()) {
      return false;
    }

    try {
      const pid = parseInt(readFileSync(DAEMON_PID_FILE, 'utf8').trim());
      process.kill(pid, 'SIGTERM');
      
      // Wait a bit then force kill if needed
      setTimeout(() => {
        try {
          process.kill(pid, 0); // Check if still running
          process.kill(pid, 'SIGKILL'); // Force kill
        } catch {}
      }, 5000);

      // Clean up PID file
      try {
        unlinkSync(DAEMON_PID_FILE);
      } catch {}

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Restart the daemon
   */
  restart(): boolean {
    this.stop();
    // Wait a moment for clean shutdown
    setTimeout(() => this.start(), 1000);
    return true;
  }

  /**
   * Get log tail
   */
  getLogs(lines: number = 50): string {
    if (!existsSync(DAEMON_LOG_FILE)) {
      return 'No logs available';
    }

    try {
      const { execSync } = require('child_process');
      return execSync(`tail -n ${lines} "${DAEMON_LOG_FILE}"`, { encoding: 'utf8' });
    } catch {
      return 'Unable to read logs';
    }
  }
}
