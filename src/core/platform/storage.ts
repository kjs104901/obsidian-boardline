/**
 * File access for the board code (the vault, through VaultStorage). Every path is relative to
 * `root`, '/'-separated; implementations must refuse paths that escape the root.
 */
export interface WorkspaceStorage {
  readFile(root: string, path: string): Promise<string>
  /** Write a text file, making its folder when missing. */
  writeFileAtomic(root: string, path: string, contents: string): Promise<void>
  exists(root: string, path: string): Promise<boolean>
  /** Names of the files directly in `dir` (empty if it doesn't exist). */
  listFiles(root: string, dir: string): Promise<string[]>
  /** Delete one of the app's own files (under `.boardline/`). */
  removeAppFile(root: string, path: string): Promise<void>
  /** Binary contents (images). */
  readBytes(root: string, path: string): Promise<Uint8Array>
  /** Store a binary file (pictures, exported images), making its folder when missing. */
  writeAsset(root: string, path: string, bytes: Uint8Array): Promise<void>
}

export function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}
