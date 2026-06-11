const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

function request(port, pathName, options) {
  const config = options || {};

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: config.hostname || 'localhost',
        port,
        path: pathName,
        method: config.method || 'GET',
        headers: config.headers || {}
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString('utf8')
          });
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

function requestWithTimeout(port, pathName, options, timeoutMs) {
  const config = options || {};

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: config.hostname || 'localhost',
        port,
        path: pathName,
        method: config.method || 'GET',
        headers: config.headers || {}
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            timedOut: false,
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString('utf8')
          });
        });
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ timedOut: true });
    });

    req.on('error', (err) => {
      if (err && err.code === 'ECONNRESET') {
        return;
      }
      reject(err);
    });

    req.end();
  });
}

async function runBinSmoke() {
  console.log('bin/gitlost.js output:');

  const child = spawn(process.execPath, [path.join('bin', 'gitlost.js')], {
    cwd: path.join(__dirname, '..'),
    env: Object.assign({}, process.env, { GITLOST_NO_OPEN: '1' }),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  let started = false;
  let cleanedUp = false;

  async function cleanup() {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;

    if (!child.killed) {
      child.kill();
    }

    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 1000);
      child.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  child.stdout.on('data', (data) => {
    const text = data.toString('utf8');
    stdout += text;
    process.stdout.write(text);
    if (stdout.includes('6776')) {
      started = true;
    }
  });

  child.stderr.on('data', (data) => {
    const text = data.toString('utf8');
    stderr += text;
    process.stderr.write(text);
  });

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('bin/gitlost.js did not report startup output in time.'));
      }, 10000);

      const onExit = (code) => {
        clearTimeout(timeout);
        reject(new Error('bin/gitlost.js exited early with code ' + code + '. stderr: ' + stderr));
      };

      child.once('exit', onExit);

      const poll = setInterval(() => {
        if (!started) {
          return;
        }

        clearInterval(poll);
        clearTimeout(timeout);
        child.removeListener('exit', onExit);
        resolve();
      }, 50);
    });

    const root = await request(6776, '/', { hostname: 'localhost' });
    assert.strictEqual(root.statusCode, 200, 'Expected bin script server GET / to return HTTP 200');

    await runBrowserFlowSmoke(6776);
  } finally {
    await cleanup();
  }
}

async function runBrowserFlowSmoke(port) {
  const repo = path.join(__dirname, '..');

  const root = await request(port, '/');
  assert.strictEqual(root.statusCode, 200, 'Expected GET / to return HTTP 200');
  assert.ok(root.body.includes('<!DOCTYPE html>') || root.body.includes('<html'), 'Expected GET / to return HTML content');

  const status = await request(port, '/git/status', {
    headers: { 'gitlost-repo': repo }
  });
  assert.strictEqual(status.statusCode, 200, 'Expected /git/status to return HTTP 200');

  const refsRes = await request(port, '/refs', {
    headers: { 'gitlost-repo': repo }
  });
  assert.strictEqual(refsRes.statusCode, 200, 'Expected /refs to return HTTP 200');

  const refsPayload = JSON.parse(refsRes.body);
  assert.ok(Array.isArray(refsPayload.refs), 'Expected /refs payload to include refs array');

  const localStorageLikeSettings = {
    branches: ['master', 'HEAD'],
    opened: [],
    rankdir: 'LR',
    include_forward: false,
    draw_type: 'dot'
  };

  const dotRes = await request(port, '/dot', {
    headers: {
      'gitlost-repo': repo,
      'gitlost-settings': JSON.stringify(localStorageLikeSettings)
    }
  });
  assert.strictEqual(dotRes.statusCode, 200, 'Expected /dot to return HTTP 200');
  assert.ok(dotRes.body.includes('digraph GitLost'), 'Expected /dot to return graphviz output');

  const firstRef = refsPayload.refs.find((ref) => /^[0-9a-f]{40}$/i.test(ref.commit));
  if (firstRef) {
    const showRes = await request(port, '/show/' + firstRef.commit, {
      headers: { 'gitlost-repo': repo }
    });
    assert.strictEqual(showRes.statusCode, 200, 'Expected /show/:id to return HTTP 200');
  }

  const watchRes = await requestWithTimeout(
    port,
    '/watch',
    { headers: { 'gitlost-repo': repo } },
    500
  );
  assert.ok(
    watchRes.timedOut || watchRes.statusCode === 200,
    'Expected /watch to either hold the long-poll open or return HTTP 200'
  );

  console.log('Browser-flow smoke passed: status, refs, dot, show, and watch long-poll behavior validated.');
}

(async () => {
  try {
    await runBinSmoke();
    console.log('Smoke test passed.');
  } catch (err) {
    console.error('Smoke test failed.');
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
})();
