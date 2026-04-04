import * as fs from 'fs';
import * as path from 'path';

import { ensureDirectory } from './utils.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AutomationLoggerOptions {
  level?: LogLevel;
  rootDir?: string;
  writeToFile?: boolean;
}

const LOG_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class AutomationLogger {
  private readonly level: LogLevel;
  private readonly rootDir: string;
  private readonly writeToFile: boolean;
  private readonly scope: string;

  constructor(scope: string, options: AutomationLoggerOptions = {}) {
    this.scope = scope;
    this.level = options.level ?? 'info';
    this.rootDir = options.rootDir ?? process.cwd();
    this.writeToFile = options.writeToFile ?? true;
  }

  child(scope: string) {
    return new AutomationLogger(scope, {
      level: this.level,
      rootDir: this.rootDir,
      writeToFile: this.writeToFile,
    });
  }

  debug(message: string) {
    this.log('debug', message);
  }

  info(message: string) {
    this.log('info', message);
  }

  warn(message: string) {
    this.log('warn', message);
  }

  error(message: string) {
    this.log('error', message);
  }

  getLogFilePath(now = new Date()) {
    const directory = ensureDirectory(path.join(this.rootDir, '.ai', 'logs'));
    return path.join(directory, `${now.toISOString().slice(0, 10)}.md`);
  }

  private log(level: LogLevel, message: string) {
    if (LOG_ORDER[level] < LOG_ORDER[this.level]) {
      return;
    }

    const line = `[${new Date().toISOString()}] [${this.scope}] ${message}`;
    this.writeConsole(level, line);

    if (!this.writeToFile) {
      return;
    }

    fs.appendFileSync(this.getLogFilePath(), `${line}\n`, 'utf8');
  }

  private writeConsole(level: LogLevel, line: string) {
    switch (level) {
      case 'debug':
      case 'info':
        console.log(line);
        break;
      case 'warn':
        console.warn(line);
        break;
      case 'error':
        console.error(line);
        break;
    }
  }
}
