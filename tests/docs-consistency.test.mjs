// Guards the agent-facing documentation against structural drift.
// Deliberately narrow: it checks that named paths exist and that every module is
// documented. It does not pin prose, so ordinary rewording stays free.
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => readFile(path.join(root, file), 'utf8');
const exists = (target) => access(target).then(() => true, () => false);

async function publicModules() {
  const entries = await readdir(path.join(root, 'public'));
  return entries.filter((name) => name.endsWith('.mjs')).sort();
}

test('every public path named in AGENTS.md exists', async () => {
  const agents = await read('AGENTS.md');
  const named = new Set(
    [...agents.matchAll(/`(public\/[A-Za-z0-9_.-]+)`/g)].map((match) => match[1]),
  );

  assert.ok(named.size >= 15, `expected the module map, found only ${named.size} paths`);
  for (const file of named) {
    assert.ok(await exists(path.join(root, file)), `AGENTS.md names ${file}, which does not exist`);
  }
});

test('AGENTS.md documents every public module', async () => {
  const agents = await read('AGENTS.md');
  for (const module of await publicModules()) {
    assert.ok(agents.includes(module), `AGENTS.md omits public/${module}`);
  }
});

test('README and the architecture map mention every public module', async () => {
  const readme = await read('README.md');
  const architecture = await read('docs/architecture.md');

  for (const module of await publicModules()) {
    assert.ok(readme.includes(module), `README omits public/${module}`);
    assert.ok(architecture.includes(module), `docs/architecture.md omits public/${module}`);
  }
});

test('.gitignore covers local tool state', async () => {
  const ignore = await read('.gitignore');
  for (const entry of ['.codegraph/', '.playwright-cli/', '.atl/.skill-registry.cache.json']) {
    assert.ok(ignore.includes(entry), `.gitignore must ignore ${entry}`);
  }
});

test('relative markdown links in the agent docs resolve', async () => {
  for (const file of ['AGENTS.md', 'README.md', 'docs/architecture.md']) {
    const source = await read(file);
    for (const match of source.matchAll(/\]\(([^)#][^)]*?\.md)\)/g)) {
      const target = path.resolve(path.dirname(path.join(root, file)), match[1]);
      assert.ok(await exists(target), `${file} links to missing ${match[1]}`);
    }
  }
});
