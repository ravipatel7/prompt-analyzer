'use strict';

const path = require('path');
const os = require('os');

function getClaudeDir() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (appData) return path.join(appData, 'Claude');
    return path.join(process.env.USERPROFILE || os.homedir(), '.claude');
  }
  return path.join(os.homedir(), '.claude');
}

function getHistoryPath() {
  return path.join(getClaudeDir(), 'history.jsonl');
}

function getProjectsDir() {
  return path.join(getClaudeDir(), 'projects');
}

function getPluginCacheDir() {
  return path.join(getClaudeDir(), 'plugins', 'cache');
}

function getInstalledPluginsPath() {
  return path.join(getClaudeDir(), 'plugins', 'installed_plugins.json');
}

function getSettingsPath() {
  return path.join(getClaudeDir(), 'settings.json');
}

function getLocalPluginDir(projectRoot) {
  return path.join(projectRoot, '.claude', 'plugins');
}

function encodeProjectPath(absPath) {
  return absPath.replace(/[/\\:]/g, '-');
}

module.exports = {
  getClaudeDir,
  getHistoryPath,
  getProjectsDir,
  getPluginCacheDir,
  getInstalledPluginsPath,
  getSettingsPath,
  getLocalPluginDir,
  encodeProjectPath,
};
