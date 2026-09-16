# Network Config Set

个人使用的代理规则和 Clash Verge Rev 扩展脚本。规则文件可供 Clash/Mihomo 与 Quantumult X 引用，扩展脚本用于整理订阅节点、创建策略组并合并自定义规则。

## 文件说明

### 规则文件

#### Clash/Mihomo

| 路径 | 用途 |
| --- | --- |
| [ad.yaml](rules/clash/ad.yaml) | 广告拦截规则 |
| [game-direct.yaml](rules/clash/game-direct.yaml) | 游戏下载与国内服务直连规则 |
| [game-proxy.yaml](rules/clash/game-proxy.yaml) | 游戏商店、社区与账号服务代理规则 |

#### Quantumult X

| 路径 | 用途 |
| --- | --- |
| [ad.list](rules/quantumult-x/ad.list) | Quantumult X 广告拦截规则 |
| [game.list](rules/quantumult-x/game.list) | Quantumult X 游戏分流规则 |

### Clash Verge Rev 配置

| 路径 | 用途 |
| --- | --- |
| [extend-script.js](clash-verge/extend-script.js) | Clash Verge Rev 全局扩展脚本 |
| [rule-providers.yaml](clash-verge/rule-providers.yaml) | 扩展脚本依赖的 `rule-providers` 配置片段 |

### 测试文件

| 路径 | 用途 |
| --- | --- |
| [extend-script.test.js](clash-verge/extend-script.test.js) | 扩展脚本的回归测试 |

## 使用说明

### Clash/Mihomo 规则

规则文件可通过以下原始地址作为 `rule-provider` 引用：

```text
https://raw.githubusercontent.com/gwyntoria/network_config_set/main/rules/clash/ad.yaml
https://raw.githubusercontent.com/gwyntoria/network_config_set/main/rules/clash/game-direct.yaml
https://raw.githubusercontent.com/gwyntoria/network_config_set/main/rules/clash/game-proxy.yaml
```

这些文件采用包含 `payload` 的 provider 格式。

广告规则应使用 `REJECT`，游戏规则按文件名分别接入直连策略和代理策略。

规则匹配依赖顺序，请把需要优先命中的规则放在兜底规则之前。

### Quantumult X 规则

可引用以下规则地址：

```text
https://raw.githubusercontent.com/gwyntoria/network_config_set/main/rules/quantumult-x/ad.list
https://raw.githubusercontent.com/gwyntoria/network_config_set/main/rules/quantumult-x/game.list
```

`ad.list` 已包含 `reject` 策略。`game.list` 同时包含 `direct` 和 `proxy` 策略，其中游戏下载流量优先直连，商店、社区与账号服务走代理。

### Clash Verge Rev 扩展脚本

将 `extend-script.js` 的内容复制到 Clash Verge Rev 的全局扩展脚本中。再把 `rule-providers.yaml` 合并到配置根节点，确保脚本引用的 provider 名称与配置一致。

脚本会处理以下内容：

- 按香港、日本、韩国、美国、台湾、新加坡的顺序筛选并排列订阅节点。
- 排除名称中含 `IPv6` 的订阅节点。
- 创建 `US` 策略组，并让 TikTok、PayPal、Gemini 和 Anthropic 规则使用该组。
- 创建 `OpenAI` 策略组，可在当前 profile 的普通代理组与 `US` 组之间选择。
- 将广告 provider 指向 `REJECT`，将游戏直连和代理 provider 分别指向 `DIRECT` 与当前 profile 的代理组，并添加国内服务直连规则。
- 补充微信与钉钉相关的 `fake-ip-filter`。

常用配置集中在脚本开头：

- `profilePolicyMap`：profile 名称与代理组名称的对应关系。
- `proxyPolicyCandidates`：profile 未命中时的代理组候选名称。
- `proxyRegions`：地区识别、白名单筛选和排列顺序。
- `excludedProxyNameRules`：节点名称黑名单。
- `usRuleProviderNames`、`rejectRuleProviderNames`、`directRuleProviderNames` 与 `proxyRuleProviderNames`：provider 的分流策略。
- `directRules` 与 `proxyRulePrefixes`：直接插入配置的自定义规则。
- `fakeIpFilterRules`：追加到 `dns.fake-ip-filter` 的域名。

脚本插入规则时采用以下顺序：

```text
直连规则
直连 provider 规则
广告拦截规则
OpenAI 规则
美国节点组规则
代理 provider 规则
强制代理规则
订阅原有规则
```

Mihomo 使用首条命中的规则，修改这些列表时需保留所需的优先级。`directRules` 要包含完整策略，`proxyRulePrefixes` 只填写规则前缀，脚本会自动补上当前 profile 对应的代理组。

### 测试

扩展脚本测试使用 Node.js 内置的测试运行器，不需要安装第三方依赖：

```bash
node --test clash-verge/extend-script.test.js
```

测试覆盖地区识别与稳定排序、白名单和黑名单组合，以及脚本重复运行后的幂等性。

## 规则来源

各规则文件头部记录了来源地址和更新时间。

- 广告规则来自 `earoftoast/clash-rules`。
- 游戏规则整理自 `blackmatrix7/ios_rule_script`。
