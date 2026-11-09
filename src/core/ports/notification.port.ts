/** Port: user-facing notifications. */
export interface NotificationPort {
  showInformation(message: string): void;
  showWarning(message: string): void;
  showError(message: string): void;
  /** Blocking question with buttons; resolves the chosen action label, or undefined when dismissed. */
  confirm(message: string, actions: readonly string[]): Promise<string | undefined>;
}
