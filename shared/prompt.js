'use strict';
const fs = require('node:fs');
const path = require('node:path');

function readPrompt() {
  // Write your own prompt in system-prompt.local.md, or set INVIS_SYSTEM_PROMPT_FILE.
  const file = process.env.INVIS_SYSTEM_PROMPT_FILE || path.join(__dirname, '..', 'system-prompt.local.md');
  try {
    return fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim();
  } catch (error) {
    if (error.code === 'ENOENT' && !process.env.INVIS_SYSTEM_PROMPT_FILE) return '';
    throw new Error('Cannot read the custom prompt file. Check INVIS_SYSTEM_PROMPT_FILE.');
  }
}
module.exports = {readPrompt};
