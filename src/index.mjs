#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { mihomoRequest, channelName } from './lib/client.mjs';
import { getSystemProxy, setSystemProxy } from './lib/sysproxy.mjs';

const GROUP_TYPES = ['Selector', 'URLTest', 'Fallback', 'LoadBalance'];
const DEFAULT_TEST_URL = 'https://www.gstatic.com/generate_204';

const server = new McpServer({ name: 'mihomo-mcp', version: '0.1.0' });

const json = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const wrap = (fn) => async (args) => {
  try {
    return json(await fn(args ?? {}));
  } catch (e) {
    return json({ error: e.message ?? String(e) });
  }
};

server.tool('get_version', '查看 mihomo 内核版本和当前连接通道(命名管道/HTTP)', {}, wrap(async () => {
  const v = await mihomoRequest('GET', '/version');
  return { ...v, channel: channelName() };
}));

server.tool('list_proxies', '列出所有代理组(含每组当前选中节点和全部候选节点名)与节点延迟概览', {}, wrap(async () => {
  const { proxies } = await mihomoRequest('GET', '/proxies');
  const groups = [];
  const nodes = {};
  for (const p of Object.values(proxies)) {
    const lastDelay = p.history?.length ? p.history[p.history.length - 1].delay : 0;
    if (GROUP_TYPES.includes(p.type)) {
      groups.push({ name: p.name, type: p.type, now: p.now, all: p.all ?? [] });
    } else {
      nodes[p.name] = { type: p.type, alive: p.alive, delay: lastDelay };
    }
  }
  return { channel: channelName(), groups, nodes };
}));

server.tool('switch_proxy', '切换某个代理组的当前选中节点', {
  group: z.string().describe('代理组名'),
  name: z.string().describe('要切换到的节点名(必须是该组 all 列表里的名字)'),
}, wrap(async ({ group, name }) => {
  const g = await mihomoRequest('GET', `/proxies/${encodeURIComponent(group)}`);
  if (!g?.all?.includes(name)) {
    throw new Error(`组「${group}」中没有节点「${name}」。可用节点: ${(g?.all ?? []).join('、')}`);
  }
  await mihomoRequest('PUT', `/proxies/${encodeURIComponent(group)}`, { name });
  return { ok: true, group, now: name };
}));

server.tool('delay_test', '测延迟:传 name 测单个节点,传 group 测整组并给出最快的几个', {
  name: z.string().optional().describe('节点名'),
  group: z.string().optional().describe('代理组名(测整组)'),
  url: z.string().optional().describe('测速 URL,默认 gstatic generate_204'),
  timeout: z.number().optional().describe('超时毫秒,默认 5000'),
}, wrap(async ({ name, group, url, timeout }) => {
  const q = `?url=${encodeURIComponent(url || DEFAULT_TEST_URL)}&timeout=${String(timeout || 5000)}`;
  if (group) {
    const r = await mihomoRequest('GET', `/group/${encodeURIComponent(group)}/delay${q}`);
    const ok = Object.entries(r ?? {}).filter(([, d]) => typeof d === 'number' && d > 0);
    ok.sort((a, b) => a[1] - b[1]);
    return {
      group,
      fastest: ok.slice(0, 5).map(([n, d]) => `${d}ms ${n}`),
      failed: Object.entries(r ?? {}).length - ok.length,
      all: r,
    };
  }
  if (!name) throw new Error('需要 name(单节点)或 group(整组)参数');
  return mihomoRequest('GET', `/proxies/${encodeURIComponent(name)}/delay${q}`);
}));

server.tool('get_connections', '查看当前全部连接的流量统计与明细(按下载量排序),可传 closeId 关闭指定连接', {
  limit: z.number().optional().describe('明细最多返回条数,默认 30'),
  closeId: z.string().optional().describe('关闭该 id 的连接(传此参数时不返回列表)'),
}, wrap(async ({ limit = 30, closeId }) => {
  if (closeId) {
    await mihomoRequest('DELETE', `/connections/${encodeURIComponent(closeId)}`);
    return { ok: true, closed: closeId };
  }
  const c = await mihomoRequest('GET', '/connections');
  const conns = (c?.connections ?? []).map((x) => ({
    id: x.id,
    host: x.metadata.host || x.metadata.sniffHost || x.metadata.destinationIP,
    network: x.metadata.network,
    chains: (x.chains ?? []).slice(0, 3).join(' → '),
    rule: `${x.rule}:${x.rulePayload}`,
    up: x.upload,
    down: x.download,
    start: x.start,
  }));
  conns.sort((a, b) => b.down - a.down);
  return {
    count: conns.length,
    uploadTotal: c?.uploadTotal,
    downloadTotal: c?.downloadTotal,
    connections: conns.slice(0, limit),
  };
}));

server.tool('get_configs', '查看内核运行配置:运行模式、TUN、混合端口、局域网共享等', {}, wrap(async () => {
  const c = await mihomoRequest('GET', '/configs');
  return {
    mode: c.mode,
    tun: c.tun,
    'mixed-port': c['mixed-port'],
    'socks-port': c['socks-port'],
    'allow-lan': c['allow-lan'],
    'log-level': c['log-level'],
  };
}));

server.tool('set_mode', '切换内核运行模式: rule=规则分流 / global=全局代理 / direct=全部直连', {
  mode: z.enum(['rule', 'global', 'direct']),
}, wrap(async ({ mode }) => {
  await mihomoRequest('PATCH', '/configs', { mode });
  return { ok: true, mode };
}));

server.tool('set_tun', '开关 TUN 虚拟网卡模式。注意:Verge 重载订阅后可能恢复其界面里的设置', {
  enable: z.boolean(),
}, wrap(async ({ enable }) => {
  await mihomoRequest('PATCH', '/configs', { tun: { enable } });
  const c = await mihomoRequest('GET', '/configs');
  return { ok: true, tun: c.tun };
}));

server.tool('toggle_system_proxy', '开关 Windows 系统代理(改注册表并通知应用生效)。enable 不传则翻转当前状态', {
  enable: z.boolean().optional(),
  port: z.number().optional().describe('代理端口,默认取内核 mixed-port,再退回 7890'),
}, wrap(async ({ enable, port }) => {
  const cur = await getSystemProxy();
  const target = enable === undefined ? !cur.enabled : enable;
  if (target) {
    const c = await mihomoRequest('GET', '/configs').catch(() => null);
    const p = port || c?.['mixed-port'] || 7890;
    const r = await setSystemProxy(true, `127.0.0.1:${p}`);
    return { ok: true, ...r, previous: cur, note: 'Verge 界面的开关状态不会实时同步,属正常' };
  }
  const r = await setSystemProxy(false);
  return { ok: true, ...r, previous: cur };
}));

server.tool('get_rules', '查看内核规则表,支持关键词过滤', {
  search: z.string().optional().describe('过滤关键词(匹配 type/payload/proxy,不区分大小写)'),
  limit: z.number().optional().describe('最多返回条数,默认 50'),
}, wrap(async ({ search, limit = 50 }) => {
  const { rules } = await mihomoRequest('GET', '/rules');
  const all = rules ?? [];
  let matched = all;
  if (search) {
    const kw = search.toLowerCase();
    matched = all.filter((r) => `${r.type} ${r.payload} ${r.proxy}`.toLowerCase().includes(kw));
  }
  return {
    total: all.length,
    matched: matched.length,
    rules: matched.slice(0, limit).map((r) => `${r.type},${r.payload} → ${r.proxy}`),
  };
}));

await server.connect(new StdioServerTransport());
