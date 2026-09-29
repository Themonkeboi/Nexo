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

// Apply small live-site UI fixes without depending on an external game build.
const hotfixJs = path.join(ROOT, 'hotfix.js');
const hotfixCss = path.join(ROOT, 'hotfix.css');
if (fs.existsSync(hotfixJs)) fs.copyFileSync(hotfixJs, path.join(APP, 'public/js/hotfix.js'));
if (fs.existsSync(hotfixCss)) fs.copyFileSync(hotfixCss, path.join(APP, 'public/hotfix.css'));
const indexPath = path.join(APP, 'public/index.html');
let index = fs.readFileSync(indexPath, 'utf8');
if (!index.includes('/hotfix.css')) index = index.replace('<link rel="stylesheet" href="/styles.css">', '<link rel="stylesheet" href="/styles.css">\n  <link rel="stylesheet" href="/hotfix.css">');
if (!index.includes('/js/hotfix.js')) index = index.replace('<script type="module" src="/js/main.js"></script>', '<script type="module" src="/js/main.js"></script>\n<script type="module" src="/js/hotfix.js"></script>');
fs.writeFileSync(indexPath, index);

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
