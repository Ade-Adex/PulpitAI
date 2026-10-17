// Cross-platform dev launcher: starts Vite for the renderer, waits until it
// answers on port 5173, then boots Electron pointed at the dev server.
import { spawn } from 'node:child_process';

const DEV_URL = 'http://localhost:5173';

// Benign Electron DevTools console noise (Autofill protocol domain is not
// implemented in Electron's Chromium). Safe to drop from the dev console.
const IGNORED_ELECTRON_LINES = ['Autofill.enable', 'Autofill.setAddresses'];

function createLineFilter() {
  let pending = '';
  return (chunk) => {
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? ''; // keep any incomplete trailing line buffered
    for (const line of lines) {
      if (!IGNORED_ELECTRON_LINES.some((noise) => line.includes(noise))) {
        process.stdout.write(line + '\n');
      }
    }
  };
}

const vite = spawn('npx vite', { shell: true, stdio: 'inherit' });

async function waitForVite(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Vite did not start at ${url} within ${timeoutMs / 1000}s`);
}

let exiting = false;
function shutdown(code) {
  if (exiting) return;
  exiting = true;
  if (!vite.killed) vite.kill();
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

try {
  await waitForVite(DEV_URL);
} catch (err) {
  console.error(err.message);
  shutdown(1);
}

const filter = createLineFilter();
// `npm run dev:debug` passes --devtools through to this script.
const wantDevTools = process.argv.includes('--devtools');
const electron = spawn('npx electron .', {
  shell: true,
  // Pipe and filter instead of inherit, so DevTools noise never reaches us.
  stdio: ['inherit', 'pipe', 'pipe'],
  env: {
    ...process.env,
    PULPIT_DEV_URL: DEV_URL,
    PULPIT_DEVTOOLS: wantDevTools ? '1' : '0',
  },
});
electron.stdout.on('data', filter);
electron.stderr.on('data', filter);

electron.on('exit', (code) => shutdown(code ?? 0));
vite.on('exit', (code) => {
  if (!exiting) {
    console.error('Vite dev server exited unexpectedly.');
    shutdown(code ?? 1);
  }
});
