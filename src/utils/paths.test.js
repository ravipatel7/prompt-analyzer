'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');

test('encodeProjectPath: replaces slashes with dashes', () => {
  const { encodeProjectPath } = require('./paths');
  assert.equal(encodeProjectPath('/Users/ravi/myapp'), '-Users-ravi-myapp');
});

test('encodeProjectPath: handles Windows paths', () => {
  const { encodeProjectPath } = require('./paths');
  assert.equal(encodeProjectPath('C:\\Users\\ravi\\myapp'), 'C--Users-ravi-myapp');
});

test('getClaudeDir: returns home-based path on non-Windows', () => {
  if (process.platform === 'win32') return;
  const { getClaudeDir } = require('./paths');
  const dir = getClaudeDir();
  assert.equal(dir, path.join(os.homedir(), '.claude'));
});

test('getHistoryPath: ends with history.jsonl', () => {
  const { getHistoryPath } = require('./paths');
  assert(getHistoryPath().endsWith('history.jsonl'));
});
