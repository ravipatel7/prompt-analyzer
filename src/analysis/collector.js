'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { getProjectsDir, getHistoryPath } = require('../utils/paths');

function collectSessionFiles() {
  const projectsDir = getProjectsDir();
  const files = [];

  if (!fs.existsSync(projectsDir)) return files;

  const projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(projectsDir, d.name));

  for (const projDir of projectDirs) {
    const projectKey = path.basename(projDir);
    try {
      const entries = fs.readdirSync(projDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          const sessionId = entry.name.replace('.jsonl', '');
          files.push({
            filePath: path.join(projDir, entry.name),
            projectKey,
            sessionId,
            isSubagent: false,
          });
        }
        // Walk into session subdirectories for subagent transcripts
        if (entry.isDirectory()) {
          const subDir = path.join(projDir, entry.name);
          const subAgentsDir = path.join(subDir, 'subagents');
          if (fs.existsSync(subAgentsDir)) {
            const subFiles = fs.readdirSync(subAgentsDir, { withFileTypes: true });
            for (const sf of subFiles) {
              if (sf.isFile() && sf.name.endsWith('.jsonl')) {
                files.push({
                  filePath: path.join(subAgentsDir, sf.name),
                  projectKey,
                  sessionId: entry.name,
                  isSubagent: true,
                });
              }
            }
          }
        }
      }
    } catch {
      // Skip unreadable project dirs
    }
  }

  return files;
}

async function parseSessionFile(filePath, projectKey, sessionId) {
  const messages = [];
  let fileStream;
  try {
    fileStream = fs.createReadStream(filePath);
  } catch {
    return messages;
  }

  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.type === 'user' && entry.message) {
      const content = entry.message.content;
      let promptText = '';
      let hasImage = false;
      let hasToolResult = false;

      if (typeof content === 'string') {
        promptText = content;
      } else if (Array.isArray(content)) {
        for (const part of content) {
          if (part.type === 'text') promptText += part.text || '';
          if (part.type === 'image') hasImage = true;
          // Detect tool_result entries — these are bash/file outputs injected by Claude Code,
          // not the human's actual typed prompt. Skip messages that are purely tool results.
          if (part.type === 'tool_result') hasToolResult = true;
        }
      }

      // Skip messages that are only tool results with no human text — they
      // distort verbosity and cluster metrics (bash output, file reads, etc.)
      const isHumanPrompt = promptText.trim().length > 0 && !hasToolResult;

      messages.push({
        type: 'user',
        timestamp: new Date(entry.timestamp).getTime(),
        sessionId: entry.sessionId || sessionId,
        projectKey,
        promptText: promptText.trim(),
        hasImage,
        isHumanPrompt,
        promptId: entry.promptId,
        cwd: entry.cwd || '',
      });
    } else if (entry.type === 'assistant' && entry.message) {
      const msg = entry.message;
      const usage = msg.usage || {};
      messages.push({
        type: 'assistant',
        timestamp: new Date(entry.timestamp).getTime(),
        sessionId: entry.sessionId || sessionId,
        projectKey,
        model: msg.model || '',
        usage: {
          input_tokens: usage.input_tokens || 0,
          cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
          cache_read_input_tokens: usage.cache_read_input_tokens || 0,
          output_tokens: usage.output_tokens || 0,
        },
      });
    }
  }

  return messages;
}

async function parseHistoryFile() {
  const historyPath = getHistoryPath();
  const entries = [];

  if (!fs.existsSync(historyPath)) return entries;

  const rl = readline.createInterface({
    input: fs.createReadStream(historyPath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.display !== undefined) {
        entries.push({
          display: entry.display || '',
          timestamp: entry.timestamp || 0,
          project: entry.project || '',
          sessionId: entry.sessionId || '',
        });
      }
    } catch {
      // skip malformed lines
    }
  }

  return entries;
}

async function collectAllMessages() {
  const sessionFiles = collectSessionFiles();
  const allMessages = [];

  for (const sf of sessionFiles) {
    const msgs = await parseSessionFile(sf.filePath, sf.projectKey, sf.sessionId);
    allMessages.push(...msgs);
  }

  // Sort by timestamp
  allMessages.sort((a, b) => a.timestamp - b.timestamp);
  return allMessages;
}

module.exports = { collectSessionFiles, parseSessionFile, parseHistoryFile, collectAllMessages };
