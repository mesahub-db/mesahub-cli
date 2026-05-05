#!/usr/bin/env node
import { Command } from 'commander'
import { registerAuthCommands } from './commands/auth.js'
import { registerDatabaseCommands } from './commands/databases.js'
import { registerKeyCommands } from './commands/keys.js'

const program = new Command()

program
  .name('mesahub')
  .description('CLI for MesaHub — manage databases and API keys')
  .version('0.2.0')

registerAuthCommands(program)
registerDatabaseCommands(program)
registerKeyCommands(program)

program.parse(process.argv)
