/** Port: opens rendered text in a separate editor view (no clipboard write). */
export interface PreviewPort {
  openText(content: string, languageId: string): Promise<void>;
}
