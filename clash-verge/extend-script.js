/**
 * Clash Verge Rev 全局扩展脚本。
 *
 * 通常只需修改下列常量，不要改动后面的处理函数：
 *
 * - profilePolicyMap：profile 名称到代理组名称的精确映射。
 * - proxyPolicyCandidates：映射未命中时使用的代理组候选名称，越靠前越优先。
 * - proxyRegions：订阅节点的地区定义，越靠前排序优先级越高；included 表示该地区进入白名单。keywords 使用不区分大小写的子串匹配，codes 只匹配两侧不紧邻英文字母的地区代码。全部地区的 included 均为 false 时关闭白名单筛选。
 * - excludedProxyNameRules：订阅节点黑名单，匹配方式同上；在白名单之后执行，命中后一定移除。空数组表示不排除任何节点。
 * - usProxyGroup：美国节点专用代理组；url 是延迟检测地址，interval 是检测间隔秒数。
 * - usRuleProviderNames：强制使用美国节点组的 rule-provider 名称，必须与合并配置中的名称完全一致。
 * - openAiProxyGroup：OpenAI 专用代理组，在当前 profile 的普通代理组和 US 之间手动选择。
 * - rejectRuleProviderNames：使用 REJECT 策略的 rule-provider 名称。
 * - directRules：强制直连的完整 Mihomo 规则，每条规则必须包含末尾的 DIRECT。
 * - proxyRulePrefixes：强制代理的 Mihomo 规则前缀，不要填写末尾策略组，脚本会根据 profile 自动补上解析出的代理组名称。
 * - fakeIpFilterRules：追加到 dns.fake-ip-filter 的域名；通配符沿用 Mihomo 配置语法。
 *
 * 规则顺序为 directRules、rejectRuleProviderNames、OpenAI、
 * usRuleProviderNames、proxyRulePrefixes、订阅原规则，Mihomo 按首条匹配规则
 * 执行。节点筛选和排序只处理 config.proxies 中的真实订阅节点，DIRECT、REJECT
 * 以及其他代理组引用会保留在原位置。上述列表中的 name 仅用于标注，不参与匹配。
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
    included: true,
  },
  {
    id: "JP",
    name: "日本",
    keywords: ["日本", "Japan", "Tokyo", "Osaka", "🇯🇵"],
    codes: ["JP"],
    included: true,
  },
  {
    id: "KR",
    name: "韩国",
    keywords: ["韩国", "韓國", "South Korea", "Korea", "Seoul", "🇰🇷"],
    codes: ["KR"],
    included: true,
  },
  {
    id: "US",
    name: "美国",
    keywords: ["美国", "美國", "United States", "America", "🇺🇸"],
    codes: ["US", "USA"],
    included: true,
  },
  {
    id: "TW",
    name: "台湾",
    keywords: ["台湾", "台灣", "Taiwan"],
    codes: ["TW"],
    included: true,
  },
  {
    id: "SG",
    name: "新加坡",
    keywords: ["新加坡", "Singapore", "🇸🇬"],
    codes: ["SG"],
    included: true,
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

// 只包含命中“美国”规则的真实订阅节点，并按延迟自动选择节点。
const usProxyGroup = {
  name: "US",
  type: "select",

  // type: "url-test",
  // url: "https://www.gstatic.com/generate_204",
  // interval: 1800,
};

const openAiProxyGroup = {
  name: "OpenAI",
  type: "select",
};

const usRuleProviderNames = ["TikTok", "PayPal", "Gemini", "Anthropic"];
const rejectRuleProviderNames = ["AD"];

// 需要强制直连的规则放在这里，避免国内服务、办公软件和支付场景误走代理。
const directRules = [
  `DOMAIN-SUFFIX,epic.com,DIRECT`,
  `DOMAIN-SUFFIX,caixin.com,DIRECT`,
  `DOMAIN-SUFFIX,dedao.com,DIRECT`,
  `DOMAIN-SUFFIX,alipay.com,DIRECT`,
  `DOMAIN-SUFFIX,jd.com,DIRECT`,
  `DOMAIN-SUFFIX,taobao.com,DIRECT`,
  `DOMAIN-SUFFIX,linuxdo.org,DIRECT`,

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

  // --- 国内兜底 ---
  `GEOSITE,cn,DIRECT`,
  `GEOIP,CN,DIRECT,no-resolve`,
];

// 需要强制走代理的规则放在这里，策略组统一使用当前 profile 解析出的 proxyPolicy。
const proxyRulePrefixes = [
  // --- Steam 核心域名 ---
  "DOMAIN-SUFFIX,steampowered.com",
  "DOMAIN-SUFFIX,steamcommunity.com",
  "DOMAIN-SUFFIX,steamgames.com",
  "DOMAIN-SUFFIX,steamstatic.com",
  "DOMAIN-SUFFIX,steamserver.net",
  "DOMAIN-SUFFIX,steam-chat.com",
  "DOMAIN-SUFFIX,valvesoftware.com",
  "DOMAIN-SUFFIX,valve.net",

  // --- 其他代理规则 ---
  // 示例："DOMAIN-SUFFIX,example.com"
];

function buildProxyRules(proxyPolicy) {
  if (!proxyPolicy) return [];

  return proxyRulePrefixes.map((rule) => `${rule},${proxyPolicy}`);
}

function buildUsProxyRules(config) {
  if (!getProxyGroupNames(config).includes(usProxyGroup.name)) return [];

  return usRuleProviderNames.map(
    (providerName) => `RULE-SET,${providerName},${usProxyGroup.name}`,
  );
}

function buildOpenAiProxyRules(config) {
  if (!getProxyGroupNames(config).includes(openAiProxyGroup.name)) return [];

  return [`RULE-SET,OpenAI,${openAiProxyGroup.name}`];
}

function buildRejectRules() {
  return rejectRuleProviderNames.map(
    (providerName) => `RULE-SET,${providerName},REJECT`,
  );
}

const fakeIpFilterRules = [
  "localhost.ptlogin2.qq.com",
  "localhost.sec.qq.com",
  "localhost.work.weixin.qq.com",
  "*.weixin.qq.com",
  "*.wechat.com",
  "*.dingtalk.com",
  "*.dingtalkapps.com",
];

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
      .concat(buildRejectRules())
      .concat(buildOpenAiProxyRules(config))
      .concat(buildUsProxyRules(config))
      .concat(proxyRules)
      .concat(oldRules),
  );
}

function ensureDns(config) {
  config.dns = config.dns || {};

  return config.dns;
}

function getOldFakeIpFilter(dns) {
  return Array.isArray(dns["fake-ip-filter"]) ? dns["fake-ip-filter"] : [];
}

function mergeFakeIpFilter(config) {
  const dns = ensureDns(config);
  const oldFakeIpFilter = getOldFakeIpFilter(dns);

  dns["fake-ip-filter"] = uniqueRules(
    fakeIpFilterRules.concat(oldFakeIpFilter),
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

function shouldIncludeProxyName(proxyName) {
  if (typeof proxyName !== "string") return false;

  // 未配置 include 规则时不限制节点，便于仅使用 exclude 规则。
  if (!proxyRegions.some((region) => region.included)) return true;

  const region = getProxyRegion(proxyName);

  return Boolean(region && region.included);
}

function shouldExcludeProxyName(proxyName) {
  if (typeof proxyName !== "string") return false;

  return excludedProxyNameRules.some((rule) => {
    return matchesProxyNameRule(proxyName, rule);
  });
}

function ensureUsProxyGroup(config) {
  if (!Array.isArray(config.proxies)) return;

  const usProxyNames = config.proxies
    .map(getProxyName)
    .filter(Boolean)
    .filter((proxyName) => {
      const region = getProxyRegion(proxyName);

      return region && region.id === "US";
    })
    .filter((proxyName) => !shouldExcludeProxyName(proxyName));

  const groups = getProxyGroups(config);
  const oldGroup = groups.find(
    (group) => group && group.name === usProxyGroup.name,
  );

  if (usProxyNames.length === 0) {
    config["proxy-groups"] = groups.filter(
      (group) => !group || group.name !== usProxyGroup.name,
    );
    console.warn(
      "[clash-verge] No US proxy nodes found. US rules were skipped.",
    );
    return;
  }

  const nextGroup = {
    ...oldGroup,
    ...usProxyGroup,
    proxies: usProxyNames,
  };

  if (oldGroup) {
    groups[groups.indexOf(oldGroup)] = nextGroup;
  } else {
    groups.push(nextGroup);
  }

  config["proxy-groups"] = groups;
}

function ensureOpenAiProxyGroup(config, profileName) {
  const groups = getProxyGroups(config);
  const oldGroup = groups.find(
    (group) => group && group.name === openAiProxyGroup.name,
  );
  const proxyPolicy = resolveProxyPolicy(config, profileName);
  const proxies = Array.from(new Set([proxyPolicy, usProxyGroup.name])).filter(
    (groupName) =>
      groupName &&
      groupName !== openAiProxyGroup.name &&
      getProxyGroupNames(config).includes(groupName),
  );

  if (proxies.length === 0) {
    config["proxy-groups"] = groups.filter(
      (group) => !group || group.name !== openAiProxyGroup.name,
    );
    console.warn(
      "[clash-verge] No proxy groups found for OpenAI. OpenAI rules were skipped.",
    );
    return;
  }

  const nextGroup = {
    ...oldGroup,
    ...openAiProxyGroup,
    proxies,
  };

  if (oldGroup) {
    groups[groups.indexOf(oldGroup)] = nextGroup;
  } else {
    groups.push(nextGroup);
  }

  config["proxy-groups"] = groups;
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
      // 非订阅项必须保留，否则可能破坏代理组之间的引用关系。
      if (!proxyNames.has(proxyName)) return true;

      return shouldIncludeProxyName(proxyName);
    });

    group.proxies = group.proxies.filter((proxyName) => {
      if (!proxyNames.has(proxyName)) return true;

      return !shouldExcludeProxyName(proxyName);
    });

    const hasProxyNode = group.proxies.some((proxyName) =>
      proxyNames.has(proxyName),
    );

    // 仅当原组含订阅节点且筛选后清空时告警，避免对纯策略组误报。
    if (hadProxyNode && !hasProxyNode) {
      console.warn(
        `[clash-verge] No proxy nodes remain in group "${group.name || "<unnamed>"}" after include/exclude filtering.`,
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

function main(config, profileName) {
  ensureUsProxyGroup(config);
  ensureOpenAiProxyGroup(config, profileName);
  filterAndSortProxyGroupProxies(config);
  mergeProxyRules(config, profileName);
  mergeFakeIpFilter(config);

  return config;
}
