'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function generate(analysisResult) {
  const templatePath = path.join(__dirname, '..', '..', 'templates', 'report.html');
  const template = fs.readFileSync(templatePath, 'utf8');

  const timestamp = Date.now();
  const generatedAt = new Date(timestamp).toISOString();
  const outputPath = path.join(os.tmpdir(), `prompt-analysis-${timestamp}.html`);

  // Escape all non-ASCII characters before base64-encoding so atob() in the browser
  // (which only handles Latin-1) can safely decode multi-byte UTF-8 content like emoji.
  const json = JSON.stringify(analysisResult).replace(/[^\x00-\x7F]/g, c => {
    const cp = c.codePointAt(0);
    if (cp > 0xFFFF) {
      const hi = 0xD800 + Math.floor((cp - 0x10000) / 0x400);
      const lo = 0xDC00 + (cp - 0x10000) % 0x400;
      return `\\u${hi.toString(16).padStart(4,'0')}\\u${lo.toString(16).padStart(4,'0')}`;
    }
    return `\\u${cp.toString(16).padStart(4, '0')}`;
  });
  const b64 = Buffer.from(json).toString('base64');

  const html = template
    .replace('{{REPORT_DATA_B64}}', b64)
    .replace('{{GENERATED_AT}}', generatedAt);

  fs.writeFileSync(outputPath, html, 'utf8');
  return outputPath;
}

module.exports = { generate };
