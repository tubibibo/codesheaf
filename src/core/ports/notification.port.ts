/** Port: user-facing notifications. */
export interface NotificationPort {
  showInformation(message: string): void;
  showWarning(message: string): void;
  showError(message: string): void;
}
