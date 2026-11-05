/** Maps file extensions to VS Code-style language identifiers. */
const EXTENSION_TO_LANGUAGE: Readonly<Record<string, string>> = {
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascriptreact',
  '.py': 'python',
  '.java': 'java',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hh': 'cpp',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.sh': 'shellscript',
  '.bash': 'shellscript',
  '.zsh': 'shellscript',
  '.ps1': 'powershell',
  '.md': 'markdown',
  '.json': 'json',
  '.jsonc': 'jsonc',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.dockerfile': 'dockerfile',
};

/** Well-known extensionless file names, mapped to their language ids. */
const BASENAME_TO_LANGUAGE: Readonly<Record<string, string>> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  'cmakelists.txt': 'cmake',
  rakefile: 'ruby',
  gemfile: 'ruby',
  justfile: 'just',
};

/**
 * Derives a language identifier from a path: well-known extensionless
 * basenames first (Dockerfile, Makefile, …), then the extension, else
 * `plaintext`. When the caller knows the editor's language id (editor
 * buffers), it takes precedence over this heuristic — see InputRef.
 */
export function languageIdForPath(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, '/');
  const basename = normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase();
  const byBasename = BASENAME_TO_LANGUAGE[basename];
  if (byBasename !== undefined) return byBasename;
  const match = /\.([a-zA-Z0-9]+)$/.exec(normalized);
  const ext = match && match[1] ? `.${match[1].toLowerCase()}` : undefined;
  return (ext !== undefined && EXTENSION_TO_LANGUAGE[ext]) || 'plaintext';
}
