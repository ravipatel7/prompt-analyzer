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

  // Base64-encode the JSON so no HTML/script injection is possible.
  // The template decodes it with atob() — safe regardless of what prompt
  // text the user has typed (</script>, </body>, backticks, etc.)
  const b64 = Buffer.from(JSON.stringify(analysisResult)).toString('base64');

  const html = template
    .replace('{{REPORT_DATA_B64}}', b64)
    .replace('{{GENERATED_AT}}', generatedAt);

  fs.writeFileSync(outputPath, html, 'utf8');
  return outputPath;
}

module.exports = { generate };
