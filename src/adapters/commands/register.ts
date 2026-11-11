import * as vscode from 'vscode';
import {
  copyActiveFile,
  copyActiveFileWithImports,
  copyFromExplorer,
  copySelection,
  copyWithFormat,
  previewActiveFile,
  previewFromExplorer,
  type AppContainer,
} from './handlers';

/** Registers every CodeSheaf command; returns the disposables for teardown. */
export function registerAllCommands(container: AppContainer): readonly vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('codesheaf.copyFile', () => copyActiveFile(container)),
    vscode.commands.registerCommand('codesheaf.copyFileWithImports', () =>
      copyActiveFileWithImports(container),
    ),
    vscode.commands.registerCommand('codesheaf.copySelection', () => copySelection(container)),
    vscode.commands.registerCommand('codesheaf.previewBundle', () => previewActiveFile(container)),
    vscode.commands.registerCommand(
      'codesheaf.copyFiles',
      (...args: unknown[]) => void copyFromExplorer(container, args),
    ),
    vscode.commands.registerCommand(
      'codesheaf.previewFiles',
      (...args: unknown[]) => void previewFromExplorer(container, args),
    ),
    vscode.commands.registerCommand(
      'codesheaf.copyWithFormat',
      () => void copyWithFormat(container),
    ),
  ];
}
