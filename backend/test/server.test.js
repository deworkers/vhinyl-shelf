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

test('server starts with a fresh SQLite database and serves the collection', { timeout: 20000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vinyl-server-test-'));
  await fs.mkdir(path.join(directory, 'src', 'db'), { recursive: true });
  await fs.copyFile(new URL('../src/db/schema.sql', import.meta.url), path.join(directory, 'src', 'db', 'schema.sql'));

  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));

  const server = spawn(process.execPath, [fileURLToPath(new URL('../src/server.js', import.meta.url))], {
    cwd: directory,
    env: { ...process.env, PORT: String(port), DISCOGS_TOKEN: '' },
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

  const records = await fetch(`${origin}/api/records`);
  assert.equal(records.status, 200);
  assert.deepEqual(await records.json(), []);
  assert.ok((await fs.stat(path.join(directory, 'data', 'vinyl.sqlite'))).size > 0);
});
