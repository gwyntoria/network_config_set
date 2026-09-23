const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadMain() {
  const scriptPath = path.join(__dirname, "extend-script.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  const context = vm.createContext({
    console: { warn() {} },
  });

  vm.runInContext(`${source}\nglobalThis.__main = main;`, context, {
    filename: scriptPath,
  });

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

test("recognizes one region per node and sorts known regions stably", () => {
  const main = loadMain();
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
});

test("keeps unconfigured regions in order and preserves group references", () => {
  const main = loadMain();
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
  const main = loadMain();
  const config = makeConfig(["JP-IPv6", "JP-01", "US-ipv6", "US-01"]);

  main(config, "UNKNOWN");

  assert.deepEqual(Array.from(getGroup(config, "Proxy").proxies), [
    "JP-01",
    "US-01",
    "DIRECT",
  ]);
  assert.deepEqual(Array.from(getGroup(config, "US").proxies), ["US-01"]);
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

test("is idempotent for managed groups and rules", () => {
  const main = loadMain();
  const config = makeConfig(["JP-01", "US-01"]);

  main(config, "UNKNOWN");
  const once = JSON.parse(JSON.stringify(config));
  main(config, "UNKNOWN");

  assert.equal(JSON.stringify(config), JSON.stringify(once));
});

test("leaves DNS settings unchanged", () => {
  const main = loadMain();
  const config = makeConfig(["JP-01"]);
  config.dns = { "fake-ip-filter": ["example.com"] };
  const dns = config.dns;

  main(config, "UNKNOWN");

  assert.equal(config.dns, dns);
  assert.deepEqual(config.dns["fake-ip-filter"], ["example.com"]);

  delete config.dns;
  main(config, "UNKNOWN");
  assert.equal(Object.hasOwn(config, "dns"), false);
});
