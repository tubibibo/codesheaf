/**
 * Renders a list of workspace-relative paths as an ASCII file tree,
 * directories first, alphabetically — the shape reviewers expect to see
 * at the top of a context bundle.
 */
export function renderFileTree(paths: readonly string[], rootLabel = 'project'): string {
  if (paths.length === 0) return `${rootLabel}/`;

  interface Node {
    readonly name: string;
    readonly children: Map<string, Node>;
    isDirectory: boolean;
  }

  const root: Node = { name: rootLabel, children: new Map(), isDirectory: true };
  for (const rawPath of paths) {
    const segments = rawPath.split('/').filter((s) => s.length > 0);
    let node = root;
    segments.forEach((segment, index) => {
      const isLast = index === segments.length - 1;
      let child = node.children.get(segment);
      if (child === undefined) {
        child = { name: segment, children: new Map(), isDirectory: !isLast };
        node.children.set(segment, child);
      }
      node = child;
    });
  }

  const lines: string[] = [`${rootLabel}/`];
  const walk = (node: Node, prefix: string): void => {
    const entries = [...node.children.values()].sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    entries.forEach((entry, index) => {
      const isLast = index === entries.length - 1;
      lines.push(
        `${prefix}${isLast ? '└── ' : '├── '}${entry.name}${entry.isDirectory ? '/' : ''}`,
      );
      walk(entry, prefix + (isLast ? '    ' : '│   '));
    });
  };
  walk(root, '');
  return lines.join('\n');
}
