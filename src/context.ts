import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseJsonc } from './jsonc.js';
import { errorMessage } from './util.js';

export type JsonFile =
  | { readonly kind: 'missing' }
  | { readonly kind: 'invalid'; readonly error: string }
  | { readonly kind: 'ok'; readonly value: unknown };

/**
 * Read-only view of a repository. Every rule reads files through this class,
 * so rules stay free of I/O details and reads are cached across rules.
 * All paths are relative to `root` and use forward slashes.
 */
export class RepoContext {
  readonly root: string;
  readonly #texts = new Map<string, Promise<string | undefined>>();

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** Returns the file's UTF-8 contents, or `undefined` if it is missing or not a file. */
  readText(relPath: string): Promise<string | undefined> {
    const key = path.posix.normalize(relPath);
    let pending = this.#texts.get(key);
    if (pending === undefined) {
      pending = readFile(this.resolve(key), 'utf8').catch(() => undefined);
      this.#texts.set(key, pending);
    }
    return pending;
  }

  async readJson(relPath: string, options: { readonly comments?: boolean } = {}): Promise<JsonFile> {
    const text = await this.readText(relPath);
    if (text === undefined) return { kind: 'missing' };
    try {
      const value: unknown = options.comments === true ? parseJsonc(text) : JSON.parse(text);
      return { kind: 'ok', value };
    } catch (error) {
      return { kind: 'invalid', error: errorMessage(error) };
    }
  }

  async exists(relPath: string): Promise<boolean> {
    try {
      await stat(this.resolve(relPath));
      return true;
    } catch {
      return false;
    }
  }

  /** Entry names in a directory, sorted. Empty if the directory does not exist. */
  async list(relDir: string): Promise<string[]> {
    try {
      const entries = await readdir(this.resolve(relDir));
      return entries.sort();
    } catch {
      return [];
    }
  }

  private resolve(relPath: string): string {
    return path.join(this.root, relPath);
  }
}
