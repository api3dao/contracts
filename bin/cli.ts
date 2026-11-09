#!/usr/bin/env node

// package.json runs the CommonJS build of this file, as yargs' ES module build wraps help text
// mid-word.
import '../src/cli.js';
