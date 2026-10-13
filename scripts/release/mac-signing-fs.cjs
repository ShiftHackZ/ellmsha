// Only the signed macOS electron-builder child loads this preload. osx-sign's
// parallel binary scan captures native fs.open before its fs-extra queue can help.
const fs = require('node:fs');
const { createRequire } = require('node:module');

// Follow the exact installed CLI's dependency graph (also works with Bun links).
const builderRequire = createRequire(fs.realpathSync(process.argv[1]));
const fsExtraRequire = createRequire(builderRequire.resolve('fs-extra'));
const gracefulFs = fsExtraRequire('graceful-fs');
// graceful-fs also hooks close to resume queued opens. Keep all other native fs
// behavior, including permission errors, unchanged; never skip signing candidates.
fs.open = gracefulFs.open;
console.log('[release] macOS signing file-open queue enabled', process.report.getReport().userLimits.open_files);
