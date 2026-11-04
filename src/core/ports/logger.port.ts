/** Port: structured logging sink (diagnostics channel in production). */
export interface LoggerPort {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}
