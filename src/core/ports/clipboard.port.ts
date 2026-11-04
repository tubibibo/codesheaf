/** Port: write text to the system clipboard. */
export interface ClipboardPort {
  writeText(text: string): Promise<void>;
}
