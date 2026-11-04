import * as vscode from 'vscode';
import type { LoggerPort } from '../../core/ports';

/** Adapter: VS Code output channel -> {@link LoggerPort}. */
export class VsCodeLogger implements LoggerPort {
  private readonly channel: vscode.OutputChannel;

  constructor(channelName: string) {
    this.channel = vscode.window.createOutputChannel(channelName);
  }

  debug(message: string): void {
    this.append('DEBUG', message);
  }

  info(message: string): void {
    this.append('INFO', message);
  }

  warn(message: string): void {
    this.append('WARN', message);
  }

  error(message: string): void {
    this.append('ERROR', message);
  }

  dispose(): void {
    this.channel.dispose();
  }

  private append(level: string, message: string): void {
    const timestamp = new Date().toISOString();
    this.channel.appendLine(`[${timestamp}] [${level}] ${message}`);
  }
}
