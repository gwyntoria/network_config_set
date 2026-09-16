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
    "DIRECT",
  ]);
  assert.deepEqual(Array.from(getGroup(config, "US").proxies), [
    "US-02",
    "US-01",
  ]);
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

test("is idempotent for managed groups, rules, and fake IP filters", () => {
  const main = loadMain();
  const config = makeConfig(["JP-01", "US-01"]);

  main(config, "UNKNOWN");
  const once = JSON.parse(JSON.stringify(config));
  main(config, "UNKNOWN");

  assert.equal(JSON.stringify(config), JSON.stringify(once));
});
