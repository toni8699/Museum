import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(scriptDir, '../.svelte-kit/output');

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(outputDir, relativePath), 'utf8'));
}

function resolveEntry(manifest, reference) {
  if (manifest[reference]) return reference;
  return Object.entries(manifest).find(([, entry]) => entry.file === reference)?.[0] ?? null;
}

function reachableEntries(manifest, start) {
  const seen = new Set();
  const pending = [start];
  while (pending.length > 0) {
    const key = pending.pop();
    if (!key || seen.has(key)) continue;
    const entry = manifest[key];
    if (!entry) throw new Error(`Manifest entry not found: ${key}`);
    seen.add(key);
    for (const reference of [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])]) {
      const dependency = resolveEntry(manifest, reference);
      if (!dependency) throw new Error(`Manifest dependency not found: ${reference} (from ${key})`);
      pending.push(dependency);
    }
  }
  return [...seen];
}

function forbiddenSource(entryKey, entry) {
  const source = [entryKey, entry.file, entry.name, entry.src].filter(Boolean).join(' ');
  return /(?:^|[\\/])editor(?:[\\/]|$)|EditorApp|virtual:museum-editor-entry/i.test(source);
}

const serverManifest = readJson('server/.vite/manifest.json');
const clientManifest = readJson('client/.vite/manifest.json');
const serverRoute = serverManifest['src/routes/museum/+page.svelte'];
if (!serverRoute) throw new Error('No built /museum server route entry found');

const serverEntries = reachableEntries(serverManifest, 'src/routes/museum/+page.svelte');
const serverForbidden = serverEntries.filter((key) => forbiddenSource(key, serverManifest[key]));

const serverManifestSource = readFileSync(resolve(outputDir, 'server/manifest.js'), 'utf8');
const leafMatch = serverManifestSource.match(
  /id:\s*["']\/museum["'][\s\S]*?page:\s*\{[\s\S]*?leaf:\s*(\d+)/
);
if (!leafMatch) throw new Error('No built /museum client leaf found');

const clientStart = Object.keys(clientManifest).find((key) =>
  key.endsWith(`/nodes/${leafMatch[1]}.js`)
);
if (!clientStart) throw new Error(`No client manifest entry for /museum leaf ${leafMatch[1]}`);

const clientEntries = reachableEntries(clientManifest, clientStart);
const clientForbidden = clientEntries.filter((key) => forbiddenSource(key, clientManifest[key]));
const forbidden = [...new Set([...serverForbidden, ...clientForbidden])];
if (forbidden.length > 0) {
  throw new Error(`Visitor /museum closure reaches editor entries:\n${forbidden.join('\n')}`);
}

console.log(
  `visitor bundle ok: /museum reaches ${serverEntries.length} server and ${clientEntries.length} client entries`
);
