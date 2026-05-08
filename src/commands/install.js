'use strict';

const fs = require('fs');
const path = require('path');
const { getPluginCacheDir, getInstalledPluginsPath, getSettingsPath, getLocalPluginDir } = require('../utils/paths');
const { safeReadJSON, safeWriteJSON } = require('../utils/json-writer');

const PLUGIN_NAME = 'prompt-analyzer';
const MARKETPLACE = 'npm-ravipatel';
const PLUGIN_KEY = `${PLUGIN_NAME}@${MARKETPLACE}`;

function getPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

function getPackageRoot() {
  return path.join(__dirname, '..', '..');
}

async function run({ local = false } = {}) {
  const version = getPackageVersion();
  const packageRoot = getPackageRoot();

  let cacheBase;
  let scope;
  let projectPath;

  if (local) {
    cacheBase = getLocalPluginDir(process.cwd());
    scope = 'local';
    projectPath = process.cwd();
  } else {
    cacheBase = getPluginCacheDir();
    scope = 'user';
  }

  const installPath = path.join(cacheBase, MARKETPLACE, PLUGIN_NAME, version);

  console.log(`Installing ${PLUGIN_KEY} to Claude Code (${scope})...`);

  // Step 1: Copy plugin files
  const filesToCopy = [
    ['.claude-plugin', '.claude-plugin'],
    ['skills', 'skills'],
  ];

  fs.mkdirSync(installPath, { recursive: true });

  for (const [src, dest] of filesToCopy) {
    const srcPath = path.join(packageRoot, src);
    const destPath = path.join(installPath, dest);
    if (fs.existsSync(srcPath)) {
      fs.cpSync(srcPath, destPath, { recursive: true, force: true });
    }
  }

  // Step 2: Update installed_plugins.json
  const installedPluginsPath = local
    ? path.join(process.cwd(), '.claude', 'plugins', 'installed_plugins.json')
    : getInstalledPluginsPath();

  const installedPlugins = safeReadJSON(installedPluginsPath, { version: 2, plugins: {} });
  if (!installedPlugins.version) installedPlugins.version = 2;
  if (!installedPlugins.plugins) installedPlugins.plugins = {};

  const now = new Date().toISOString();
  const entry = {
    scope,
    installPath,
    version,
    installedAt: now,
    lastUpdated: now,
  };
  if (local) entry.projectPath = projectPath;

  installedPlugins.plugins[PLUGIN_KEY] = [entry];
  safeWriteJSON(installedPluginsPath, installedPlugins);

  // Step 3: Update settings.json
  const settingsPath = local
    ? path.join(process.cwd(), '.claude', 'settings.json')
    : getSettingsPath();

  const settings = safeReadJSON(settingsPath, {});
  if (!settings.enabledPlugins) settings.enabledPlugins = {};
  if (!settings.extraKnownMarketplaces) settings.extraKnownMarketplaces = {};

  settings.enabledPlugins[PLUGIN_KEY] = true;
  settings.extraKnownMarketplaces[MARKETPLACE] = {
    source: {
      source: 'github',
      repo: 'ravipatel7/prompt-analyzer',
    },
  };
  safeWriteJSON(settingsPath, settings);

  console.log(`\n✓ Installed ${PLUGIN_KEY} v${version}`);
  console.log(`  Skill: prompt-analysis`);
  console.log(`  Location: ${installPath}`);
  console.log(`  Scope: ${scope}`);
  console.log('\nRestart Claude Code, then run /prompt-analysis to invoke the skill.');
}

module.exports = { run };
