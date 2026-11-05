#!/usr/bin/env node
// Interaction-driven browser playthrough for Torres del Sisal.
//
// Why: `?test` asserts rules *inside* the page but never presses a key or moves
// the mouse, so a broken input path would still pass. This harness serves
// `public/` on loopback, launches headless Chrome, drives the real game with
// trusted DevTools Protocol input events, and exits non-zero when the game
// stops responding to the player.
//
// Run: node scripts/playthrough.mjs
// Needs a local Chrome (set CHROME_PATH if it lives somewhere unusual).
// No dependencies, no package.json, no traffic outside 127.0.0.1.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TELEMETRY_OPT_OUT_KEY = 'tds-run-telemetry-opt-out-v1'; // keeps this run off Supabase
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Chrome discovery -------------------------------------------------------
function usable(file) {
  try { fs.accessSync(file, fs.constants.X_OK); return fs.statSync(file).isFile(); } catch { return false; }
}

function onPath(name) {
  try {
    return execFileSync('/bin/sh', ['-c', 'command -v -- "$1"', 'sh', name], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch { return null; }
}

function findChrome() {
  const configured = process.env.CHROME_PATH;
  if (configured) {
    if (usable(configured)) return configured;
    console.warn(`# CHROME_PATH is not an executable file: ${configured}`);
  }
  const appBundle = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  ].find(usable);
  if (appBundle) return appBundle;
  return [
    onPath('google-chrome'), onPath('google-chrome-stable'), onPath('chromium'), onPath('chromium-browser'),
  ].find((candidate) => candidate && usable(candidate)) ?? null;
}

// --- Static server (loopback only) -----------------------------------------
function startServer(root) {
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end('method not allowed');
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
    catch { return res.writeHead(400).end('bad request'); }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + path.sep)) return res.writeHead(403).end('forbidden');
    let body;
    try { body = fs.readFileSync(file); } catch { return res.writeHead(404).end('not found'); }
    const type = MIME[path.extname(file).toLowerCase()] ?? 'text/javascript; charset=utf-8';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// --- Chrome process ---------------------------------------------------------
function launchChrome(binary, profileDir) {
  const args = [
    '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox',
    '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,1400', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--mute-audio',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', // nothing outside loopback resolves
    'about:blank',
  ];
  const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const output = [];
  let exited = false;
  const collect = (chunk) => { if (output.length < 30) output.push(String(chunk).trim()); };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  child.once('exit', () => { exited = true; });
  child.once('error', (err) => { exited = true; output.push(`spawn error: ${err.message}`); });
  return { child, exited: () => exited, output: () => output.join('\n') };
}

async function stopChrome(chrome) {
  if (chrome.exited()) return;
  chrome.child.kill('SIGTERM');
  for (let i = 0; i < 30 && !chrome.exited(); i += 1) await sleep(100);
  if (chrome.exited()) return;
  try { chrome.child.kill('SIGKILL'); } catch { /* already gone */ }
  await sleep(200);
}

async function connectChrome(profileDir, chrome, timeoutMs = 15000) {
  const file = path.join(profileDir, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (chrome.exited()) throw new Error(`Chrome exited before opening DevTools\n${chrome.output()}`);
    try {
      const port = Number(fs.readFileSync(file, 'utf8').split('\n')[0]);
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const page = response.ok && (await response.json()).find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return { port, page };
    } catch { /* DevTools not up yet */ }
    await sleep(150);
  }
  throw new Error('Chrome did not expose a CDP page target within 15s');
}

// --- Minimal CDP client -----------------------------------------------------
function connectCdp(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 0;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message || 'CDP error'));
    else entry.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const entry of pending.values()) entry.reject(new Error('CDP connection closed'));
    pending.clear();
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('CDP websocket did not open within 10s'));
    }, 10000);
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`CDP websocket error connecting to ${url}`));
    }, { once: true });
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolve({
        send(method, params = {}) {
          return new Promise((res, rej) => {
            const id = ++nextId;
            pending.set(id, { resolve: res, reject: rej });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close: () => { try { socket.close(); } catch { /* already closed */ } },
      });
    }, { once: true });
  });
}

async function evaluate(cdp, expression) {
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: false,
  });
  if (exceptionDetails) {
    const detail = exceptionDetails.exception?.description || exceptionDetails.text || 'evaluation failed';
    throw new Error(detail.split('\n')[0]);
  }
  return result?.value;
}

const readPage = (cdp, expression) => evaluate(cdp, expression).catch(() => null);

// --- Page probes ------------------------------------------------------------
const readPhase = (cdp) => readPage(cdp, "window._game && window._game.state ? window._game.state.phase : null");
const readCamera = (cdp) => readPage(cdp, '(() => { const g = window._game; const p = g && g.camera && g.camera.position; return p && g.state ? { x: p.x, z: p.z, paused: Boolean(g.state.paused) } : null; })()');
const readYaw = (cdp) => readPage(cdp, "window._game && typeof window._game.yaw === 'number' ? window._game.yaw : null");
const readEnterButton = (cdp) => readPage(cdp, "(() => { const b = document.getElementById('enterBtn'); if (!b) return null; const r = b.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, vw: innerWidth, vh: innerHeight }; })()");
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

async function waitForGame(cdp, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await readPage(cdp, 'typeof window._game') === 'object') return true;
    await sleep(150);
  }
  return false;
}

async function waitForPhase(cdp, wanted, timeoutMs) {
  const started = Date.now();
  let phase = null;
  while (Date.now() - started < timeoutMs) {
    phase = await readPhase(cdp);
    if (phase === wanted) break;
    await sleep(100);
  }
  return { phase, waitedMs: Date.now() - started };
}

async function click(cdp, box) {
  const x = Math.round(box.left + box.width / 2);
  const y = Math.round(box.top + box.height / 2);
  const base = { x, y, button: 'left', clickCount: 1 };
  await cdp.send('Input.dispatchMouseEvent', { ...base, type: 'mousePressed', buttons: 1 });
  await cdp.send('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 });
  return { x, y };
}

const dispatchKey = (cdp, type) => cdp.send('Input.dispatchKeyEvent', {
  type, key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87,
});

const moveMouse = (cdp, x, y) => cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });

// --- Playthrough ------------------------------------------------------------
async function main() {
  if (typeof WebSocket !== 'function') {
    console.error('FAIL  harness — this Node has no global WebSocket (needs Node 22+).');
    return 1;
  }
  const chromeBinary = findChrome();
  if (!chromeBinary) {
    console.error('FAIL  harness — no Chrome found. Install Google Chrome or set CHROME_PATH to the binary.');
    return 1;
  }

  const results = [];
  const check = (label, ok, evidence) => {
    results.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} — ${evidence}`);
  };

  const { server, port } = await startServer(PUBLIC_DIR);
  const gameUrl = `http://127.0.0.1:${port}/`;
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tds-playthrough-'));
  let chrome = null;
  let cdp = null;
  console.log(`# chrome: ${chromeBinary}\n# server: ${gameUrl}\n# profile: ${profileDir}`);

  try {
    chrome = launchChrome(chromeBinary, profileDir);
    const devtools = await connectChrome(profileDir, chrome);
    console.log(`# cdp: 127.0.0.1:${devtools.port}`);
    cdp = await connectCdp(devtools.page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    // The game posts run telemetry to Supabase on start; opt out before its scripts run.
    // Headless Chrome grants and drops pointer lock unpredictably, which pauses the
    // game mid-run, so pin the run to the game's supported no-pointer-lock fallback.
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try { localStorage.setItem(${JSON.stringify(TELEMETRY_OPT_OUT_KEY)}, 'true'); } catch (e) {}
        try { Element.prototype.requestPointerLock = () => Promise.reject(new Error('playthrough: pointer lock disabled')); } catch (e) {}`,
    });
    const navigation = await cdp.send('Page.navigate', { url: gameUrl });
    if (navigation.errorText) throw new Error(`could not load ${gameUrl}: ${navigation.errorText}`);
    if (await waitForGame(cdp)) await sleep(400);

    const gameKind = await readPage(cdp, 'typeof window._game');
    check('window._game exists', gameKind === 'object', `typeof window._game === ${JSON.stringify(gameKind)}`);

    const before = await readPhase(cdp);
    check('phase before click is "intro"', before === 'intro', `phase = ${JSON.stringify(before)}`);

    const box = await readEnterButton(cdp);
    const onScreen = box && box.left >= 0 && box.top >= 0
      && box.left + box.width <= box.vw + 1 && box.top + box.height <= box.vh + 1;
    let after = { phase: null, waitedMs: 0 };
    let note;
    if (!box) note = 'enter button not found in the DOM';
    else if (!onScreen) note = `enter button off-screen: ${Math.round(box.left)},${Math.round(box.top)} ${Math.round(box.width)}x${Math.round(box.height)} in ${box.vw}x${box.vh}`;
    else {
      const center = await click(cdp, box);
      after = await waitForPhase(cdp, 'playing', 5000);
      note = `click at ${center.x},${center.y}, settled after ${after.waitedMs}ms`;
    }
    const playing = after.phase === 'playing';
    check('phase after click is "playing"', playing, `phase = ${JSON.stringify(after.phase)} (${note})`);

    if (!playing) {
      check('camera responds to holding "w"', false, 'skipped: game never reached the playing phase');
      check('yaw responds to mouse move', false, 'skipped: game never reached the playing phase');
    } else {
      await sleep(1200); // let the first floor build and shaders compile
      const startPos = await readCamera(cdp);
      await sleep(1200);
      const idlePos = await readCamera(cdp);
      const walkStart = Date.now();
      await dispatchKey(cdp, 'keyDown');
      let walkPos = idlePos;
      // The loop clamps dt, so headless hitches shorten a fixed-duration walk:
      // hold W until the camera clearly moved instead of trusting a sleep.
      while (Date.now() - walkStart < 5000) {
        await sleep(200);
        walkPos = await readCamera(cdp);
        if (idlePos && walkPos && distance(idlePos, walkPos) >= 1.5) break;
      }
      await dispatchKey(cdp, 'keyUp');
      await sleep(150);
      const stopped = (await readCamera(cdp)) ?? walkPos;
      const heldMs = Date.now() - walkStart;
      if (!startPos || !idlePos || !stopped) {
        check('camera responds to holding "w"', false, 'camera position unavailable');
      } else {
        const idleDrift = distance(startPos, idlePos);
        const walkDelta = distance(idlePos, stopped);
        const forward = stopped.z < idlePos.z - 0.5;
        check('camera responds to holding "w"',
          forward && walkDelta > 1 && walkDelta > idleDrift + 0.5 && !stopped.paused,
          `z ${idlePos.z.toFixed(2)} → ${stopped.z.toFixed(2)}, moved ${walkDelta.toFixed(2)} in ${heldMs}ms `
            + `(idle drift ${idleDrift.toFixed(2)}, x ${idlePos.x.toFixed(2)} → ${stopped.x.toFixed(2)}, paused ${stopped.paused})`);
      }

      const yawStart = await readYaw(cdp);
      await moveMouse(cdp, 400, 300);
      await sleep(250);
      const yawBefore = await readYaw(cdp);
      await moveMouse(cdp, 520, 300);
      await sleep(250);
      const yawAfter = await readYaw(cdp);
      const yawOk = Number.isFinite(yawBefore) && Number.isFinite(yawAfter) && Math.abs(yawAfter - yawBefore) > 0.02;
      check('yaw responds to mouse move', yawOk,
        Number.isFinite(yawBefore) && Number.isFinite(yawAfter)
          ? `yaw ${yawBefore.toFixed(3)} → ${yawAfter.toFixed(3)} (Δ${Math.abs(yawAfter - yawBefore).toFixed(3)}, first move settled at ${Number.isFinite(yawStart) ? yawStart.toFixed(3) : 'n/a'})`
          : `yaw unavailable (before=${JSON.stringify(yawBefore)}, after=${JSON.stringify(yawAfter)})`);
    }
  } catch (err) {
    console.error(`FAIL  harness — ${err?.message ?? err}`);
    const tail = chrome?.output();
    if (tail) console.error(`# chrome output:\n${tail}`);
    return 1;
  } finally {
    cdp?.close();
    if (chrome) await stopChrome(chrome);
    server.closeAllConnections?.();
    server.close();
    try { fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
    catch (err) { console.warn(`# could not remove ${profileDir}: ${err.message}`); }
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} assertions passed`);
  return passed === results.length ? 0 : 1;
}

main().then((code) => process.exit(code), (err) => {
  console.error(`FAIL  harness — ${err?.message ?? err}`);
  process.exit(1);
});
