#!/usr/bin/env node
import { runCli } from '../dist/cli/index.js'

runCli(process.argv.slice(2))
  .then((exitCode) => {
    process.exit(typeof exitCode === 'number' ? exitCode : 0)
  })
  .catch((error) => {
    console.error(error?.stack ?? error)
    process.exit(2)
  })
