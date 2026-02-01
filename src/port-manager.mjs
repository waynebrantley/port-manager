#!/usr/bin/env node

import { PortManagerAPI } from './lib/core-api.mjs';
import { REGISTRY_PATH } from './lib/registry.mjs';

// Exit codes
const EXIT_SUCCESS = 0;
const EXIT_PORT_UNAVAILABLE = 1;
const EXIT_POOL_EXHAUSTED = 2;
const EXIT_LOCK_TIMEOUT = 3;
const EXIT_INVALID_INPUT = 4;

// Create API instance
const api = new PortManagerAPI();

/**
 * Parse command-line arguments.
 */
function parseArgs(args) {
  const parsed = {
    action: null,
    subAction: null,
    pool: null,
    poolName: null,
    tag: undefined,
    port: null,
    rangeStart: null,
    rangeEnd: null,
    identifier: null,
    worktreePath: null,
    dryRun: false,
    global: false,
    help: false,
    force: false
  };

  let i = 0;
  while (i < args.length) {
    let arg = args[i];

    // Normalize 'ls' to 'list' for consistency
    if (arg === 'ls') {
      arg = 'list';
    }

    if (['lease', 'release', 'list', 'check', 'cleanup', 'env', 'init', 'pool', 'help'].includes(arg)) {
      parsed.action = arg;
      // For pool command, next arg is the sub-action or pool name
      if (arg === 'pool' && i + 1 < args.length) {
        i++;
        let nextArg = args[i];

        // Normalize 'ls' to 'list' for pool sub-actions
        if (nextArg === 'ls') {
          nextArg = 'list';
        }

        // Check if it's a sub-action keyword or a pool name
        if (['list', 'add', 'delete', 'update', 'clear'].includes(nextArg)) {
          parsed.subAction = nextArg;
        } else {
          // It's a pool name, so the sub-action comes after
          parsed.poolName = nextArg;
          if (i + 1 < args.length) {
            i++;
            let subActionArg = args[i];
            // Normalize 'ls' to 'list'
            if (subActionArg === 'ls') {
              subActionArg = 'list';
            }
            parsed.subAction = subActionArg;
          }
        }

        // For pool commands that need a pool name (if not already set)
        if (['add', 'delete', 'update', 'clear'].includes(parsed.subAction) && !parsed.poolName && i + 1 < args.length) {
          i++;
          parsed.poolName = args[i];
        }

        // For add/update, we also need rangeStart and rangeEnd
        if (['add', 'update'].includes(parsed.subAction)) {
          if (i + 1 < args.length) {
            i++;
            parsed.rangeStart = parseInt(args[i], 10);
          }
          if (i + 1 < args.length) {
            i++;
            parsed.rangeEnd = parseInt(args[i], 10);
          }
        }
      }
    } else if (arg === '-p' || arg === '--pool') {
      parsed.pool = args[++i];
    } else if (arg === '--port') {
      parsed.port = parseInt(args[++i], 10);
    } else if (arg === '--identifier' || arg === '--id' || arg === '-i') {
      parsed.identifier = args[++i];
    } else if (arg === '--worktree-path' || arg === '--path') {
      parsed.worktreePath = args[++i];
    } else if (arg === '--dry-run') {
      parsed.dryRun = true;
    } else if (arg === '-g' || arg === '--global') {
      parsed.global = true;
    } else if (arg === '-f' || arg === '--force') {
      parsed.force = true;
    } else if (arg === '-h' || arg === '--help') {
      parsed.help = true;
    } else if (!arg.startsWith('-')) {
      // Positional argument
      if (!parsed.action) {
        parsed.action = arg;
      } else if (parsed.action === 'lease') {
        // For lease: first arg is pool, second arg (optional) is tag
        if (!parsed.pool) {
          parsed.pool = arg;
        } else if (parsed.tag === undefined) {
          parsed.tag = arg;
        }
      } else if (parsed.action === 'release') {
        // For release: if no --port flag, first positional arg is tag
        if (parsed.tag === undefined && !parsed.port) {
          parsed.tag = arg;
        }
      }
    }

    i++;
  }

  return parsed;
}

/**
 * Show help message.
 */
function showHelp() {
  console.log(`
Port Manager - Manage unique port allocations across git worktrees

USAGE:
  port-manager <action> [options]

ACTIONS:
  init                          Initialize a new registry (creates ~/.port-manager/registry.json)
  lease <pool> [tag]            Allocate a port from a pool with optional tag
  release [tag]                 Release leased ports (all or by tag)
  list | ls                     Show current project leases
  check <pool> [tag]            Check if a pool has available ports
  cleanup                       Remove stale leases
  env                           Output environment variable commands
  pool list | ls                Show all configured pools and their ranges
  pool <name> list | ls         Show reserved ports in a specific pool
  pool add <name> <start> <end> Add a new pool
  pool update <name> <start> <end> Update pool range
  pool delete <name>            Delete a pool (warns if leases exist)
  pool clear <name>             Remove all leases for a pool
  help                          Show this help message

OPTIONS:
  -p, --pool <name>       Filter by pool (for list command)
  -g, --global            Show all leases, not just current project
      --dry-run           Preview cleanup without removing
  -f, --force             Force initialization (overwrites existing registry)
  -h, --help              Show this help message

EXAMPLES:
  port-manager init
  port-manager lease frontend           # Lease a port from frontend pool
  port-manager lease backend http       # Lease a port with tag 'http'
  port-manager lease backend https      # Lease another port with tag 'https'
  port-manager ls                       # Show all leases for current project
  port-manager ls -g                    # Show all leases globally
  port-manager env                      # Export ports as environment variables
  port-manager release                  # Release all ports for current project
  port-manager release http             # Release port with tag 'http'
  port-manager check frontend           # Check if frontend pool has available ports
  port-manager check backend http       # Check if backend pool has ports for tag 'http'
  port-manager cleanup --dry-run

  # Pool management
  port-manager pool ls
  port-manager pool frontend ls         # Show reserved ports in frontend pool
  port-manager pool add api 8000 8099
  port-manager pool update backend 5000 5999
  port-manager pool clear frontend
  port-manager pool delete api

NOTES:
  - Project identifier and path are auto-detected from git root
  - Tags allow multiple leases from the same pool (e.g., 'http', 'https', 'api', 'worker')
  - 'env' outputs environment variables like BACKEND_HTTP_PORT, BACKEND_HTTPS_PORT
  - 'list' or 'ls' shows only current project by default; use -g/--global for all
  - Bash/Zsh: eval $(port-manager env)
  - PowerShell: Invoke-Expression (port-manager env | Out-String)
  - 'init' creates a new registry with default pools (use --force to overwrite)
`);
}

/**
 * Lease a port from a pool.
 */
async function doLease(pool, tag, identifier, worktreePath) {
  try {
    const result = await api.lease(pool, tag, identifier, worktreePath);
    console.log(result.port);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (err.message.includes('exhausted')) {
      process.exit(EXIT_POOL_EXHAUSTED);
    } else if (err.message.includes('git repository')) {
      process.exit(EXIT_INVALID_INPUT);
    } else {
      process.exit(EXIT_INVALID_INPUT);
    }
  }
}

/**
 * Release leased ports.
 */
async function doRelease(tag, identifier) {
  try {
    const result = await api.release(tag, identifier);
    console.log(`Released ${result.removedCount} lease(s)`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(EXIT_PORT_UNAVAILABLE);
  }
}

/**
 * List leases.
 */
async function doList(filterPool, showGlobal) {
  const leases = await api.list(filterPool, showGlobal);

  if (leases.length === 0) {
    console.log('No active leases');
    return;
  }

  // Print header
  console.log('PORT   POOL          TAG        IDENTIFIER                      LEASED AT');
  console.log('----   ----          ---        ----------                      ---------');

  // Print leases
  for (const lease of leases) {
    const port = String(lease.port).padEnd(6);
    const pool = (lease.pool || '').padEnd(13);
    const tag = (lease.tag || '').padEnd(10);
    const id = (lease.identifier || '').substring(0, 30).padEnd(31);
    const date = lease.leasedAt || '';
    console.log(`${port} ${pool} ${tag} ${id} ${date}`);
  }
}

/**
 * Check if a port is available.
 */
async function doCheck(port) {
  try {
    const result = await api.check(port);

    if (result.leased) {
      console.log(`Port ${port} is leased by '${result.details.identifier}' (pool: ${result.details.pool})`);
      process.exit(EXIT_PORT_UNAVAILABLE);
    }

    if (result.inUse) {
      console.log(`Port ${port} is in use by another process (not registered)`);
      process.exit(EXIT_PORT_UNAVAILABLE);
    }

    console.log(`Port ${port} is available`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(EXIT_INVALID_INPUT);
  }
}

/**
 * Clean up stale leases.
 */
async function doCleanup(isDryRun) {
  const result = await api.cleanup(isDryRun);

  if (result.staleLeases.length === 0) {
    console.log('No stale leases found');
    return;
  }

  console.log(`Found ${result.staleLeases.length} stale lease(s):`);
  for (const { lease, reason } of result.staleLeases) {
    console.log(`  Port ${lease.port} (${lease.identifier}): ${reason}`);
  }

  if (isDryRun) {
    console.log('\n(Dry run - no changes made)');
  } else {
    console.log(`\nRemoved ${result.removedCount} stale lease(s)`);
  }
}

/**
 * Output environment variable commands.
 */
async function doEnv() {
  try {
    const envVars = await api.env();

    // Detect shell from environment or parent process
    const shell = process.env.SHELL || '';
    const isWindows = process.platform === 'win32';
    const isPowerShell = isWindows || shell.includes('powershell') || shell.includes('pwsh');

    // Output environment variable commands
    for (const [varName, port] of Object.entries(envVars)) {
      if (isPowerShell) {
        console.log(`$env:${varName} = ${port}`);
      } else {
        console.log(`export ${varName}=${port}`);
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(EXIT_PORT_UNAVAILABLE);
  }
}

/**
 * Initialize a new registry.
 */
async function doInit(force) {
  try {
    await api.init(force);
    console.log(`Initialized new registry at ${REGISTRY_PATH}`);
    console.log('\nDefault pools:');
    console.log('  frontend:  3300-3499');
    console.log('  backend:   5300-5499');
    console.log('  storybook: 6300-6499');
    console.log(`\nEdit ${REGISTRY_PATH} to customize port ranges.`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    console.error('Use --force to overwrite');
    process.exit(EXIT_INVALID_INPUT);
  }
}

/**
 * Handle pool management commands.
 */
async function doPool(subAction, poolName, rangeStart, rangeEnd) {
  if (!subAction) {
    console.error('Error: Pool sub-command required (list, add, update, delete, clear)');
    process.exit(EXIT_INVALID_INPUT);
  }

  switch (subAction) {
    case 'list':
      await doPoolList(poolName);
      break;
    case 'add':
      await doPoolAdd(poolName, rangeStart, rangeEnd);
      break;
    case 'update':
      await doPoolUpdate(poolName, rangeStart, rangeEnd);
      break;
    case 'delete':
      await doPoolDelete(poolName);
      break;
    case 'clear':
      await doPoolClear(poolName);
      break;
    default:
      console.error(`Error: Unknown pool sub-command: ${subAction}`);
      console.error('Valid sub-commands: list, add, update, delete, clear');
      process.exit(EXIT_INVALID_INPUT);
  }
}

/**
 * List all pools or show details for a specific pool.
 */
async function doPoolList(poolName) {
  try {
    if (poolName) {
      const poolInfo = await api.poolList(poolName);

      console.log(`\nPool: ${poolInfo.name}`);
      console.log(`Range: ${poolInfo.rangeStart}-${poolInfo.rangeEnd} (${poolInfo.totalPorts} total ports)`);
      console.log(`Reserved: ${poolInfo.reservedCount} port(s)\n`);

      if (poolInfo.leases.length === 0) {
        console.log('No ports currently reserved in this pool');
      } else {
        console.log('PORT   TAG        IDENTIFIER                           LEASED AT');
        console.log('----   ---        ----------                           ---------');

        for (const lease of poolInfo.leases) {
          const port = String(lease.port).padEnd(6);
          const tag = (lease.tag || '').padEnd(10);
          const id = (lease.identifier || '').substring(0, 40).padEnd(40);
          const date = lease.leasedAt || '';
          console.log(`${port} ${tag} ${id} ${date}`);
        }
      }
    } else {
      const pools = await api.poolList();

      if (pools.length === 0) {
        console.log('No pools configured');
        return;
      }

      console.log('POOL          RANGE START    RANGE END      TOTAL PORTS');
      console.log('----          -----------    ---------      -----------');

      for (const pool of pools) {
        const name = pool.name.padEnd(13);
        const start = String(pool.rangeStart).padEnd(14);
        const end = String(pool.rangeEnd).padEnd(14);
        const total = pool.rangeEnd - pool.rangeStart + 1;
        console.log(`${name} ${start} ${end} ${total}`);
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(EXIT_INVALID_INPUT);
  }
}

/**
 * Add a new pool.
 */
async function doPoolAdd(poolName, rangeStart, rangeEnd) {
  try {
    await api.poolAdd(poolName, rangeStart, rangeEnd);
    console.log(`Added pool '${poolName}' with range ${rangeStart}-${rangeEnd}`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (!poolName || !rangeStart || !rangeEnd) {
      console.error('Usage: port-manager pool add <name> <start> <end>');
    }
    process.exit(EXIT_INVALID_INPUT);
  }
}

/**
 * Update a pool's range.
 */
async function doPoolUpdate(poolName, rangeStart, rangeEnd) {
  try {
    await api.poolUpdate(poolName, rangeStart, rangeEnd);
    console.log(`Updated pool '${poolName}' to range ${rangeStart}-${rangeEnd}`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (err.message.includes('outside the new range')) {
      console.error('\nPlease release these leases first or choose a different range.');
    } else if (!poolName || !rangeStart || !rangeEnd) {
      console.error('Usage: port-manager pool update <name> <start> <end>');
    }
    process.exit(EXIT_INVALID_INPUT);
  }
}

/**
 * Delete a pool.
 */
async function doPoolDelete(poolName) {
  try {
    await api.poolDelete(poolName);
    console.log(`Deleted pool '${poolName}'`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (err.message.includes('active lease(s)')) {
      console.error('Please release or clear these leases first, or they will remain orphaned.');
      console.error('Use: port-manager pool clear ${poolName}');
    } else if (!poolName) {
      console.error('Usage: port-manager pool delete <name>');
    }
    process.exit(EXIT_INVALID_INPUT);
  }
}

/**
 * Clear all leases for a pool.
 */
async function doPoolClear(poolName) {
  try {
    const result = await api.poolClear(poolName);

    if (result.removedCount === 0) {
      console.log(`No leases found for pool '${poolName}'`);
    } else {
      console.log(`Cleared ${result.removedCount} lease(s) from pool '${poolName}'`);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (!poolName) {
      console.error('Usage: port-manager pool clear <name>');
    }
    process.exit(EXIT_INVALID_INPUT);
  }
}

/**
 * Main entry point.
 */
async function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  if (!parsed.action || parsed.action === 'help' || parsed.help) {
    showHelp();
    process.exit(EXIT_SUCCESS);
  }

  try {
    switch (parsed.action) {
      case 'init':
        await doInit(parsed.force);
        break;
      case 'lease':
        await doLease(parsed.pool, parsed.tag, parsed.identifier, parsed.worktreePath);
        break;
      case 'release':
        await doRelease(parsed.tag, parsed.identifier);
        break;
      case 'list':
        await doList(parsed.pool, parsed.global);
        break;
      case 'check':
        await doCheck(parsed.port);
        break;
      case 'cleanup':
        await doCleanup(parsed.dryRun);
        break;
      case 'env':
        await doEnv();
        break;
      case 'pool':
        await doPool(parsed.subAction, parsed.poolName, parsed.rangeStart, parsed.rangeEnd);
        break;
      default:
        console.error(`Error: Unknown action: ${parsed.action}`);
        console.error('Use --help for usage information');
        process.exit(EXIT_INVALID_INPUT);
    }
  } catch (err) {
    if (err.message.includes('Failed to acquire lock')) {
      console.error(`Error: ${err.message}`);
      process.exit(EXIT_LOCK_TIMEOUT);
    }
    throw err;
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
