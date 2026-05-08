#!/usr/bin/env node
'use strict';

const [,, command, ...args] = process.argv;
const flags = Object.fromEntries(
  args.filter(a => a.startsWith('--')).map(a => [a.slice(2), true])
);

async function main() {
  switch (command) {
    case 'install':
      await require('../src/commands/install').run({ local: Boolean(flags.local) });
      break;
    case 'analyze':
      await require('../src/commands/analyze').run({ openBrowser: false });
      break;
    case '--help':
    case '-h':
    case 'help':
      require('../src/commands/help').run();
      break;
    case undefined:
    default:
      await require('../src/commands/analyze').run({ openBrowser: true });
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
