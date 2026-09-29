const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync, spawn } = require('child_process');

const ROOT = __dirname;
const ZIP = path.join(ROOT, 'NEXO_v4_2_NATIVE_dead_signal.zip');
const RUNTIME = path.join(os.tmpdir(), 'nexo-v4-2-runtime');
const APP = path.join(RUNTIME, 'NEXO_v4_2');

if (!fs.existsSync(ZIP)) {
  console.error('Missing NEXO_v4_2_NATIVE_dead_signal.zip');
  process.exit(1);
}

try { fs.rmSync(RUNTIME, { recursive: true, force: true }); } catch {}
fs.mkdirSync(RUNTIME, { recursive: true });

const unzip = spawnSync('unzip', ['-oq', ZIP, '-d', RUNTIME], { stdio: 'inherit' });
if (unzip.status !== 0 || !fs.existsSync(path.join(APP, 'server.js'))) {
  console.error('Could not unpack the NEXO v4.2 bundle.');
  process.exit(unzip.status || 1);
}

if (!process.env.NEXO_DATA_DIR) {
  process.env.NEXO_DATA_DIR = path.join(os.tmpdir(), 'nexo-data');
}
process.env.NEXO_NO_AUTO_OPEN = '1';

const child = spawn(process.execPath, ['server.js'], {
  cwd: APP,
  env: process.env,
  stdio: 'inherit'
});

child.on('exit', code => process.exit(code ?? 0));
child.on('error', err => {
  console.error(err);
  process.exit(1);
});
