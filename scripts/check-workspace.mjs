import assert from 'node:assert/strict';
import { readFile, realpath, access } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const core = await json('packages/playercore/package.json');
const player = await json('packages/player/package.json');
assert.equal(core.private, true);
assert.equal(core.exports['.'].import, './src/index.js');
assert.equal(player.devDependencies[core.name], 'workspace:*');
for (const name of [core.name, 'streamcanvasx-core', 'streamcanvasx-core2']) {
  assert.equal(player.dependencies[name], undefined, `Published player must not require ${name}`);
}
assert.equal(await realpath(new URL('packages/player/node_modules/@break_happy/streamcanvasx-core', root)),
  await realpath(new URL('packages/playercore', root)));
for (const file of ['packages/player/.git', 'packages/playercore/.git', 'packages/player/vite.config.mts', 'packages/playercore/vite.config.mjs']) {
  await assert.rejects(access(new URL(file, root)), { code: 'ENOENT' });
}
console.log('Workspace uses the private core source package and one root configuration.');
await assert.rejects(access(new URL('packages/playercore/dist', root)), { code: 'ENOENT' });
