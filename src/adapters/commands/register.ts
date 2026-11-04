import * as vscode from 'vscode';
import {
  copyActiveFile,
  copyActiveFileWithImports,
  copyFromExplorer,
  copySelection,
  previewActiveFile,
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
  ];
}
