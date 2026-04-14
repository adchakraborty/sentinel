import { spawn, ChildProcess, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';

let demoProcess: ChildProcess | null = null;

export async function launchDemoApp(demoAppPath: string, port: number): Promise<string> {
  const absPath = path.resolve(demoAppPath);
  if (!fs.existsSync(path.join(absPath, 'package.json'))) {
    throw new Error(`No package.json found in ${absPath}`);
  }

  const nodeModules = path.join(absPath, 'node_modules');
  if (!fs.existsSync(nodeModules)) {
    console.error(`[launcher] Installing demo app dependencies...`);
    execSync('npm install --production', { cwd: absPath, stdio: 'pipe' });
  }

  console.error(`[launcher] Starting demo app on port ${port}...`);

  demoProcess = spawn('node', ['server.js'], {
    cwd: absPath,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  demoProcess.stderr?.on('data', (chunk: Buffer) => {
    const msg = chunk.toString().trim();
    if (msg) console.error(`[demo-app] ${msg}`);
  });

  demoProcess.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`[launcher] Demo app exited with code ${code}`);
    }
    demoProcess = null;
  });

  const targetUrl = `http://localhost:${port}`;
  await waitForHealthy(targetUrl, 15000);
  console.error(`[launcher] Demo app is ready at ${targetUrl}`);
  return targetUrl;
}

export async function stopDemoApp(): Promise<void> {
  if (!demoProcess) return;
  console.error(`[launcher] Stopping demo app...`);
  demoProcess.kill('SIGTERM');

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      demoProcess?.kill('SIGKILL');
      resolve();
    }, 5000);
    demoProcess?.on('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  demoProcess = null;
}

function waitForHealthy(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Demo app did not become healthy within ${timeoutMs}ms`));
      }

      const req = http.get(url, (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
          res.resume();
          resolve();
        } else {
          res.resume();
          setTimeout(check, 300);
        }
      });

      req.on('error', () => setTimeout(check, 300));
      req.setTimeout(2000, () => {
        req.destroy();
        setTimeout(check, 300);
      });
    };
    check();
  });
}

export function findFreePort(): number {
  return 3001 + Math.floor(Math.random() * 1000);
}
