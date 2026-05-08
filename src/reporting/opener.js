'use strict';

const { spawn } = require('child_process');

function openInBrowser(filePath) {
  const cmds = { darwin: 'open', win32: 'start', linux: 'xdg-open' };
  const cmd = cmds[process.platform] || 'xdg-open';
  const args = process.platform === 'win32' ? ['', filePath] : [filePath];
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', shell: process.platform === 'win32' });
  child.unref();
}

module.exports = { openInBrowser };
