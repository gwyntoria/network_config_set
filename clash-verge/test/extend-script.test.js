const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadScript() {
  const scriptPath = path.join(__dirname, "..", "extend-script.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  const context = vm.createContext({
    console: { warn() {} },
  });

  vm.runInContext(`${source}\nglobalThis.__main = main;`, context, {
    filename: scriptPath,
  });

  return context;
}

function loadMain(options = {}) {
  const context = loadScript();

  if (options.whitelist === false) {
    vm.runInContext("includedProxyNameRules.length = 0;", context);
  }

  return context.__main;
}

function loadMainWithWhitelist(rules) {
  const context = loadScript();

  vm.runInContext("includedProxyNameRules.length = 0;", context);
  vm.runInContext(
    `includedProxyNameRules.push(...${JSON.stringify(rules)});`,
    context,
  );

  return context.__main;
}

function makeConfig(proxyNames) {
  return {
    proxies: proxyNames.map((name) => ({ name, type: "ss" })),
    "proxy-groups": [
      {
        name: "Proxy",
        type: "select",
        proxies: [...proxyNames, "DIRECT"],
      },
    ],
    rules: ["MATCH,DIRECT"],
  };
}

function getGroup(config, name) {
  return config["proxy-groups"].find((group) => group.name === name);
}

function readGameProviderRules(fileName) {
  const filePath = path.join(__dirname, "..", "..", "rules", "clash", fileName);
  const source = fs.readFileSync(filePath, "utf8");

  return source
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s+(\S+)\s*$/))
    .filter(Boolean)
    .map((match) => match[1]);
}

function matchesRule(rule, host) {
  const [type, value] = rule.split(",");

  if (type === "DOMAIN") return host === value;
  if (type === "DOMAIN-SUFFIX") {
    return host === value || host.endsWith(`.${value}`);
  }

  return false;
}

function resolveGamePolicy(host) {
  // GameDirect 先于 GameProxy 插入，Mihomo 按首条命中规则执行。
  const providers = [
    ["game-direct.yaml", "DIRECT"],
    ["game-proxy.yaml", "PROXY"],
  ];

  for (const [fileName, policy] of providers) {
    const rules = readGameProviderRules(fileName);

    if (rules.some((rule) => matchesRule(rule, host))) return policy;
  }

  return null;
}

test("recognizes one region per node and sorts known regions stably", () => {
  const main = loadMain({ whitelist: false });
  const config = makeConfig([
    "US-02",
    "japan-01",
    "JP-US Relay",
    "US-01",
    "RUSSIA-01",
    "Tokyo-02",
  ]);

  main(config, "UNKNOWN");

  assert.deepEqual(Array.from(getGroup(config, "Proxy").proxies), [
    "japan-01",
    "JP-US Relay",
    "Tokyo-02",
    "US-02",
    "US-01",
    "RUSSIA-01",
    "DIRECT",
  ]);
  assert.deepEqual(Array.from(getGroup(config, "US").proxies), [
    "US-02",
    "US-01",
  ]);
  assert.deepEqual(Array.from(getGroup(config, "JP").proxies), [
    "japan-01", "JP-US Relay", "Tokyo-02",
  ]);
});

test("keeps unconfigured regions in order and preserves group references", () => {
  const main = loadMain({ whitelist: false });
  const names = ["DE-02", "US-01", "Unknown", "HK-01", "DE-01"];
  const config = makeConfig(names);
  getGroup(config, "Proxy").proxies = [
    "DIRECT", "DE-02", "US-01", "Other", "Unknown", "HK-01", "DE-01", "REJECT",
  ];
  config["proxy-groups"].push({
    name: "Other", type: "select", proxies: ["DE-02", "Unknown", "DE-01"],
  });

  main(config, "UNKNOWN");

  assert.deepEqual(Array.from(getGroup(config, "Proxy").proxies), [
    "DIRECT", "HK-01", "US-01", "Other", "DE-02", "Unknown", "DE-01", "REJECT",
  ]);
  assert.deepEqual(Array.from(getGroup(config, "Other").proxies), [
    "DE-02", "Unknown", "DE-01",
  ]);
  assert.deepEqual(config.proxies.map((proxy) => proxy.name), names);
});

test("keeps exclusions separate from region recognition", () => {
  const main = loadMain({ whitelist: false });
  const config = makeConfig(["JP-IPv6", "JP-01", "US-ipv6", "US-01"]);

  main(config, "UNKNOWN");

  assert.deepEqual(Array.from(getGroup(config, "Proxy").proxies), [
    "JP-01",
    "US-01",
    "DIRECT",
  ]);
  assert.deepEqual(Array.from(getGroup(config, "US").proxies), ["US-01"]);
});

test("keeps only the configured whitelist regions", () => {
  const main = loadMain();
  const config = makeConfig([
    "香港 A01",
    "JP-01",
    "韩国 A01",
    "US-01",
    "TW-01",
    "英国 A01",
    "DE-01",
  ]);

  main(config, "UNKNOWN");

  assert.deepEqual(Array.from(getGroup(config, "Proxy").proxies), [
    "香港 A01",
    "JP-01",
    "韩国 A01",
    "US-01",
    "英国 A01",
    "DIRECT",
  ]);
  assert.deepEqual(Array.from(getGroup(config, "US").proxies), ["US-01"]);
});

test("creates US and JP manual selectors with original profile nodes", () => {
  const main = loadMain();
  const config = makeConfig(["US-01", "JP-01", "US-02", "JP-02", "JP-IPv6"]);

  main(config, "UNKNOWN");

  for (const [groupName, proxyNames] of [
    ["US", ["US-01", "US-02"]],
    ["JP", ["JP-01", "JP-02"]],
  ]) {
    const group = getGroup(config, groupName);

    assert.ok(group);
    assert.equal(group.type, "select");
    assert.deepEqual(Array.from(group.proxies), proxyNames);
    assert.equal(group.url, undefined);
    assert.equal(group.interval, undefined);
    assert.equal(group.lazy, undefined);
    assert.equal(group.tolerance, undefined);
  }
});

test("replaces existing regional settings and removes groups without eligible nodes", () => {
  const main = loadMain();
  const config = makeConfig(["US-01", "JP-IPv6"]);
  for (const name of ["US", "JP"]) {
    config["proxy-groups"].push({
      name, type: "select", proxies: ["DIRECT"],
      url: "https://example.com", interval: 60, lazy: true, tolerance: 100,
    });
  }

  main(config, "UNKNOWN");

  const us = getGroup(config, "US");
  assert.equal(us.type, "select");
  assert.equal(us.url, undefined);
  assert.equal(us.interval, undefined);
  assert.equal(us.lazy, undefined);
  assert.equal(us.tolerance, undefined);
  assert.deepEqual(Array.from(us.proxies), ["US-01"]);
  assert.equal(getGroup(config, "JP"), undefined);
});

test("creates AI and TikTok groups with proxy and region choices", () => {
  const main = loadMain();
  const config = makeConfig(["US-01", "JP-01"]);

  main(config, "UNKNOWN");

  for (const groupName of ["AI", "TikTok"]) {
    const group = getGroup(config, groupName);

    assert.ok(group);
    assert.equal(group.type, "select");
    assert.deepEqual(Array.from(group.proxies), [
      "Proxy",
      "US",
      "JP",
    ]);
  }

  assert.equal(config["proxy-groups"].at(-1).name, "AI");
});

test("routes AI, TikTok and PayPal rule providers to their groups", () => {
  const main = loadMain();
  const config = makeConfig(["US-01", "JP-01"]);

  main(config, "UNKNOWN");

  for (const rule of [
    "RULE-SET,OpenAI,AI",
    "RULE-SET,Gemini,AI",
    "RULE-SET,Anthropic,AI",
    "RULE-SET,TikTok,TikTok",
    "RULE-SET,PayPal,Proxy",
  ]) {
    assert.ok(config.rules.includes(rule), rule);
  }

  assert.ok(!config.rules.includes("RULE-SET,PayPal,US"));
});

test("skips missing region choices and removes the legacy OpenAI group", () => {
  const main = loadMain();
  const config = makeConfig(["US-01"]);

  config["proxy-groups"].push({
    name: "OpenAI",
    type: "select",
    proxies: ["Proxy"],
  });

  main(config, "UNKNOWN");

  assert.equal(getGroup(config, "JP"), undefined);
  assert.equal(getGroup(config, "OpenAI"), undefined);
  assert.deepEqual(Array.from(getGroup(config, "AI").proxies), [
    "Proxy",
    "US",
  ]);
  assert.deepEqual(Array.from(getGroup(config, "TikTok").proxies), [
    "Proxy",
    "US",
  ]);
});

test("places AI and TikTok rules before the general proxy providers", () => {
  const main = loadMain();
  const config = makeConfig(["US-01", "JP-01"]);

  main(config, "UNKNOWN");

  const aiIndex = config.rules.indexOf("RULE-SET,OpenAI,AI");
  const tiktokIndex = config.rules.indexOf("RULE-SET,TikTok,TikTok");
  const paypalIndex = config.rules.indexOf("RULE-SET,PayPal,Proxy");
  const subscriptionIndex = config.rules.indexOf("MATCH,DIRECT");

  assert.ok(aiIndex < tiktokIndex);
  assert.ok(tiktokIndex < paypalIndex);
  assert.ok(paypalIndex < subscriptionIndex);
});

test("filters nodes by whitelist with blacklist taking precedence", () => {
  const main = loadMainWithWhitelist([
    { name: "HK and US", keywords: ["香港"], codes: ["US"] },
    { name: "IPv6", keywords: ["ipv6"] },
  ]);
  const names = ["US-IPv6", "香港-01", "JP-01", "US-01", "RUSSIA-01"];
  const config = makeConfig(names);
  getGroup(config, "Proxy").proxies = [
    "DIRECT", "US-01", "Other", "香港-01", "JP-01", "US-IPv6", "RUSSIA-01", "REJECT",
  ];
  config["proxy-groups"].push({
    name: "Other", type: "select", proxies: ["US-01", "香港-01", "JP-01"],
  });

  main(config, "UNKNOWN");

  assert.deepEqual(Array.from(getGroup(config, "Proxy").proxies), [
    "DIRECT", "香港-01", "Other", "US-01", "REJECT",
  ]);
  assert.deepEqual(Array.from(getGroup(config, "Other").proxies), [
    "香港-01", "US-01",
  ]);
  assert.deepEqual(Array.from(getGroup(config, "US").proxies), ["US-01"]);
  assert.deepEqual(config.proxies.map((proxy) => proxy.name), names);
});

test("routes game rule providers before subscription rules", () => {
  const main = loadMain();
  const config = makeConfig(["JP-01"]);

  main(config, "UNKNOWN");

  const gameDirectIndex = config.rules.indexOf("RULE-SET,GameDirect,DIRECT");
  const gameProxyIndex = config.rules.indexOf("RULE-SET,GameProxy,Proxy");
  const subscriptionRuleIndex = config.rules.indexOf("MATCH,DIRECT");

  assert.notEqual(gameDirectIndex, -1);
  assert.notEqual(gameProxyIndex, -1);
  assert.ok(gameDirectIndex < gameProxyIndex);
  assert.ok(gameProxyIndex < subscriptionRuleIndex);
});

test("keeps Steam store proxied while download hosts stay direct", () => {
  const proxiedHosts = [
    "store.steampowered.com",
    "checkout.steampowered.com",
    "login.steampowered.com",
    "steamcommunity.com",
  ];
  const directHosts = [
    "client-download.steampowered.com",
    "api.steampowered.com",
    "cdn.steampowered.com",
    "steamcontent.com",
    "steamstatic.com",
  ];

  for (const host of proxiedHosts) {
    assert.equal(resolveGamePolicy(host), "PROXY", host);
  }

  for (const host of directHosts) {
    assert.equal(resolveGamePolicy(host), "DIRECT", host);
  }
});

test("is idempotent for managed groups and rules", () => {
  const main = loadMain();
  const config = makeConfig(["JP-01", "US-01"]);

  main(config, "UNKNOWN");
  const once = JSON.parse(JSON.stringify(config));
  main(config, "UNKNOWN");

  assert.equal(JSON.stringify(config), JSON.stringify(once));
});

test("overrides managed DNS settings and preserves other fields", () => {
  const main = loadMain();
  const config = makeConfig(["JP-01"]);
  config.dns = {
    enable: false,
    "enhanced-mode": "redir-host",
    "fake-ip-range": "198.19.0.1/16",
    listen: "127.0.0.1:5353",
    "fake-ip-filter": ["example.com"],
    nameserver: ["https://1.1.1.1/dns-query"],
    "proxy-server-nameserver": ["system"],
    fallback: ["https://dns.google/dns-query"],
    ipv6: false,
  };
  const expectedDns = {
    enable: true,
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/16",
    listen: ":53",
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
    nameserver: ["https://223.5.5.5/dns-query", "https://223.6.6.6/dns-query"],
    "proxy-server-nameserver": [
      "https://223.5.5.5/dns-query", "https://223.6.6.6/dns-query",
    ],
    fallback: ["https://223.5.5.5/dns-query", "https://223.6.6.6/dns-query"],
  };

  main(config, "UNKNOWN");

  assert.deepEqual(JSON.parse(JSON.stringify(config.dns)), {
    ...expectedDns,
    ipv6: false,
  });

  delete config.dns;
  main(config, "UNKNOWN");
  assert.deepEqual(JSON.parse(JSON.stringify(config.dns)), expectedDns);
});

function addProviders(config) {
  config["proxy-providers"] = {
    sanmao: {
      type: "http",
      url: "https://example.invalid/sanmao",
      path: "./proxy_providers/sanmao.yaml",
      override: { "additional-prefix": "[三毛] " },
    },
    second: {
      type: "http",
      url: "https://example.invalid/second",
      path: "./proxy_providers/second.yaml",
      override: { "additional-prefix": "[US.JP+IPv6] " },
    },
  };
}

// 生成式使用 Mihomo 的 (?i) 标志，其余语法可直接交给 JavaScript 校验匹配结果。
// 内核配置解析和真实 provider 展开另用 Mihomo 运行验证。
function providerNodeNames(group, names) {
  assert.ok(group.filter.startsWith("(?i)"));
  const pattern = new RegExp(group.filter.slice(4), "i");
  return names.filter((name) => pattern.test(name));
}

test("does not import providers when absent or empty", () => {
  const main = loadMain();
  const absent = makeConfig(["US-01", "JP-01"]);
  const empty = makeConfig(["US-01", "JP-01"]);
  empty["proxy-providers"] = {};
  main(absent, "nozomi");
  main(empty, "nozomi");
  assert.equal(absent["proxy-providers"], undefined);
  delete empty["proxy-providers"];
  assert.equal(JSON.stringify(empty), JSON.stringify(absent));
  for (const name of ["Proxy", "US", "JP"]) {
    assert.equal(getGroup(absent, name).use, undefined);
    assert.equal(getGroup(absent, name).filter, undefined);
  }
});

test("attaches every provider to the main selector across profiles without duplicates", () => {
  const main = loadMain();
  for (const [profile, policy] of [["nozomi", "Proxy"], ["CLOUD", "🔰 手动选择"], ["GHELPER", "Ghelper"]]) {
    const config = makeConfig(["JP-local", "US-local"]);
    getGroup(config, "Proxy").name = policy;
    getGroup(config, policy).use = ["sanmao"];
    config["proxy-groups"].push({ name: "Other", type: "select", proxies: ["DIRECT"] });
    addProviders(config);
    main(config, profile);
    const once = JSON.stringify(config);
    main(config, profile);
    assert.equal(JSON.stringify(config), once);
    for (const name of [policy, "US", "JP"]) {
      assert.deepEqual(Array.from(getGroup(config, name).use), ["sanmao", "second"]);
    }
    assert.deepEqual(Array.from(getGroup(config, policy).proxies), ["JP-local", "US-local", "DIRECT"]);
    assert.equal(getGroup(config, "Other").use, undefined);
    assert.equal(getGroup(config, "AI").use, undefined);
    assert.equal(getGroup(config, "TikTok").use, undefined);
  }
});

test("defaults provider refresh and exit while preserving YAML prefixes and overrides", () => {
  const main = loadMain();
  const config = makeConfig(["US-local"]);
  addProviders(config);
  const first = config["proxy-providers"].sanmao;
  first.override.udp = true;
  first["health-check"] = { timeout: 2500, lazy: true, interval: 30 };
  const second = config["proxy-providers"].second;
  second.interval = 7200;
  second.proxy = "Proxy";
  delete second.override;
  main(config, "nozomi");
  assert.equal(first.interval, 86400);
  assert.equal(first.proxy, "DIRECT");
  assert.equal(first.override["additional-prefix"], "[三毛] ");
  assert.equal(first.override.udp, true);
  assert.equal(second.interval, 7200);
  assert.equal(second.proxy, "Proxy");
  assert.equal(second.override["additional-prefix"], "[second] ");
  assert.deepEqual(JSON.parse(JSON.stringify(first["health-check"])), {
    enable: true, url: "https://www.gstatic.com/generate_204", interval: 3600,
    lazy: false, timeout: 2500,
  });
});

test("filters provider names by whitelist, blacklist and first matching region after the source prefix", () => {
  const main = loadMain();
  const config = makeConfig(["US-local", "JP-local"]);
  addProviders(config);
  main(config, "nozomi");
  const names = [
    "[三毛] JP-02", "[三毛] US-01", "[三毛] 香港-01", "[三毛] JP-US Relay",
    "[三毛] US-IPv6", "[三毛] RUSSIA-01", "[三毛] UK-01", "[三毛] SG-01",
    "[US.JP+IPv6] 日本-01", "[US.JP+IPv6] us-02", "[US.JP+IPv6] DE-01",
    "[US.JP+IPv6] 韩国-01", "[三毛] AUS-01", "[三毛] USAGE-01", "[三毛] (US) 03",
    "[三毛] 香港 US-04", "[三毛] JP-IPv6", "[USxJPIPv6] US-01",
  ];
  assert.deepEqual(providerNodeNames(getGroup(config, "Proxy"), names), [
    names[0], names[1], names[2], names[3], names[6], names[8], names[9], names[11], names[14], names[15],
  ]);
  assert.deepEqual(providerNodeNames(getGroup(config, "JP"), names), [names[0], names[3], names[8]]);
  assert.deepEqual(providerNodeNames(getGroup(config, "US"), names), [names[1], names[9], names[14]]);
  // 导入节点保留来源顺序，不与显式订阅节点交叉重排。
  assert.deepEqual(Array.from(getGroup(config, "US").proxies), ["US-local"]);
});

test("supports an empty whitelist and applies blacklist before whitelist to providers", () => {
  for (const main of [loadMain({ whitelist: false }), loadMainWithWhitelist([{ keywords: ["ipv6"], codes: ["US"] }])]) {
    const config = makeConfig([]);
    addProviders(config);
    main(config, "nozomi");
    const names = ["[三毛] US-IPv6", "[三毛] US-01", "[三毛] DE-01"];
    assert.deepEqual(providerNodeNames(getGroup(config, "US"), names), [names[1]]);
    assert.ok(!providerNodeNames(getGroup(config, "Proxy"), names).includes(names[0]));
  }
  const config = makeConfig([]);
  addProviders(config);
  loadMain({ whitelist: false })(config, "nozomi");
  assert.deepEqual(providerNodeNames(getGroup(config, "Proxy"), ["[三毛] DE-01"]), ["[三毛] DE-01"]);
});

test("creates provider-only regional groups and rejects when no nodes match", () => {
  for (const omitProxies of [false, true]) {
    const config = makeConfig([]);
    if (omitProxies) delete config.proxies;
    addProviders(config);
    loadMain()(config, "nozomi");
    for (const name of ["US", "JP"]) {
      const group = getGroup(config, name);
      assert.equal(group.type, "select");
      assert.deepEqual(Array.from(group.proxies), []);
      assert.equal(group["empty-fallback"], "REJECT");
      assert.deepEqual(providerNodeNames(group, ["[三毛] 香港-01", "[三毛] IPv6"]), []);
    }
    assert.deepEqual(Array.from(getGroup(config, "AI").proxies), ["Proxy", "US", "JP"]);
  }
});

test("keeps implicit main subscription nodes when the selector uses include-all", () => {
  for (const field of ["include-all", "include-all-proxies"]) {
    const config = makeConfig(["US-local", "JP-local", "JP-IPv6"]);
    const group = getGroup(config, "Proxy");
    group.proxies = ["DIRECT"];
    group[field] = true;
    addProviders(config);
    loadMain()(config, "nozomi");
    assert.deepEqual(Array.from(group.proxies), ["DIRECT", "JP-local", "US-local"]);
    assert.equal(group[field], undefined);
  }
});

test("does not backtrack to a shorter source prefix during region matching", () => {
  const config = makeConfig([]);
  addProviders(config);
  config["proxy-providers"].sanmao.override["additional-prefix"] = "[source] ";
  config["proxy-providers"].second.override["additional-prefix"] = "[source] US ";
  loadMain()(config, "nozomi");
  const names = ["[source] US DE-01", "[source] US JP-01", "[source] US US-01"];
  assert.deepEqual(providerNodeNames(getGroup(config, "Proxy"), names), [names[1], names[2]]);
  assert.deepEqual(providerNodeNames(getGroup(config, "US"), names), [names[2]]);
});

test("treats source prefix punctuation literally without creating Mihomo filter separators", () => {
  const config = makeConfig([]);
  addProviders(config);
  const prefix = "[source`]+(x)?\\ ";
  config["proxy-providers"].sanmao.override["additional-prefix"] = prefix;
  loadMain()(config, "nozomi");
  const group = getGroup(config, "US");
  assert.equal(group.filter.includes("`"), false);
  assert.deepEqual(providerNodeNames(group, [`${prefix}US-01`, "source US-02"]), [`${prefix}US-01`]);
});
