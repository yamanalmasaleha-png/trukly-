// VPS platform boundary: prevent accidental reintroduction of a hosted runtime.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { runInNewContext } = require('node:vm');
const root = path.resolve(__dirname, '..');
const { assertNotProductionUrl } = require('./staging-http-gates.cjs');
(async () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  assert.equal(pkg.dependencies['@biteshark/runtime-adapter'], 'file:./packages/runtime-adapter');
  assert(!pkg.dependencies.hatchable);
  assert(!fs.existsSync(path.join(root, 'hatchable.toml')));
  for (const host of ['biteshark.live', 'www.biteshark.live', 'truckly.hatchable.site']) {
    assert.throws(() => assertNotProductionUrl('https://' + host), /SAFETY BLOCK/);
  }
  assert.equal(assertNotProductionUrl('https://staging.biteshark.live'), 'https://staging.biteshark.live');
  const window = {};
  runInNewContext(fs.readFileSync(path.join(root, 'public/auth-client.js'), 'utf8'), { window });
  assert.equal(typeof window.biteshark.auth.getUser, 'function');
  assert.equal(window.hatchable, undefined);
  const manifest = fs.readFileSync(path.join(root, 'server/routes.js'), 'utf8');
  const imports = [...manifest.matchAll(/from ['"]\.\.\/(api\/[^'"]+\.js)['"]/g)].map(m => m[1]).sort();
  function walk(dir) {
    return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e => {
      const name = dir + '/' + e.name;
      return e.isDirectory() ? walk(name) : e.name.endsWith('.js') ? [name] : [];
    });
  }
  assert.deepEqual(imports, walk('api').sort(), 'Every domain handler must be explicitly imported by the VPS route manifest');
  const adapter = await import(pathToFileURL(path.join(root, 'packages/runtime-adapter/index.js')).href);
  const { configureStandaloneAdapter, db, auth, runWithRequestContext, bindVerifiedRequestUser } = adapter;
  configureStandaloneAdapter({ db: { query: async () => ({ rows: [{ source: 'vps' }] }) } });
  assert.equal((await db.query('test')).rows[0].source, 'vps');
  const req = {}; bindVerifiedRequestUser(req, { id: 'verified-user' });
  assert.equal((await auth.getUser(req)).id, 'verified-user');
  await Promise.all(['a', 'b'].map(id => runWithRequestContext({ user: { id } }, async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal((await auth.getUser({})).id, id);
  })));
  assert.equal(await auth.getUser({}), null);
  console.log('PASS: VPS-only package, explicit route inventory, same-origin auth bridge, production-target guards and concurrent request identity isolation');
})().catch(err => { console.error(err); process.exitCode = 1; });
