import waitOn from 'wait-on';
import { execFile } from 'child_process';
import electronPath from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname); // C:\var\www\note-compacter

async function main() {
  const url = 'http://localhost:5174';
  await waitOn({ resources: [url] });

  // electronPath is the full path to the real Electron binary (not the .cmd shim)
  const entry = join(__dirname, 'main.js');

  const child = execFile(
    electronPath,
    [entry],
    {
      cwd: projectRoot,
      env: { ...process.env, VITE_DEV_SERVER_URL: url },
      windowsHide: false
    },
    (error) => {
      if (error) {
        console.error('Dev runner (execFile) error:', error);
        process.exit(typeof error.code === 'number' ? error.code : 1);
      }
    }
  );

  // Mirror Electron output into our terminal for easy debugging
  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('Dev runner failed before launch:', err);
  process.exit(1);
});
