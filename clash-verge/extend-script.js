/**
 * Clash Verge Rev 全局扩展脚本。
 *
 * 通常只需修改下列常量，不要改动后面的处理函数：
 *
 * - profilePolicyMap：profile 名称到代理组名称的精确映射。
 * - proxyPolicyCandidates：映射未命中时使用的代理组候选名称，越靠前越优先。
 * - proxyRegions：订阅节点的地区排序定义，越靠前排序优先级越高；未匹配的节点按原顺序排在后面，不按地区筛选。keywords 使用不区分大小写的子串匹配，codes 只匹配两侧不紧邻英文字母的地区代码。
 * - excludedProxyNameRules：订阅节点黑名单，匹配方式同上；命中后一定移除。空数组表示不排除任何节点。
 * - includedProxyNameRules：订阅节点白名单，匹配方式同上；非空时只保留命中的订阅节点，空数组表示不限制。当前保留香港、美国、日本、韩国和英国节点，黑名单优先于白名单。
 * - regionProxyGroups：美国、日本节点专用代理组，只包含对应地区的订阅节点，统一使用手动选择。
 * - aiProxyGroup：AI 专用代理组，在当前 profile 的普通代理组和 US、JP 之间手动选择。
 * - aiRuleProviderNames：强制使用 AI 代理组的 rule-provider 名称，必须与合并配置中的名称完全一致。
 * - tiktokProxyGroup：TikTok 专用代理组，选项与 AI 代理组相同。
 * - tiktokRuleProviderNames：强制使用 TikTok 代理组的 rule-provider 名称。
 * - rejectRuleProviderNames：使用 REJECT 策略的 rule-provider 名称。
 * - directRuleProviderNames：使用 DIRECT 策略的 rule-provider 名称。
 * - proxyRuleProviderNames：使用当前 profile 代理策略的 rule-provider 名称。
 * - directRules：强制直连的完整 Mihomo 规则，每条规则必须包含末尾的 DIRECT。
 * - proxyRulePrefixes：强制代理的 Mihomo 规则前缀，不要填写末尾策略组，脚本会根据 profile 自动补上解析出的代理组名称。
 * - dnsOverrides：强制写入的 Mihomo DNS 配置，修正订阅自带的境外 DoH fallback
 *   导致境外域名解析停滞、以及缺少 proxy-server-nameserver 导致节点域名解析失败的问题。
 *
 * 规则顺序为 directRules、directRuleProviderNames、rejectRuleProviderNames、
 * aiRuleProviderNames、tiktokRuleProviderNames、proxyRuleProviderNames、
 * proxyRulePrefixes、订阅原规则，
 * Mihomo 按首条匹配规则执行。节点筛选和排序只处理 config.proxies 中的真实订阅节点，
 * DIRECT、REJECT 以及其他代理组引用会保留在原位置。上述列表中的 name 仅用于标注，
 * 不参与匹配。
 */

// profile 名称 -> 代理组名称
const profilePolicyMap = {
  CLOUD: "🔰 手动选择",
  GHELPER: "Ghelper",
};

// 如果 profileName 没命中，就按这个候选列表自动找当前配置里存在的组名
const proxyPolicyCandidates = [
  "🔰 手动选择",
  "Ghelper",
  "Proxy",
  "节点选择",
  "🚀 节点选择",
  "PROXY",
  "GLOBAL",
  "代理",
  "手动切换",
];

// 节点只归入第一个命中的地区；数组顺序同时决定 proxy group 中的地区优先级。
const proxyRegions = [
  {
    id: "HK",
    name: "香港",
    keywords: ["香港", "Hong Kong", "🇭🇰"],
    codes: ["HK"],
  },
  {
    id: "JP",
    name: "日本",
    keywords: ["日本", "Japan", "Tokyo", "Osaka", "🇯🇵"],
    codes: ["JP"],
  },
  {
    id: "KR",
    name: "韩国",
    keywords: ["韩国", "韓國", "South Korea", "Korea", "Seoul", "🇰🇷"],
    codes: ["KR"],
  },
  {
    id: "US",
    name: "美国",
    keywords: ["美国", "美國", "United States", "America", "🇺🇸"],
    codes: ["US", "USA"],
  },
  {
    id: "SG",
    name: "新加坡",
    keywords: ["新加坡", "Singapore", "狮城", "🇸🇬"],
    codes: ["SG"],
  },
];

// 从 proxy groups 里移除不需要的节点。
const excludedProxyNameRules = [
  {
    name: "IPv6",
    keywords: ["ipv6"],
  },
  // {
  //   name: "移动",
  //   keywords: ["移动"],
  // },
  // {
  //   name: "电信",
  //   keywords: ["电信"],
  // },
  // {
  //   name: "联通",
  //   keywords: ["联通"],
  // },
];

// 从 proxy groups 里只保留白名单命中的订阅节点（不删除 config.proxies）。
// 空数组表示不启用；黑名单与白名单同时命中时，按黑名单移除。
const includedProxyNameRules = [
  {
    name: "香港",
    keywords: ["香港", "Hong Kong", "🇭🇰"],
    codes: ["HK"],
  },
  {
    name: "日本",
    keywords: ["日本", "Japan", "Tokyo", "Osaka", "🇯🇵"],
    codes: ["JP"],
  },
  {
    name: "韩国",
    keywords: ["韩国", "韓國", "Korea", "Seoul", "🇰🇷"],
    codes: ["KR"],
  },
  {
    name: "美国",
    keywords: ["美国", "美國", "United States", "America", "🇺🇸"],
    codes: ["US", "USA"],
  },
  // {
  //   name: "台湾",
  //   keywords: ["台湾", "台灣", "Taiwan", "Taipei", "🇹🇼"],
  //   codes: ["TW"],
  // },
  {
    name: "英国",
    keywords: ["英国", "英國", "United Kingdom", "Britain", "London", "🇬🇧"],
    codes: ["UK"],
  },
];

// 地区选择组：regionId 对应 proxyRegions 中的 id，只包含该地区的真实订阅节点。
const regionProxyGroups = [
  { name: "US", regionId: "US" },
  { name: "JP", regionId: "JP" },
];

const aiProxyGroup = {
  name: "AI",
  type: "select",
};

const tiktokProxyGroup = {
  name: "TikTok",
  type: "select",
};

// 强制写入 Mihomo 的 DNS 配置，整体替换订阅自带或 GUI「DNS 覆写」中的对应字段。
// 目的：
// 1. 统一使用国内 DoH：订阅自带的 fallback（1.1.1.1 / 8.8.8.8 / dns.google）在国内
//    直连不可达，会让每个境外域名解析等待约 5 秒，网页明显变慢；
// 2. 显式配置 proxy-server-nameserver：保证节点服务器域名走干净通道解析，
//    避免节点拨号超时（美国等节点失效的根因）；
// 3. 固定 fake-ip 模式：代理流量按域名分流，不依赖本地解析结果。
// 注意：使用脚本后建议关闭 GUI 的「DNS 覆写」；若保留，请保持两边配置一致。
const dnsOverrides = {
  "enable": true,
  "enhanced-mode": "fake-ip",
  "fake-ip-range": "198.18.0.1/16",
  "listen": ":53",
  "fake-ip-filter": [
    "*.lan",
    "*.local",
    "*.arpa",
    "time.*.com",
    "ntp.*.com",
    "+.market.xiaomi.com",
    "localhost.ptlogin2.qq.com",
    "*.msftncsi.com",
    "www.msftconnecttest.com",
  ],
  "nameserver": [
    "https://doh.pub/dns-query",
    "https://dns.alidns.com/dns-query",
  ],
  "proxy-server-nameserver": [
    "https://doh.pub/dns-query",
    "https://dns.alidns.com/dns-query",
  ],
  "fallback": [
    "https://doh.pub/dns-query",
    "https://dns.alidns.com/dns-query",
  ],
};

const rejectRuleProviderNames = ["AD"];
const directRuleProviderNames = ["GameDirect"];
const proxyRuleProviderNames = ["GameProxy", "PayPal"];
const aiRuleProviderNames = ["OpenAI", "Gemini", "Anthropic"];
const tiktokRuleProviderNames = ["TikTok"];

// 需要强制直连的规则放在这里，避免国内服务、办公软件和支付场景误走代理。
const directRules = [
  // --- 微信 / WeChat: Windows ---
  `PROCESS-NAME,Weixin.exe,DIRECT`,
  `PROCESS-NAME,WeChat.exe,DIRECT`,
  `PROCESS-NAME,WeChatAppEx.exe,DIRECT`,

  // --- 微信 / WeChat: macOS ---
  `PROCESS-NAME,Weixin,DIRECT`,
  `PROCESS-NAME,WeChat,DIRECT`,

  // --- 钉钉 / DingTalk: Windows ---
  `PROCESS-NAME,DingTalk.exe,DIRECT`,

  // --- 钉钉 / DingTalk: macOS ---
  `PROCESS-NAME,DingTalk,DIRECT`,

  // --- 微信域名 ---
  `DOMAIN-SUFFIX,wechat.com,DIRECT`,
  `DOMAIN-SUFFIX,weixin.qq.com,DIRECT`,
  `DOMAIN-SUFFIX,weixin.com,DIRECT`,
  `DOMAIN-SUFFIX,servicewechat.com,DIRECT`,
  `DOMAIN-SUFFIX,wx.qq.com,DIRECT`,
  `DOMAIN-SUFFIX,gtimg.com,DIRECT`,
  `DOMAIN-SUFFIX,qpic.cn,DIRECT`,
  `DOMAIN-SUFFIX,qlogo.cn,DIRECT`,
  `DOMAIN-SUFFIX,tenpay.com,DIRECT`,
  `DOMAIN-SUFFIX,wechatpay.com,DIRECT`,

  // --- 钉钉域名 ---
  `DOMAIN-SUFFIX,dingtalk.com,DIRECT`,
  `DOMAIN-SUFFIX,dingtalkapps.com,DIRECT`,
  `DOMAIN-SUFFIX,alicdn.com,DIRECT`,
  `DOMAIN-SUFFIX,aliyuncs.com,DIRECT`,
  `DOMAIN-SUFFIX,mxhichina.com,DIRECT`,
  `DOMAIN-SUFFIX,mmstat.com,DIRECT`,
];

// 需要强制走代理的规则放在这里，策略组统一使用当前 profile 解析出的 proxyPolicy。
const proxyRulePrefixes = [
  // --- 其他代理规则 ---
  // 示例："DOMAIN-SUFFIX,example.com"
];

function buildProxyRules(proxyPolicy) {
  if (!proxyPolicy) return [];

  return proxyRulePrefixes.map((rule) => `${rule},${proxyPolicy}`);
}

function buildProxyGroupRuleProviderRules(config, providerNames, groupName) {
  if (!getProxyGroupNames(config).includes(groupName)) return [];

  return providerNames.map(
    (providerName) => `RULE-SET,${providerName},${groupName}`,
  );
}

function buildAiProxyRules(config) {
  return buildProxyGroupRuleProviderRules(
    config,
    aiRuleProviderNames,
    aiProxyGroup.name,
  );
}

function buildTikTokProxyRules(config) {
  return buildProxyGroupRuleProviderRules(
    config,
    tiktokRuleProviderNames,
    tiktokProxyGroup.name,
  );
}

function buildRejectRules() {
  return rejectRuleProviderNames.map(
    (providerName) => `RULE-SET,${providerName},REJECT`,
  );
}

function buildDirectRuleProviderRules() {
  return directRuleProviderNames.map(
    (providerName) => `RULE-SET,${providerName},DIRECT`,
  );
}

function buildProxyRuleProviderRules(proxyPolicy) {
  if (!proxyPolicy) return [];

  return proxyRuleProviderNames.map(
    (providerName) => `RULE-SET,${providerName},${proxyPolicy}`,
  );
}

function uniqueRules(rules) {
  const seen = new Set();
  const result = [];

  for (const rule of rules) {
    if (typeof rule !== "string") continue;
    if (seen.has(rule)) continue;
    seen.add(rule);
    result.push(rule);
  }

  return result;
}

function getProxyGroups(config) {
  return Array.isArray(config["proxy-groups"]) ? config["proxy-groups"] : [];
}

function getProxyGroupNames(config) {
  const groups = getProxyGroups(config);

  return groups.map((group) => group && group.name).filter(Boolean);
}

function resolveProxyPolicy(config, profileName) {
  const groupNames = new Set(getProxyGroupNames(config));

  // 1. 先按 profileName 精确匹配
  const mappedPolicy = profilePolicyMap[profileName];
  if (mappedPolicy && groupNames.has(mappedPolicy)) {
    return mappedPolicy;
  }

  // 2. 再按候选名称自动匹配
  for (const candidate of proxyPolicyCandidates) {
    if (groupNames.has(candidate)) {
      return candidate;
    }
  }

  // 3. 最后兜底：选第一个看起来像“可出站代理组”的组
  const groups = getProxyGroups(config);
  const fallbackGroup = groups.find((group) => {
    if (!group || !group.name || !group.type) return false;
    return ["select", "url-test", "fallback", "load-balance"].includes(
      group.type,
    );
  });

  return fallbackGroup ? fallbackGroup.name : null;
}

function getOldRules(config) {
  return Array.isArray(config.rules) ? config.rules : [];
}

function mergeProxyRules(config, profileName) {
  const oldRules = getOldRules(config);

  const proxyPolicy = resolveProxyPolicy(config, profileName);
  if (!proxyPolicy) {
    console.warn(
      "[clash-verge] No proxy policy found. Proxy rules were skipped.",
    );
  }

  const proxyRules = buildProxyRules(proxyPolicy);

  config.rules = uniqueRules(
    directRules
      .concat(buildDirectRuleProviderRules())
      .concat(buildRejectRules())
      .concat(buildAiProxyRules(config))
      .concat(buildTikTokProxyRules(config))
      .concat(buildProxyRuleProviderRules(proxyPolicy))
      .concat(proxyRules)
      .concat(oldRules),
  );
}

function getProxyName(proxy) {
  return proxy && typeof proxy.name === "string" ? proxy.name : "";
}

function getProxyRegionRank(proxyName) {
  const region = getProxyRegion(proxyName);
  if (region) return proxyRegions.indexOf(region);

  return proxyRegions.length;
}

function hasProxyCode(proxyName, code) {
  const normalizedProxyName = proxyName.toUpperCase();
  const normalizedCode = code.toUpperCase();
  let matchIndex = normalizedProxyName.indexOf(normalizedCode);

  while (matchIndex !== -1) {
    const previousCharacter = normalizedProxyName[matchIndex - 1] || "";
    const nextCharacter =
      normalizedProxyName[matchIndex + normalizedCode.length] || "";
    const hasLetterBefore = /[A-Z]/.test(previousCharacter);
    const hasLetterAfter = /[A-Z]/.test(nextCharacter);

    // 地区代码两侧不能紧邻英文字母，避免把 "RUS" 之类的片段误判为 "US"。
    if (!hasLetterBefore && !hasLetterAfter) return true;

    matchIndex = normalizedProxyName.indexOf(normalizedCode, matchIndex + 1);
  }

  return false;
}

function matchesProxyNameRule(proxyName, rule) {
  const normalizedProxyName = proxyName.toLowerCase();
  const keywords = Array.isArray(rule.keywords) ? rule.keywords : [];
  const codes = Array.isArray(rule.codes) ? rule.codes : [];

  const matchesKeyword = keywords.some((keyword) => {
    return normalizedProxyName.includes(keyword.toLowerCase());
  });

  return matchesKeyword || codes.some((code) => hasProxyCode(proxyName, code));
}

function getProxyRegion(proxyName) {
  if (typeof proxyName !== "string") return null;

  return (
    proxyRegions.find((region) => matchesProxyNameRule(proxyName, region)) ||
    null
  );
}

function shouldExcludeProxyName(proxyName) {
  if (typeof proxyName !== "string") return false;

  return excludedProxyNameRules.some((rule) => {
    return matchesProxyNameRule(proxyName, rule);
  });
}

function shouldIncludeProxyName(proxyName) {
  if (typeof proxyName !== "string") return false;
  if (includedProxyNameRules.length === 0) return true;

  return includedProxyNameRules.some((rule) => {
    return matchesProxyNameRule(proxyName, rule);
  });
}

function shouldKeepProxyName(proxyName) {
  return (
    shouldIncludeProxyName(proxyName) && !shouldExcludeProxyName(proxyName)
  );
}

function ensureRegionProxyGroups(config) {
  if (!Array.isArray(config.proxies)) return;

  const keptProxyNames = config.proxies
    .map(getProxyName)
    .filter(Boolean)
    .filter((proxyName) => shouldKeepProxyName(proxyName));

  let groups = getProxyGroups(config);
  const removedGroupNames = new Set();

  for (const regionGroup of regionProxyGroups) {
    const regionProxyNames = keptProxyNames.filter((proxyName) => {
      const region = getProxyRegion(proxyName);

      return region && region.id === regionGroup.regionId;
    });

    if (regionProxyNames.length === 0) {
      removedGroupNames.add(regionGroup.name);
      console.warn(
        `[clash-verge] No ${regionGroup.name} proxy nodes found. ${regionGroup.name} group was skipped.`,
      );
      continue;
    }

    const oldGroup = groups.find(
      (group) => group && group.name === regionGroup.name,
    );

    const nextGroup = {
      ...oldGroup,
      name: regionGroup.name,
      type: "select",
      proxies: regionProxyNames,
    };

    // 手动选择组不需要延迟检测字段，避免订阅自带的 url-test 配置残留。
    delete nextGroup.url;
    delete nextGroup.interval;

    if (oldGroup) {
      groups[groups.indexOf(oldGroup)] = nextGroup;
    } else {
      groups.push(nextGroup);
    }
  }

  if (removedGroupNames.size > 0) {
    groups = groups.filter(
      (group) => !group || !removedGroupNames.has(group.name),
    );
  }

  config["proxy-groups"] = groups;
}

function getManagedProxyGroupProxies(config, profileName, groupName) {
  const groupNames = new Set(getProxyGroupNames(config));
  const candidates = [
    resolveProxyPolicy(config, profileName),
    ...regionProxyGroups.map((regionGroup) => regionGroup.name),
  ];

  return Array.from(new Set(candidates)).filter(
    (candidate) =>
      candidate && candidate !== groupName && groupNames.has(candidate),
  );
}

function ensureSelectProxyGroup(config, profileName, definition, warnMessage) {
  const groups = getProxyGroups(config);
  const oldGroup = groups.find(
    (group) => group && group.name === definition.name,
  );
  const proxies = getManagedProxyGroupProxies(
    config,
    profileName,
    definition.name,
  );

  if (proxies.length === 0) {
    config["proxy-groups"] = groups.filter(
      (group) => !group || group.name !== definition.name,
    );
    console.warn(warnMessage);
    return;
  }

  const nextGroup = {
    ...oldGroup,
    ...definition,
    proxies,
  };

  // 手动选择组不需要延迟检测字段，避免订阅自带的 url-test 配置残留。
  delete nextGroup.url;
  delete nextGroup.interval;

  if (oldGroup) {
    groups[groups.indexOf(oldGroup)] = nextGroup;
  } else {
    groups.push(nextGroup);
  }

  config["proxy-groups"] = groups;
}

function removeProxyGroup(config, groupName) {
  const groups = getProxyGroups(config);
  const nextGroups = groups.filter(
    (group) => !group || group.name !== groupName,
  );

  if (nextGroups.length !== groups.length) {
    config["proxy-groups"] = nextGroups;
  }
}

function compareProxyRegion(left, right) {
  if (left.rank !== right.rank) {
    return left.rank - right.rank;
  }

  return left.index - right.index;
}

function getProxyNameSet(config) {
  if (!Array.isArray(config.proxies)) return new Set();

  return new Set(config.proxies.map(getProxyName).filter(Boolean));
}

function filterAndSortProxyGroupProxies(config) {
  const proxyNames = getProxyNameSet(config);
  if (proxyNames.size === 0) return;

  for (const group of getProxyGroups(config)) {
    if (!group || !Array.isArray(group.proxies)) continue;

    // 只跟踪订阅节点，策略组引用、DIRECT、REJECT 等固定项不参与筛选。
    const hadProxyNode = group.proxies.some((proxyName) =>
      proxyNames.has(proxyName),
    );

    group.proxies = group.proxies.filter((proxyName) => {
      if (!proxyNames.has(proxyName)) return true;

      return shouldKeepProxyName(proxyName);
    });

    const hasProxyNode = group.proxies.some((proxyName) =>
      proxyNames.has(proxyName),
    );

    // 仅当原组含订阅节点且筛选后清空时告警，避免对纯策略组误报。
    if (hadProxyNode && !hasProxyNode) {
      console.warn(
        `[clash-verge] No proxy nodes remain in group "${group.name || "<unnamed>"}" after whitelist/blacklist filtering.`,
      );
    }

    const sortedProxyNames = group.proxies
      .map((proxyName, index) => ({
        proxyName,
        index,
        rank:
          typeof proxyName === "string"
            ? getProxyRegionRank(proxyName)
            : proxyRegions.length,
      }))
      .filter((item) => proxyNames.has(item.proxyName))
      .sort(compareProxyRegion)
      .map((item) => item.proxyName);

    let sortedIndex = 0;
    group.proxies = group.proxies.map((proxyName) => {
      // 非订阅项保留原位置，只依次替换订阅节点所在的槽位。
      if (!proxyNames.has(proxyName)) {
        return proxyName;
      }

      const sortedProxyName = sortedProxyNames[sortedIndex];
      sortedIndex += 1;

      return sortedProxyName;
    });
  }
}

function applyDnsOverrides(config) {
  const currentDns =
    config.dns && typeof config.dns === "object" ? config.dns : {};

  // 数组字段整体替换，确保订阅自带的境外 DoH 不会残留。
  config.dns = { ...currentDns, ...dnsOverrides };
}

function main(config, profileName) {
  applyDnsOverrides(config);
  removeProxyGroup(config, "OpenAI");
  ensureRegionProxyGroups(config);
  ensureSelectProxyGroup(
    config,
    profileName,
    tiktokProxyGroup,
    "[clash-verge] No proxy groups found for TikTok. TikTok rules were skipped.",
  );
  ensureSelectProxyGroup(
    config,
    profileName,
    aiProxyGroup,
    "[clash-verge] No proxy groups found for AI. AI rules were skipped.",
  );
  filterAndSortProxyGroupProxies(config);
  mergeProxyRules(config, profileName);
  return config;
}
