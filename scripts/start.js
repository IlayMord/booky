#!/usr/bin/env node
const { spawn } = require('child_process');

const extraArgs = process.argv.slice(2);

const env = {
  ...process.env,
};

const baseArgs = ['expo', 'start', '--clear', ...extraArgs];

function startExpo({ offline }) {
  const args = [...baseArgs];
  if (offline) {
    args.push('--offline');
  }

  const child = spawn('npx', args, {
    stdio: 'inherit',
    env,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.exit(0);
    }

    if (code === 0) {
      process.exit(0);
    }

    if (!offline) {
      console.warn('\nExpo start failed, retrying in offline mode...\n');
      startExpo({ offline: true });
      return;
    }

    process.exit(code ?? 1);
  });
}

startExpo({ offline: false });
