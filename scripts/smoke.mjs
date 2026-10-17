import { mihomoRequest, channelName } from '../src/lib/client.mjs';
import { getSystemProxy } from '../src/lib/sysproxy.mjs';

console.log('通道:', channelName());

const v = await mihomoRequest('GET', '/version');
console.log('内核版本:', v.version);

const { proxies } = await mihomoRequest('GET', '/proxies');
const groups = Object.values(proxies).filter((p) =>
  ['Selector', 'URLTest', 'Fallback', 'LoadBalance'].includes(p.type)
);
console.log('代理组:', groups.map((g) => `${g.name} → ${g.now}`).join(' | '));

const c = await mihomoRequest('GET', '/connections');
console.log('当前连接数:', c?.connections?.length ?? 0);

console.log('系统代理:', JSON.stringify(await getSystemProxy()));
console.log('smoke OK');
