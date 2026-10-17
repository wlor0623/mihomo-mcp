# mihomo-mcp

让 AI(MCP 客户端)直接管理你电脑上的 **mihomo / Clash Meta 内核** —— 切节点、测延迟、看连接、切运行模式、开关 TUN 和 Windows 系统代理。

与 [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) **零配置兼容**:Verge 2.x 的 GUI 本身就是通过 Windows 命名管道控制 mihomo 内核的,本工具走同一条管道,**不需要在 Verge 里开任何设置,不改源码,不暴露端口**。

```
ZCode / Claude / Cline ──stdio──> mihomo-mcp ──HTTP over 命名管道──> mihomo 内核
                                                                       ↑
                                        Clash Verge GUI(同一通道,互不干扰)
```

## 接入

任何支持 MCP 的客户端(ZCode / Claude Desktop / Cline / Cherry Studio 等),在 mcpServers 配置里加:

```json
{
  "mcpServers": {
    "mihomo-mcp": {
      "command": "node",
      "args": ["<本项目路径>/src/index.mjs"]
    }
  }
}
```

全局安装后也可以直接用命令名:

```bash
npm i -g mihomo-mcp
# 然后 command: "mihomo-mcp"
```

## 环境变量(全部可选)

| 变量 | 默认值 | 说明 |
|---|---|---|
| `MIHOMO_PIPE` | `\\.\pipe\verge-mihomo` | mihomo 命名管道。Verge Rev 2.x 用这个默认值;其他发行版(裸 mihomo、Nyanpasu)改管道名即可 |
| `MIHOMO_HTTP` | 空 | 设置后改走 HTTP 外部控制,如 `http://127.0.0.1:9097`(需在客户端里开启「外部控制」) |
| `MIHOMO_SECRET` | 空 | HTTP 外部控制的 secret,管道模式通常不需要 |

## 工具列表

| 工具 | 说明 |
|---|---|
| `get_version` | 内核版本 + 当前通道 |
| `list_proxies` | 所有代理组:类型、当前节点、候选节点列表 |
| `switch_proxy` | 切换某组的选中节点 |
| `delay_test` | 测单节点或整组延迟(整组返回最快前 5) |
| `get_connections` | 当前连接明细(按流量排序),支持关闭指定连接 |
| `get_configs` | 运行模式 / TUN / 混合端口 / 允许局域网 |
| `set_mode` | 切 rule / global / direct |
| `set_tun` | 开关 TUN 虚拟网卡 |
| `toggle_system_proxy` | 开关 Windows 系统代理(写注册表 + WinINET 通知) |
| `get_rules` | 查看分流规则,支持关键词过滤 |

## 说明与坑

- **系统代理开关是应用层功能**:mihomo 内核 API 管不到 Windows 代理设置,所以 `toggle_system_proxy` 是直接改注册表 `HKCU\...\Internet Settings` 并通过 `InternetSetOption` 通知应用。副作用:Clash Verge 界面上的开关状态不会实时同步,属正常现象,以注册表为准。
- **Verge 里默认不用开「外部控制」**:那是 HTTP 通道的开关;管道通道只要 Verge 在运行就存在。
- **`set_tun` 可能被 GUI 覆盖**:Verge 重载订阅/改设置时会按它界面里的状态重写 TUN 配置,以 Verge 界面为长期开关,本工具适合临时切换。
- **多订阅/切换 profile**(Verge 应用层功能)暂不支持,后续版本计划通过读 Verge 的 `profiles.yaml` + `PUT /configs?force=true` 实现。

## 兼容性

实测 Clash Verge Rev 2.4.5(mihomo v1.19.x,Windows 11)。理论上任何暴露 mihomo RESTful API 的场景都可用:裸 mihomo(设 `external-controller-pipe` 或用 `MIHOMO_HTTP`)、Clash Nyanpasu 等。

## License

MIT
