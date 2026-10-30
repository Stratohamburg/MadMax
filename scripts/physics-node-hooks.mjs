import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try { return await nextResolve(specifier, context); }
  catch (error) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    throw error;
  }
}
export async function load(url, context, nextLoad) {
  if (url.endsWith('.ts')) {
    const source = await readFile(new URL(url), 'utf8');
    const result = await transformWithOxc(source, fileURLToPath(url));
    return { format: 'module', shortCircuit: true, source: result.code };
  }
  return nextLoad(url, context);
}
