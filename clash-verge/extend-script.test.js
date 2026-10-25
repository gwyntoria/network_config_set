const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadScript() {
  const scriptPath = path.join(__dirname, "extend-script.js");
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
  const filePath = path.join(__dirname, "..", "rules", "clash", fileName);
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
    "US-02",
    "JP-US Relay",
    "US-01",
    "japan-01",
    "Tokyo-02",
    "RUSSIA-01",
    "DIRECT",
  ]);
  assert.deepEqual(Array.from(getGroup(config, "US").proxies), [
    "US-02",
    "JP-US Relay",
    "US-01",
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
    "US-01",
    "JP-01",
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
    "US-01",
    "JP-01",
    "韩国 A01",
    "TW-01",
    "英国 A01",
    "DIRECT",
  ]);
  assert.deepEqual(Array.from(getGroup(config, "US").proxies), ["US-01"]);
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
    nameserver: ["https://doh.pub/dns-query", "https://dns.alidns.com/dns-query"],
    "proxy-server-nameserver": [
      "https://doh.pub/dns-query", "https://dns.alidns.com/dns-query",
    ],
    fallback: ["https://doh.pub/dns-query", "https://dns.alidns.com/dns-query"],
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
