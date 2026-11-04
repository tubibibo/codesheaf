/** Port: opens rendered text in a read-only editor view. */
export interface PreviewPort {
  openText(content: string, languageId: string): Promise<void>;
}
