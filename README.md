# Claude Usage

A small VS Code extension that shows your Claude plan usage in the status bar.

> **Unofficial.** This extension is not made, endorsed or supported by Anthropic. "Claude" is a trademark of Anthropic.

The status bar shows the current session percentage, for example `Claude Usage 42%`. Hover over it to see a breakdown with progress bars:

- **Current session** (5-hour window) and when it resets
- **Weekly (all models)**, plus **Weekly (Opus)** and **Weekly (Sonnet)** when your plan reports them, and when the weekly allowance resets
- **This week by product**: usage per product, when available

The status bar item turns yellow at 75% and red at 90%. It uses whichever is higher, session or weekly usage.

## Requirements

- VS Code 1.80 or later
- [Claude Code](https://claude.com/claude-code), signed in with a Claude subscription. The extension reuses Claude Code's OAuth token and doesn't sign in on its own.

## How it works

1. The extension reads the Claude Code OAuth access token:
   - on macOS, from the Keychain entry `Claude Code-credentials`
   - otherwise, or if the Keychain lookup fails, from `~/.claude/.credentials.json`
2. It calls `https://api.anthropic.com/api/oauth/usage` with that token.
3. It renders the result in the status bar and in the hover tooltip.

The token is only sent to `api.anthropic.com`. Nothing is stored or logged.

> **Note:** The usage endpoint is not a documented public API and may change without notice.

## Installation

The extension has no build step and no dependencies.

**Option 1: link the folder into your extensions directory**

```sh
ln -s "$(pwd)" ~/.vscode/extensions/local.claude-usage
```

Then reload VS Code (**Developer: Reload Window**).

**Option 2: package it as a VSIX**

```sh
npx @vscode/vsce package
code --install-extension claude-usage-0.2.0.vsix
```

## Usage

- Click the status bar item, or run **Claude Usage: Refresh** from the Command Palette, to refresh now.
- Use the gear icon in the tooltip to open the extension's settings.

## Settings

| Setting                     | Default | Description                                |
| --------------------------- | ------- | ------------------------------------------ |
| `claudeUsage.refreshMinutes` | `5`     | How often to refresh usage, in minutes (minimum 1). |

## Troubleshooting

If the status bar shows `Claude Usage –`, hover over it to see the error.

- **Not signed in to Claude Code**: no token was found. Sign in to Claude Code first.
- **HTTP 401**: the token has probably expired. Run any prompt in Claude Code to refresh it, then click the status bar item to retry.
