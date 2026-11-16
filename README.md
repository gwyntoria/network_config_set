# Network Config Set

个人使用的代理规则和 Clash Verge Rev 扩展脚本。规则文件可供 Clash/Mihomo 与 Quantumult X 引用，扩展脚本用于整理订阅节点、创建策略组并合并自定义规则。

## 文件说明

### 规则文件

#### Clash/Mihomo

| 路径 | 用途 |
| --- | --- |
| [ad.yaml](rules/clash/ad.yaml) | 广告拦截规则 |
| [anthropic.yaml](rules/clash/anthropic.yaml) | Anthropic 代理规则 |
| [game-direct.yaml](rules/clash/game-direct.yaml) | 游戏下载与国内服务直连规则 |
| [game-proxy.yaml](rules/clash/game-proxy.yaml) | 游戏商店、社区与账号服务代理规则 |

#### Quantumult X

| 路径 | 用途 |
| --- | --- |
| [ad.list](rules/quantumult-x/ad.list) | 广告拦截规则 |
| [anthropic.list](rules/quantumult-x/anthropic.list) | Anthropic 代理规则 |
| [game.list](rules/quantumult-x/game.list) | 游戏平台分流规则 |
| [personality.list](rules/quantumult-x/personality.list) | 自用补充规则 |

### Clash Verge Rev 配置

| 路径 | 用途 |
| --- | --- |
| [global-extend-config.yaml](clash-verge/global-extend-config.yaml) | 全局公共 `rule-providers` |
| [global-extend-script.js](clash-verge/global-extend-script.js) | 全局 DNS、fake-ip 和 DNS 例外 |
| [profile-extend-config.yaml](clash-verge/profile-extend-config.yaml) | 当前 profile 的外部节点 `proxy-providers` 模板 |
| [profile-extend-script.js](clash-verge/profile-extend-script.js) | 当前 profile 的节点整理、策略组和规则合并 |

### 测试文件

| 路径 | 用途 |
| --- | --- |
| [extend-script.test.js](clash-verge/test/extend-script.test.js) | 两层扩展脚本的回归测试 |
| [provider-runtime.test.js](clash-verge/test/provider-runtime.test.js) | 可选的 Mihomo 外部节点集成测试 |

## 使用说明

### Clash/Mihomo 规则

规则文件可通过以下原始地址作为 `rule-provider` 引用：

```yaml
rule-providers:
  AD:
    type: http
    behavior: domain
    url: "https://raw.githubusercontent.com/gwyntoria/network_config_set/refs/heads/main/rules/clash/ad.yaml"
    path: ./rules/AD.yaml
    interval: 86400
```

这些文件采用包含 `payload` 的 provider 格式。

广告规则应使用 `REJECT`，Anthropic 规则应接入代理策略，游戏规则按文件名分别接入直连策略和代理策略。

**规则匹配依赖顺序，请把需要优先命中的规则放在兜底规则之前。**

### Quantumult X 规则

可引用以下规则地址：

```text
https://raw.githubusercontent.com/gwyntoria/network_config_set/main/rules/quantumult-x/ad.list, tag=AD, update-interval=172800, opt-parser=false, enable=true
```

**这些列表已包含策略。** 但使用时依然可以指定 `force-policy` 。

### Clash Verge Rev 扩展脚本

1. 将 `global-extend-config.yaml` 复制到*全局扩展配置*。
2. 将 `global-extend-script.js` 复制到*全局扩展脚本*。
3. 右键需要使用这些策略的订阅，将 `profile-extend-config.yaml` 复制到该订阅的*扩展配置*，填写其外部订阅来源；不需要外部节点时保持 `proxy-providers: {}`。
4. 将 `profile-extend-script.js` 复制到该订阅的*扩展脚本*，按需调整主代理组、节点黑白名单和地区组。其他需要相同策略的订阅也分别配置。

执行顺序为：全局扩展配置 → 全局扩展脚本 → 订阅扩展配置 → 订阅扩展脚本。节点来源由当前订阅的配置提供，再由其脚本接入主代理组及 US、JP；各订阅的来源和筛选参数分别维护。

不同外部来源使用不同的 provider 名称和缓存 `path`，避免跨订阅共用缓存。

全局脚本只覆写公共 DNS 字段；订阅脚本保留之后写入的 DNS 设置。公共规则集来源集中在全局 YAML，规则优先级统一由订阅脚本维护。provider 名称需与脚本中的规则集名称一致。

#### 拓展脚本补充说明

常用配置集中在订阅脚本开头，全局 DNS 则修改全局脚本的 `dnsOverrides`：

- `profilePolicyMap`：profile 名称与代理组名称的对应关系。
- `proxyPolicyCandidates`：profile 未命中时的代理组候选名称。
- `proxyRegions`：地区识别和排列顺序，匹配的节点优先排列，其余节点保留原有顺序。
- `regionProxyGroups`：地区策略组定义，组名与 `proxyRegions` 中的地区 id 对应。
- `excludedProxyNameRules`：节点名称黑名单。
- `includedProxyNameRules`：节点名称白名单。非空时只保留命中的订阅节点；黑名单优先，空数组表示不限制。
- `aiRuleProviderNames`、`tiktokRuleProviderNames`、`rejectRuleProviderNames`、`directRuleProviderNames` 与 `proxyRuleProviderNames`：provider 的分流策略。

脚本插入规则时采用以下顺序：

```text
直连 provider 规则
广告拦截规则
AI 规则
TikTok 规则
代理 provider 规则
订阅原有规则
```

Mihomo 使用首条命中的规则，修改这些列表时需保留所需的优先级。

### 测试

扩展脚本测试使用 Node.js 内置的测试运行器，不需要安装第三方依赖：

```bash
node --test clash-verge/test/*.test.js
```

## 规则参考来源

- 广告规则：[earoftoast/clash-rules](https://github.com/earoftoast/clash-rules)。
- Anthropic 规则： [xiaolai/anthropic-claude-surge-rules-set](https://github.com/xiaolai/anthropic-claude-surge-rules-set)。
- 游戏平台规则： [blackmatrix7/ios_rule_script](https://github.com/blackmatrix7/ios_rule_script)。
