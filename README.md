# Port Manager

**A cross-platform CLI tool for intelligent port management across multiple git worktrees and development environments.**

Port Manager eliminates port conflicts when running multiple instances of the same project by automatically allocating unique ports from configurable pools. No more "port already in use" errors or manual port juggling between worktrees.

## Key Features

- **Automatic Port Allocation** - Get unique ports from predefined pools (frontend, backend, storybook, etc.)
- **Git-Aware** - Automatically groups port reservations by each git repository (and by worktree within repositories)
- **Tagged Leases** - Use tags to lease multiple ports from the same pool (e.g., 'http', 'https', 'api', 'worker')
- **Pool Management** - Create, update, and delete custom pools on the fly
- **Environment Variables** - Outputs shell commands to set all leased ports as environment variables
- **Stale Lease Cleanup** - Automatically detect and remove expired port leases
- **Concurrency Safe** - File locking prevents race conditions across multiple processes
- **Cross-Platform** - Works seamlessly on Windows, macOS, and Linux
- **Zero Configuration** - Auto-creates registry with sensible defaults on first use
- **No Installation Required** - Use without installation via `npx` or `pnpm dlx`

## Installation

Install globally with your preferred package manager:

```bash
# Using npm
npm install -g port-manager

# Using pnpm
pnpm install -g port-manager

# Using yarn
yarn global add port-manager
```

Or use without installation:

```bash
# Using npx
npx port-manager lease frontend

# Using pnpm dlx
pnpm dlx port-manager lease frontend
```

## Why Port Manager?

When running multiple git worktrees of the same project, port collisions occur because:
- Each server tries to use the same hardcoded port (e.g., 5000)
- Each frontend dev server tries to use the same port (e.g., 3000)
- The frontend proxy configuration points to a fixed backend port

Port Manager solves this by:
- Allocating unique ports from defined pools
- Tracking leases in a central registry (`~/.port-manager/registry.json`)
- Supporting both manual and automatic project detection
- Working cross-platform (Windows, macOS, Linux)

## Quick Start

```bash
# Initialize the registry (optional - auto-created on first use)
port-manager init

# Lease ports (specify the pool name)
port-manager lease frontend    # Returns: 3300
port-manager lease backend     # Returns: 5300

# Lease multiple ports from same pool using tags
port-manager lease backend http    # Returns: 5301
port-manager lease backend https   # Returns: 5302

# Use the ports in your scripts
vite --port $(port-manager lease frontend)

# Export all leased ports as environment variables in your shell
eval $(port-manager env)    # Bash/Zsh - evaluates the output to set variables
# Now you can use $FRONTEND_PORT, $BACKEND_PORT, etc. in your shell session

# List your current leases
port-manager list
# Or use the shorter alias
port-manager ls

# List all leases globally
port-manager list -g
# Or
port-manager ls -g

# Release all leases for current project
port-manager release

# Release a specific tagged lease
port-manager release http
```

## Commands

| Action | Description |
|--------|-------------|
| `init` | Initialize a new registry with default pools |
| `init --force` | Reinitialize registry (overwrites existing) |
| `lease <pool> [tag]` | Get next available port from a pool with optional tag |
| `release [tag]` | Release all leased ports (or specific tag) for current project |
| `list` or `ls` | Show current project leases |
| `list -g` or `ls -g` | Show all leases globally |
| `check <pool> [tag]` | Check if a pool has available ports |
| `cleanup` | Remove stale leases |
| `env` | Output shell commands to export leased ports as environment variables |
| `pool list` or `pool ls` | Show all configured pools and their ranges |
| `pool <name> list` or `pool <name> ls` | Show reserved ports in a specific pool |
| `pool add <name> <start> <end>` | Add a new pool |
| `pool update <name> <start> <end>` | Update pool range |
| `pool delete <name>` | Delete a pool (warns if leases exist) |
| `pool clear <name>` | Remove all leases for a specific pool |
| `help` | Show help message |

### Options

| Option | Long Form | Description |
|--------|-----------|-------------|
| `-p` | `--pool <name>` | Filter by pool (for list command) |
| `-g` | `--global` | Show all leases, not just current project |
| | `--dry-run` | Preview cleanup without removing |
| `-f` | `--force` | Force initialization (overwrites existing registry) |
| `-h` | `--help` | Show help message |

## Examples

```bash
# Initialize registry (optional - auto-created on first use)
port-manager init

# Reinitialize registry with defaults (wipes existing leases)
port-manager init --force

# Basic usage
port-manager lease frontend
port-manager lease backend
port-manager lease storybook

# Tagged leases (multiple ports from same pool)
port-manager lease backend http
port-manager lease backend https
port-manager lease backend api

# View your leases
port-manager list
# Or use the shorter alias
port-manager ls

# View all leases on the system
port-manager list -g
# Or
port-manager ls -g

# Filter by pool
port-manager list --pool frontend
# Or
port-manager ls --pool frontend

# Export leased ports as environment variables (evaluates output to set vars)
eval $(port-manager env)          # Bash/Zsh - sets $FRONTEND_PORT, $BACKEND_PORT, etc.
Invoke-Expression (port-manager env | Out-String)  # PowerShell - sets $env:FRONTEND_PORT, etc.

# Check if a pool has available ports
port-manager check frontend       # Check frontend pool
port-manager check backend http   # Check backend pool for tag 'http'

# Clean up stale leases (preview first)
port-manager cleanup --dry-run
port-manager cleanup

# Release leases
port-manager release              # Release all for current project
port-manager release http         # Release port with tag 'http'

# Pool management
port-manager pool list                    # Show all pools
port-manager pool ls                      # Same as 'pool list'
port-manager pool frontend list           # Show reserved ports in frontend pool
port-manager pool frontend ls             # Same as 'pool frontend list'
port-manager pool add api 8000 8099       # Add new pool
port-manager pool update backend 5000 5999 # Update pool range
port-manager pool clear frontend          # Remove all leases from pool
port-manager pool delete api              # Delete pool
```

## How It Works

### Automatic Project Detection

When you run any command, the project is automatically detected from the git root:
- Walks up from current directory to find `.git` folder
- Uses the git root path as the identifier
- Stores the git root path as `worktreePath` for stale detection
- All commands work automatically without any configuration

### Port Pools

Default port pools are defined in `~/.port-manager/registry.json`:

```json
{
  "version": "1.0",
  "pools": {
    "frontend": { "rangeStart": 3300, "rangeEnd": 3499 },
    "backend": { "rangeStart": 5300, "rangeEnd": 5499 },
    "storybook": { "rangeStart": 6300, "rangeEnd": 6499 }
  },
  "leases": []
}
```

You can customize these pools by:
- Editing the registry file directly at `~/.port-manager/registry.json`
- Using the `port-manager pool` commands to add, update, or delete pools
- The registry is automatically created on first use with default pools

### Tagged Leases

Tags allow you to lease multiple ports from the same pool for different purposes:

```bash
port-manager lease backend http     # Lease port for HTTP server
port-manager lease backend https    # Lease port for HTTPS server
port-manager lease backend api      # Lease port for API server
```

Each tag creates a separate lease within the pool:
- The same project can have multiple leases from the same pool with different tags
- Leasing the same tag twice returns the same port (idempotent)
- The `env` command outputs tagged variables: `BACKEND_HTTP_PORT`, `BACKEND_HTTPS_PORT`, `BACKEND_API_PORT`
- Release specific tags with `port-manager release <tag>`

### Stale Detection

A lease is considered stale if:
- `worktreePath` is set but the directory no longer exists, OR
- Lease is older than 7 days AND the port is not currently in use

Run `port-manager cleanup` to remove stale leases.

### Concurrency

File locking prevents race conditions:
- Lock file created at `~/.port-manager/registry.json.lock`
- Stale locks (>60 seconds) are automatically removed
- 30-second timeout waiting for lock

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Port unavailable (leased or in use) |
| 2 | Pool exhausted (no ports available) |
| 3 | Lock timeout |
| 4 | Invalid input |

## Development

```bash
# Clone the repository
git clone <repo-url>
cd port-manager

# Install dependencies
pnpm install

# Link for local development
pnpm link --global

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch
```

## Publishing to NPM

This package uses GitHub Actions for automated publishing with provenance attestation.

**Using Claude Code (Recommended):**
```
/release patch    # Fully guided release process
/release minor
/release major
/release beta
```

**Quick Release Script:**
```bash
./scripts/release.sh patch    # Bug fixes (1.0.0 → 1.0.1)
./scripts/release.sh minor    # New features (1.0.0 → 1.1.0)
./scripts/release.sh major    # Breaking changes (1.0.0 → 2.0.0)
./scripts/release.sh beta     # Beta pre-release
```

**Or use npm scripts:**
```bash
pnpm run release:patch    # Bug fixes
pnpm run release:minor    # New features
pnpm run release:major    # Breaking changes
pnpm run release:beta     # Beta pre-release
```

See [RELEASING.md](RELEASING.md) for detailed release instructions and troubleshooting.

**Manual Publishing (first release only):**
```bash
pnpm publish --provenance
```

See [.github/NPM_PUBLISHING_SETUP.md](.github/NPM_PUBLISHING_SETUP.md) for setup instructions.

## Migration from Shell Scripts

This package replaces the previous PowerShell and Bash scripts with a single cross-platform Node.js implementation. The functionality remains the same, with improved:
- Cross-platform compatibility
- No external dependencies (jq, etc.)
- Easier distribution via pnpm/npm
- Better error handling

### Directory Location

The registry is now stored in `~/.port-manager/registry.json` instead of `~/.ports/registry.json`. If you have an existing registry at the old location, you can either:
- Move it: `mv ~/.ports ~/.port-manager`
- Or start fresh: `port-manager init`

## License

MIT
