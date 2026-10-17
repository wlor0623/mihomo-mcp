import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const INTERNET_SETTINGS_KEY =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

// InternetSetOption 的刷新选项: 39 = INTERNET_OPTION_SETTINGS_CHANGED, 37 = INTERNET_OPTION_REFRESH
const REFRESH_PS = `
Add-Type -Namespace Native -Name WinINet -MemberDefinition '[DllImport("wininet.dll", SetLastError=true)] public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);'
[Native.WinINet]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null
[Native.WinINet]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null
`;

const PWSH_CANDIDATES = ['pwsh.exe', 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'];

async function refreshWininet() {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', REFRESH_PS];
  let lastErr;
  for (const exe of PWSH_CANDIDATES) {
    try {
      await run(exe, args);
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  try {
    await run('powershell.exe', args);
  } catch {
    // 刷新通知失败不致命:大多数应用在新连接上会自己读注册表
    console.error(`[mihomo-mcp] WinINET refresh failed: ${lastErr?.message ?? 'unknown'}`);
  }
}

export async function getSystemProxy() {
  const { stdout } = await run('reg', ['query', INTERNET_SETTINGS_KEY, '/v', 'ProxyEnable']);
  const enabled = /ProxyEnable\s+REG_DWORD\s+0x1/i.test(stdout);
  let server = '';
  try {
    const r = await run('reg', ['query', INTERNET_SETTINGS_KEY, '/v', 'ProxyServer']);
    server = (r.stdout.match(/ProxyServer\s+REG_SZ\s+(\S+)/i) || [])[1] ?? '';
  } catch {
    // ProxyServer 不存在 = 未配置过
  }
  return { enabled, server };
}

export async function setSystemProxy(enable, server = '127.0.0.1:7890') {
  if (enable) {
    await run('reg', ['add', INTERNET_SETTINGS_KEY, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '1', '/f']);
    await run('reg', ['add', INTERNET_SETTINGS_KEY, '/v', 'ProxyServer', '/t', 'REG_SZ', '/d', server, '/f']);
  } else {
    await run('reg', ['add', INTERNET_SETTINGS_KEY, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '0', '/f']);
  }
  await refreshWininet();
  return { enabled: enable, server: enable ? server : '' };
}
