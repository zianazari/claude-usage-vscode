const vscode = require('vscode');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

let item;
let timer;
let last;

function readToken() {
  return new Promise((resolve) => {
    const fromFile = () => {
      try {
        const p = path.join(os.homedir(), '.claude', '.credentials.json');
        resolve(JSON.parse(fs.readFileSync(p, 'utf8')).claudeAiOauth.accessToken);
      } catch {
        resolve(null);
      }
    };
    if (process.platform !== 'darwin') return fromFile();
    execFile('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], (err, out) => {
      if (err) return fromFile();
      try {
        resolve(JSON.parse(out).claudeAiOauth.accessToken);
      } catch {
        fromFile();
      }
    });
  });
}

function fetchUsage(token) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      'https://api.anthropic.com/api/oauth/usage',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'anthropic-beta': 'oauth-2025-04-20',
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function palette() {
  const kind = vscode.window.activeColorTheme.kind;
  const light = kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight;
  return light
    ? { text: '#3b3b3b', muted: '#6f6f6f', track: '#d3e3f5', fill: '#005fb8', warn: '#bf8803', error: '#cd3131' }
    : { text: '#cccccc', muted: '#9d9d9d', track: '#264060', fill: '#3794ff', warn: '#cca700', error: '#f14c4c' };
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Copilot-style row: label on the left, percent on the right, thin rounded bar underneath.
function barRow(label, pct, colors, small = false) {
  const w = 340;
  const fontSize = small ? 12 : 13;
  const barY = small ? 22 : 26;
  const barH = small ? 2 : 3;
  const h = barY + barH + 2;
  const clamped = Math.max(0, Math.min(pct, 100));
  const fill = pct >= 90 ? colors.error : pct >= 75 ? colors.warn : colors.fill;
  const fillW = clamped === 0 ? 0 : Math.max(barH, (clamped / 100) * w);
  const font = `font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="${fontSize}"`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<text x="0" y="${fontSize + 2}" fill="${colors.text}" ${font}>${escapeXml(label)}</text>` +
    `<text x="${w}" y="${fontSize + 2}" fill="${colors.text}" text-anchor="end" ${font}>${Math.round(pct)}%</text>` +
    `<rect x="0" y="${barY}" width="${w}" height="${barH}" rx="${barH / 2}" fill="${colors.track}"/>` +
    (fillW ? `<rect x="0" y="${barY}" width="${fillW}" height="${barH}" rx="${barH / 2}" fill="${fill}"/>` : '') +
    `</svg>`;
  return `![${escapeXml(label)}](data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')})\n\n`;
}

function formatReset(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const mins = Math.max(0, Math.round((d - Date.now()) / 60000));
  const rel = mins >= 60 * 24
    ? `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`
    : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  const when = d.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
  return `${when} (in ${rel})`;
}

function muted(text, colors) {
  return `<span style="color:${colors.muted};">${text}</span>\n\n`;
}

function render(data) {
  const colors = palette();
  const session = data.five_hour;
  const weekly = data.seven_day;
  const main = Math.round(session?.utilization ?? weekly?.utilization ?? 0);

  item.text = `$(graph) Claude Usage ${main}%`;
  const worst = Math.max(session?.utilization ?? 0, weekly?.utilization ?? 0);
  item.backgroundColor = worst >= 90
    ? new vscode.ThemeColor('statusBarItem.errorBackground')
    : worst >= 75
      ? new vscode.ThemeColor('statusBarItem.warningBackground')
      : undefined;

  const settingsArgs = encodeURIComponent(JSON.stringify(['claudeUsage']));
  let md = `**Claude Usage** &nbsp;&nbsp; [$(settings)](command:workbench.action.openSettings?${settingsArgs} "Settings")\n\n`;

  if (session) {
    md += barRow('Current session', session.utilization ?? 0, colors);
    md += muted(`Session resets ${formatReset(session.resets_at)}.`, colors);
  }
  if (weekly) md += barRow('Weekly (all models)', weekly.utilization ?? 0, colors);
  if (data.seven_day_opus) md += barRow('Weekly (Opus)', data.seven_day_opus.utilization ?? 0, colors);
  if (data.seven_day_sonnet) md += barRow('Weekly (Sonnet)', data.seven_day_sonnet.utilization ?? 0, colors);
  if (weekly) md += muted(`Weekly allowance resets ${formatReset(weekly.resets_at)}.`, colors);

  const rows = data.seven_day_breakdown?.rows?.filter((r) => r.percent > 0);
  if (rows?.length) {
    md += `---\n\n**This week by product**\n\n`;
    for (const r of rows) md += barRow(r.display_name, r.percent, colors, true);
  }

  md += `---\n\n[$(refresh) Refresh](command:claudeUsage.refresh "Refresh now") &nbsp; ` +
    muted(`Updated ${new Date().toLocaleTimeString('en-US', { timeStyle: 'short' })}`, colors).trim();

  const tip = new vscode.MarkdownString(md, true);
  tip.supportHtml = true;
  tip.isTrusted = true;
  item.tooltip = tip;
}

async function refresh() {
  try {
    const token = await readToken();
    if (!token) throw new Error('Not signed in to Claude Code');
    last = await fetchUsage(token);
    render(last);
  } catch (e) {
    item.text = '$(graph) Claude Usage –';
    item.backgroundColor = undefined;
    item.tooltip = `Claude Usage: ${e.message}. If the token expired, run any Claude Code prompt to refresh it, then click to retry.`;
  }
}

function schedule() {
  clearInterval(timer);
  const mins = vscode.workspace.getConfiguration('claudeUsage').get('refreshMinutes', 5);
  timer = setInterval(refresh, mins * 60000);
}

function activate(context) {
  item = vscode.window.createStatusBarItem('claudeUsage', vscode.StatusBarAlignment.Right, 100);
  item.name = 'Claude Usage';
  item.command = 'claudeUsage.refresh';
  item.text = '$(graph) Claude Usage';
  item.show();

  context.subscriptions.push(
    item,
    vscode.commands.registerCommand('claudeUsage.refresh', refresh),
    vscode.window.onDidChangeActiveColorTheme(() => last && render(last)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('claudeUsage')) schedule();
    }),
    { dispose: () => clearInterval(timer) }
  );

  refresh();
  schedule();
}

function deactivate() {}

module.exports = { activate, deactivate };
