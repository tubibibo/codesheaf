/** Domain-level error raised for recoverable, user-meaningful failures. */
export class BundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BundleError';
  }
}
