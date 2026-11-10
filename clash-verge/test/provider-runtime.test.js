const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

// 可选的真实内核验证：MIHOMO_BINARY=/path/to/mihomo node clash-verge/test/provider-runtime.test.js
// 仅使用临时目录、回环地址和假订阅，不访问真实机场，不启动 TUN 或代理入站。
test("Mihomo expands subscriptions, preserves cache on failure and rejects empty region groups", {
  skip: process.env.MIHOMO_BINARY ? false : "Set MIHOMO_BINARY to run the local Mihomo integration test",
  timeout: 30000,
}, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "clash-provider-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let offline = false;
  const server = http.createServer((request, response) => {
    if (offline || request.url === "/unavailable") {
      response.writeHead(503).end();
      return;
    }
    const names = request.url === "/first"
      ? ["JP-02", "US-01", "US-IPv6", "RUSSIA-01", "JP-US Relay", "香港 US-02"]
      : ["日本-01", "us-02", "DE-01", "香港-01"];
    response.setHeader("Content-Type", "application/yaml");
    response.end(JSON.stringify({
      proxies: names.map((name) => ({ name, type: "socks5", server: "127.0.0.1", port: 1 })),
    }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const source = await fs.readFile(path.join(__dirname, "..", "extend-script.js"), "utf8");
  const context = vm.createContext({ console });
  vm.runInContext(`${source}\nglobalThis.__main = main;`, context);

  // 先占用一个随机端口，写配置后交给内核的控制 API 使用。
  const reservation = http.createServer();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const controller = `127.0.0.1:${reservation.address().port}`;
  await new Promise((resolve) => reservation.close(resolve));
  const config = {
    "external-controller": controller,
    "log-level": "error",
    proxies: ["JP-local", "US-local"].map((name) => ({ name, type: "socks5", server: "127.0.0.1", port: 1 })),
    "proxy-groups": [{ name: "Proxy", type: "select", proxies: ["JP-local", "US-local", "DIRECT"] }],
    "proxy-providers": {
      sanmao: { type: "http", url: `${origin}/first`, path: "./first.yaml", override: { "additional-prefix": "[三毛] " } },
      second: { type: "http", url: `${origin}/second`, path: "./second.yaml", override: { "additional-prefix": "[US.JP+IPv6`]+ " } },
      unavailable: { type: "http", url: `${origin}/unavailable`, path: "./unavailable.yaml" },
    },
    "rule-providers": Object.fromEntries(
      ["AD", "GameDirect", "GameProxy", "OpenAI", "Gemini", "Anthropic", "TikTok", "PayPal"].map((name) => [
        name, { type: "inline", behavior: "classical", payload: ["DOMAIN,fixture.invalid"] },
      ]),
    ),
    rules: ["MATCH,Proxy"],
  };
  context.__main(config, "nozomi");
  // 测试进程不接管宿主机 DNS 端口。
  config.dns = { enable: false };
  const configPath = path.join(directory, "config.json");
  await fs.writeFile(configPath, JSON.stringify(config));
  let child;
  let logs = "";
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const current = child;
    await new Promise((resolve) => { current.once("exit", resolve); current.kill(); });
  }
  t.after(stop);
  async function start() {
    logs = "";
    child = spawn(process.env.MIHOMO_BINARY, ["-d", directory, "-f", configPath], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => { logs += chunk; });
    child.stderr.on("data", (chunk) => { logs += chunk; });
    child.on("error", (error) => { logs += error.message; });
  }
  async function api(endpoint, method = "GET") {
    const response = await fetch(`http://${controller}${endpoint}`, { method, signal: AbortSignal.timeout(1500) });
    assert.ok(response.ok, `${endpoint}: ${response.status}`);
    return response.status === 204 ? null : response.json();
  }
  async function waitFor(check) {
    let error;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { return await check(); } catch (caught) { error = caught; }
      if (child.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`${error}\n${logs}`);
  }
  async function groups() {
    return (await api("/proxies")).proxies;
  }
  await start();
  const expectedUS = ["US-local", "[三毛] US-01", "[US.JP+IPv6`]+ us-02"];
  await waitFor(async () => {
    const state = await groups();
    assert.deepEqual(state.US.all, expectedUS);
    assert.deepEqual(state.JP.all, ["JP-local", "[三毛] JP-02", "[三毛] JP-US Relay", "[US.JP+IPv6`]+ 日本-01"]);
    assert.deepEqual(state.Proxy.all, [
      "JP-local", "US-local", "DIRECT", "[三毛] JP-02", "[三毛] US-01", "[三毛] JP-US Relay",
      "[三毛] 香港 US-02", "[US.JP+IPv6`]+ 日本-01", "[US.JP+IPv6`]+ us-02", "[US.JP+IPv6`]+ 香港-01",
    ]);
  });
  const unavailable = await api("/providers/proxies/unavailable");
  assert.deepEqual(unavailable.proxies, []);

  offline = true;
  // 强制刷新失败，已下载的节点和磁盘缓存都应继续可用。
  const update = await fetch(`http://${controller}/providers/proxies/sanmao`, { method: "PUT" });
  assert.equal(update.status, 503);
  assert.deepEqual((await groups()).US.all, expectedUS);
  await stop();
  await start();
  await waitFor(async () => assert.deepEqual((await groups()).US.all, expectedUS));
  await stop();

  offline = false;
  const empty = JSON.parse(JSON.stringify(config));
  empty.proxies = [];
  empty["proxy-groups"] = [{ name: "Proxy", type: "select", proxies: ["DIRECT"] }];
  empty["proxy-providers"] = {
    hk: { type: "inline", payload: [{ name: "香港-01", type: "socks5", server: "127.0.0.1", port: 1 }], override: { "additional-prefix": "[香港源] " } },
  };
  context.__main(empty, "nozomi");
  empty.dns = { enable: false };
  await fs.writeFile(configPath, JSON.stringify(empty));
  await start();
  await waitFor(async () => {
    const state = await groups();
    assert.deepEqual(state.US.all, ["REJECT"]);
    assert.deepEqual(state.JP.all, ["REJECT"]);
    assert.deepEqual(state.Proxy.all, ["DIRECT", "[香港源] 香港-01"]);
  });
});
