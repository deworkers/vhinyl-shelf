import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import Database from 'better-sqlite3';

async function startServer(t, { legacy = false, generatedPassword = false, secure = false } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vinyl-server-test-'));
  if (legacy) {
    await fs.mkdir(path.join(directory, 'data'));
    await fs.mkdir(path.join(directory, 'uploads'));
    const db = new Database(path.join(directory, 'data', 'vinyl.sqlite'));
    db.exec(`CREATE TABLE records (
      id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, discogs_release_id INTEGER UNIQUE,
      status TEXT NOT NULL, title TEXT NOT NULL, artist TEXT NOT NULL, year TEXT, label TEXT, format TEXT,
      cover_url TEXT, notes TEXT DEFAULT '', payload_json TEXT, spotify_preview_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE uploads (id INTEGER PRIMARY KEY AUTOINCREMENT, record_id INTEGER, file_path TEXT NOT NULL,
      mime_type TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(record_id) REFERENCES records(id) ON DELETE CASCADE);
      INSERT INTO records (id, source, discogs_release_id, status, title, artist, notes, payload_json)
      VALUES (42, 'discogs', 123, 'my_collection', 'Legacy album', 'Legacy artist', 'Keep notes', '{"tracklist":[{"title":"Song"}]}');
      INSERT INTO uploads (id, record_id, file_path, mime_type) VALUES (7, 42, '/uploads/legacy.png', 'image/png');
      INSERT INTO uploads (id, file_path, mime_type) VALUES (8, '/uploads/unattached.png', 'image/png');`);
    db.close();
    await fs.writeFile(path.join(directory, 'uploads', 'legacy.png'), 'legacy-cover');
  }

  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));

  const server = spawn(process.execPath, [fileURLToPath(new URL('../src/server.js', import.meta.url))], {
    cwd: directory,
    env: { ...process.env, PORT: String(port), DISCOGS_TOKEN: '', DATA_DIR: '', NODE_ENV: secure ? 'production' : 'test',
      ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: generatedPassword ? '' : 'Admin-password-for-tests',
      COOKIE_SECURE: secure ? 'true' : 'false', TRUST_PROXY: '0', APP_ORIGIN: 'http://localhost:5173' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const exited = once(server, 'exit');
  let output = '';
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => { output = (output + chunk).slice(-4000); });
  }
  t.after(async () => {
    if (server.exitCode === null && server.signalCode === null) server.kill();
    await exited;
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('vinyl-server-test-'));
    await fs.rm(resolved, { recursive: true, force: true });
  });

  const origin = `http://127.0.0.1:${port}`;
  let health;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && server.exitCode === null) {
    try {
      health = await fetch(`${origin}/api/health`);
      break;
    } catch {
      await delay(100);
    }
  }
  assert.ok(health, `Backend failed to start:\n${output}`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });

  assert.ok((await fs.stat(path.join(directory, 'data', 'vinyl.sqlite'))).size > 0);
  return { directory, origin };
}

function client(origin) {
  return async (endpoint, { cookie, method = 'GET', body, headers = {} } = {}) => {
    const response = await fetch(`${origin}${endpoint}`, { method,
      headers: { 'X-Requested-With': 'VinylShelf', ...(cookie ? { Cookie: cookie } : {}),
        ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    });
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    const setCookie = response.headers.getSetCookie().findLast((value) => value.startsWith('vinyl_session=') && !value.startsWith('vinyl_session=;'));
    return { response, data, status: response.status, cookie: setCookie?.split(';')[0] };
  };
}

function cover(recordId) {
  const form = new FormData();
  form.append('cover', new Blob(['cover-image'], { type: 'image/png' }), 'cover.png');
  if (recordId) form.append('record_id', String(recordId));
  return form;
}

const manual = { source: 'manual', status: 'my_collection', manual: { title: 'Test album', artist: 'Test artist' } };
const discogs = { source: 'discogs', status: 'want_to_buy', discogsPayload: { id: 123, title: 'Discogs album' } };

test('authentication, ownership and administrator actions work through the real HTTP server', { timeout: 30000 }, async (t) => {
  const { origin, directory } = await startServer(t);
  const request = client(origin);
  const admin = await request('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'Admin-password-for-tests' } });
  assert.equal(admin.status, 200);
  const adminCookie = admin.cookie;
  let aliceCookie, bobCookie, aliceId, bobId, aliceRecord, bobRecord, bobCover;

  await t.test('anonymous requests and CSRF attempts cannot access the application', async () => {
    for (const endpoint of ['/api/records', '/api/records/1', '/api/users', '/uploads/missing.png', '/api/discogs/search?q=test', '/api/previews/search?artist=a&title=b']) {
      assert.equal((await request(endpoint)).status, 401, endpoint);
    }
    assert.equal((await request('/api/records', { method: 'POST', body: manual })).status, 401);
    assert.equal((await request('/api/auth/register', { method: 'POST', headers: { 'X-Requested-With': '' }, body: { username: 'csrf', password: 'Password-for-tests' } })).status, 403);
    const preflight = await fetch(`${origin}/api/records`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'X-Requested-With' } });
    assert.equal(preflight.headers.get('access-control-allow-origin'), null);
  });

  await t.test('registration creates ordinary users and validates credentials', async () => {
    assert.equal((await request('/api/auth/register', { method: 'POST', body: { username: 'alice', password: 'short' } })).status, 400);
    const alice = await request('/api/auth/register', { method: 'POST', body: { username: 'alice', password: 'Alice-password-for-tests', role: 'admin' } });
    assert.equal(alice.status, 201);
    assert.equal(alice.data.user.role, 'user');
    assert.equal(alice.data.user.password_hash, undefined);
    assert.match(alice.response.headers.get('set-cookie'), /HttpOnly/);
    assert.match(alice.response.headers.get('set-cookie'), /SameSite=Lax/);
    aliceCookie = alice.cookie;
    aliceId = alice.data.user.id;
    assert.equal((await request('/api/auth/register', { method: 'POST', body: { username: 'ALICE', password: 'Other-password-for-tests' } })).status, 409);
    const bob = await request('/api/auth/register', { method: 'POST', body: { username: 'bob', password: 'Bob-password-for-tests' } });
    assert.equal(bob.status, 201);
    bobCookie = bob.cookie;
    bobId = bob.data.user.id;
    assert.equal((await request('/api/records', { cookie: aliceCookie })).data.length, 0);
    assert.equal((await request('/api/users', { cookie: aliceCookie })).status, 403);
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { username: 'alice', password: 'Incorrect-password' } })).status, 401);
  });

  await t.test('each collection is isolated and the same Discogs release can belong to different users', async () => {
    const alice = await request('/api/records', { method: 'POST', cookie: aliceCookie, body: { ...manual, user_id: bobId } });
    const bob = await request('/api/records', { method: 'POST', cookie: bobCookie, body: manual });
    assert.equal(alice.status, 201);
    assert.equal(alice.data.user_id, aliceId);
    aliceRecord = alice.data;
    bobRecord = bob.data;
    assert.equal((await request('/api/records', { method: 'POST', cookie: aliceCookie, body: discogs })).status, 201);
    assert.equal((await request('/api/records', { method: 'POST', cookie: bobCookie, body: discogs })).status, 201);
    assert.equal((await request('/api/records', { method: 'POST', cookie: aliceCookie, body: discogs })).status, 409);
    const own = await request('/api/records', { cookie: aliceCookie });
    assert.equal(own.data.length, 2);
    assert.ok(own.data.every((record) => record.user_id === aliceId));
    for (const method of ['GET', 'PATCH', 'DELETE']) {
      assert.equal((await request(`/api/records/${bobRecord.id}`, { method, cookie: aliceCookie, ...(method === 'PATCH' ? { body: { notes: 'Intruder' } } : {}) })).status, 404);
    }
    assert.equal((await request(`/api/records?user_id=${bobId}`, { cookie: aliceCookie })).status, 403);
    assert.equal((await request(`/api/records?user_id=${bobId}`, { cookie: aliceCookie, method: 'POST', body: manual })).status, 403);
    const updated = await request(`/api/records/${aliceRecord.id}`, { method: 'PATCH', cookie: aliceCookie, body: { notes: 'My note', user_id: bobId } });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.user_id, aliceId);
  });

  await t.test('administrator can view and edit other collections but ordinary users cannot manage users', async () => {
    assert.equal((await request(`/api/records/${bobRecord.id}`, { cookie: adminCookie })).status, 200);
    const list = await request(`/api/records?user_id=${bobId}`, { cookie: adminCookie });
    assert.equal(list.data.length, 2);
    assert.ok(list.data.every((record) => record.user_id === bobId));
    assert.equal((await request('/api/records?user_id=bogus', { cookie: adminCookie })).status, 400);
    assert.equal((await request('/api/records?user_id=99999', { cookie: adminCookie })).status, 404);
    assert.equal((await request(`/api/records/${bobRecord.id}`, { method: 'PATCH', cookie: adminCookie, body: { notes: 'Admin note' } })).status, 200);
    const added = await request(`/api/records?user_id=${bobId}`, { method: 'POST', cookie: adminCookie, body: manual });
    assert.equal(added.status, 201);
    assert.equal(added.data.user_id, bobId);
    const upload = await request('/api/uploads/cover', { method: 'POST', cookie: bobCookie, body: cover(added.data.id) });
    assert.equal(upload.status, 201);
    assert.equal((await request(`/api/records/${added.data.id}`, { method: 'DELETE', cookie: adminCookie })).status, 204);
    assert.equal((await fs.readdir(path.join(directory, 'uploads'))).length, 0);
    for (const [method, suffix, body] of [['PATCH', '', { blocked: true }], ['DELETE', '', undefined], ['DELETE', '/collection', undefined]]) {
      assert.equal((await request(`/api/users/${bobId}${suffix}`, { method, cookie: aliceCookie, body })).status, 403);
    }
    const users = await request('/api/users', { cookie: adminCookie });
    assert.equal(users.data.length, 3);
    assert.ok(users.data.every((user) => !('password_hash' in user)));
    assert.equal(users.data.find((user) => user.id === aliceId).record_count, 2);
    assert.equal((await request(`/api/users/${admin.data.user.id}`, { cookie: adminCookie, method: 'PATCH', body: { blocked: true } })).status, 403);
    assert.equal((await request(`/api/users/${admin.data.user.id}`, { cookie: adminCookie, method: 'DELETE' })).status, 403);
  });

  await t.test('cover uploads and downloads obey ownership, including admin uploads for another user', async () => {
    assert.equal((await request('/api/uploads/cover', { method: 'POST', cookie: aliceCookie, body: cover(bobRecord.id) })).status, 404);
    assert.equal((await fs.readdir(path.join(directory, 'uploads'))).length, 0);
    const upload = await request('/api/uploads/cover', { method: 'POST', cookie: adminCookie, body: cover(bobRecord.id) });
    assert.equal(upload.status, 201);
    bobCover = upload.data.cover_url;
    assert.equal((await fetch(`${origin}${bobCover}`, { headers: { Cookie: bobCookie } })).status, 200);
    assert.equal((await fetch(`${origin}${bobCover}`, { headers: { Cookie: aliceCookie } })).status, 404);
    assert.equal((await fetch(`${origin}${bobCover}`)).status, 401);
    const unsafe = new FormData();
    unsafe.append('cover', new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'unsafe.svg');
    assert.equal((await request('/api/uploads/cover', { method: 'POST', cookie: aliceCookie, body: unsafe })).status, 400);
  });

  await t.test('blocking immediately revokes sessions; unblocking requires a new login', async () => {
    assert.equal((await request(`/api/users/${bobId}`, { method: 'PATCH', cookie: adminCookie, body: { blocked: true } })).status, 204);
    assert.equal((await request('/api/records', { cookie: bobCookie })).status, 401);
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { username: 'bob', password: 'Bob-password-for-tests' } })).status, 401);
    assert.equal((await request(`/api/users/${bobId}`, { method: 'PATCH', cookie: adminCookie, body: { blocked: false } })).status, 204);
    assert.equal((await request('/api/auth/me', { cookie: bobCookie })).status, 401);
    const login = await request('/api/auth/login', { method: 'POST', body: { username: 'bob', password: 'Bob-password-for-tests' } });
    assert.equal(login.status, 200);
    bobCookie = login.cookie;
  });

  await t.test('password change and logout revoke old sessions', async () => {
    const second = await request('/api/auth/login', { method: 'POST', body: { username: 'alice', password: 'Alice-password-for-tests' } });
    const changed = await request('/api/auth/password', { method: 'PATCH', cookie: aliceCookie, body: { current_password: 'Alice-password-for-tests', password: 'New-Alice-password-for-tests' } });
    assert.equal(changed.status, 204);
    assert.equal((await request('/api/auth/me', { cookie: aliceCookie })).status, 401);
    assert.equal((await request('/api/auth/me', { cookie: second.cookie })).status, 401);
    assert.equal((await request('/api/auth/me', { cookie: changed.cookie })).status, 200);
    assert.equal((await request('/api/auth/logout', { method: 'POST', cookie: changed.cookie })).status, 204);
    assert.equal((await request('/api/auth/me', { cookie: changed.cookie })).status, 401);
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { username: 'alice', password: 'Alice-password-for-tests' } })).status, 401);
    const login = await request('/api/auth/login', { method: 'POST', body: { username: 'alice', password: 'New-Alice-password-for-tests' } });
    assert.equal(login.status, 200);
    aliceCookie = login.cookie;
  });

  await t.test('clearing and deleting a user affect only that user and remove uploaded files', async () => {
    assert.equal((await request(`/api/users/${bobId}/collection`, { method: 'DELETE', cookie: adminCookie })).status, 204);
    assert.equal((await request('/api/records', { cookie: bobCookie })).data.length, 0);
    assert.equal((await request('/api/records', { cookie: aliceCookie })).data.length, 2);
    assert.equal((await fs.readdir(path.join(directory, 'uploads'))).length, 0);
    assert.equal((await fetch(`${origin}${bobCover}`, { headers: { Cookie: bobCookie } })).status, 404);
    assert.equal((await request('/api/records', { method: 'POST', cookie: bobCookie, body: manual })).status, 201);
    assert.equal((await request('/api/uploads/cover', { method: 'POST', cookie: bobCookie, body: cover() })).status, 201);
    assert.equal((await request(`/api/users/${bobId}`, { method: 'DELETE', cookie: adminCookie })).status, 204);
    assert.equal((await request('/api/auth/me', { cookie: bobCookie })).status, 401);
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { username: 'bob', password: 'Bob-password-for-tests' } })).status, 401);
    assert.equal((await fs.readdir(path.join(directory, 'uploads'))).length, 0);
    assert.equal((await request('/api/records', { cookie: aliceCookie })).data.length, 2);
  });

  await t.test('sessions store token hashes and login attempts are limited', async () => {
    const db = new Database(path.join(directory, 'data', 'vinyl.sqlite'));
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(aliceId);
    assert.ok(!user.password_hash.includes('New-Alice-password-for-tests'));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?').get(aliceCookie.split('=')[1]).n, 0);
    db.prepare('UPDATE auth_attempts SET attempts = 30').run();
    db.close();
    const limited = await request('/api/auth/login', { method: 'POST', body: { username: 'alice', password: 'New-Alice-password-for-tests' } });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.response.headers.get('retry-after')) > 0);
    assert.equal((await request('/api/auth/me', { cookie: aliceCookie })).status, 200);
  });
});

test('legacy collection and covers migrate to the admin with a recoverable backup; restart preserves ownership', { timeout: 20000 }, async (t) => {
  const { origin, directory } = await startServer(t, { legacy: true });
  const request = client(origin);
  const login = await request('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'Admin-password-for-tests' } });
  const records = await request('/api/records', { cookie: login.cookie });
  assert.equal(records.status, 200);
  assert.equal(records.data.length, 1);
  const record = records.data[0];
  assert.equal(record.id, 42);
  assert.equal(record.user_id, login.data.user.id);
  assert.equal(record.notes, 'Keep notes');
  assert.deepEqual(JSON.parse(record.payload_json), { tracklist: [{ title: 'Song' }] });
  assert.equal((await fetch(`${origin}/uploads/legacy.png`, { headers: { Cookie: login.cookie } })).status, 200);
  const backups = (await fs.readdir(path.join(directory, 'data'))).filter((name) => name.startsWith('vinyl-before-auth-') && name.endsWith('.sqlite'));
  assert.equal(backups.length, 1);
  const backup = new Database(path.join(directory, 'data', backups[0]), { readonly: true });
  assert.equal(backup.prepare('SELECT COUNT(*) AS n FROM records').get().n, 1);
  assert.ok(!backup.prepare('PRAGMA table_info(records)').all().some((column) => column.name === 'user_id'));
  backup.close();
  const newcomer = await request('/api/auth/register', { method: 'POST', body: { username: 'newcomer', password: 'Newcomer-password-for-tests' } });
  assert.equal((await request('/api/records', { cookie: newcomer.cookie })).data.length, 0);
  assert.equal((await request('/api/records', { cookie: newcomer.cookie, method: 'POST', body: discogs })).status, 201);
  const db = new Database(path.join(directory, 'data', 'vinyl.sqlite'));
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  assert.equal(db.prepare('SELECT user_id FROM uploads WHERE id = 8').get().user_id, login.data.user.id);
  db.close();
  // Import initialization in a new process against the same database, without starting another listener.
  const reinitialize = spawn(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(new URL('../src/db/client.js', import.meta.url).href)});`], {
    cwd: directory, env: { ...process.env, DATA_DIR: '', ADMIN_USERNAME: 'different-admin', ADMIN_PASSWORD: 'Changed-env-password' }, windowsHide: true, stdio: 'pipe',
  });
  assert.equal((await once(reinitialize, 'exit'))[0], 0);
  assert.equal((await request('/api/auth/me', { cookie: login.cookie })).status, 200);
  assert.equal((await request('/api/records', { cookie: login.cookie })).data[0].id, 42);
  assert.equal((await fs.readdir(path.join(directory, 'data'))).filter((name) => name.startsWith('vinyl-before-auth-') && name.endsWith('.sqlite')).length, 1);
});

test('initial admin gets a random password when none is configured; production cookies require HTTPS', { timeout: 20000 }, async (t) => {
  const { origin, directory } = await startServer(t, { generatedPassword: true, secure: true });
  const credentials = await fs.readFile(path.join(directory, 'data', 'admin-credentials.txt'), 'utf8');
  const password = credentials.match(/Password: (.+)/)[1];
  assert.ok(password.length >= 32);
  const request = client(origin);
  const login = await request('/api/auth/login', { method: 'POST', body: { username: 'admin', password } });
  assert.equal(login.status, 200);
  assert.match(login.response.headers.get('set-cookie'), /; Secure/);
});
