/** Clash Verge Rev 全局扩展脚本：维护公共 DNS 和 QUIC 域名嗅探。 */

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
    "https://223.5.5.5/dns-query",
    "https://223.6.6.6/dns-query",
  ],
  "proxy-server-nameserver": [
    "https://223.5.5.5/dns-query",
    "https://223.6.6.6/dns-query",
  ],
  "fallback": [
    "https://223.5.5.5/dns-query",
    "https://223.6.6.6/dns-query",
  ],
};

function applyDnsOverrides(config) {
  const currentDns =
    config.dns && typeof config.dns === "object" ? config.dns : {};

  // 数组字段整体替换，确保订阅自带的境外 DoH 不会残留。
  config.dns = { ...currentDns, ...dnsOverrides };
}

function applyQuicSniffing(config) {
  const sniffer = config.sniffer ?? {};
  const protocols = sniffer.sniff ?? {};
  const quic = protocols.QUIC ?? {};
  const ports = Array.isArray(quic.ports) ? quic.ports : [];

  // 从纯 IP 的 UDP/443 连接识别域名，默认保留 QUIC 连接的原目标。
  config.sniffer = {
    ...sniffer,
    enable: true,
    "parse-pure-ip": true,
    sniff: {
      ...protocols,
      QUIC: {
        "override-destination": false,
        ...quic,
        ports: ports.some((port) => String(port) === "443") ? ports : [...ports, 443],
      },
    },
  };
}

function main(config, profileName) {
  applyDnsOverrides(config);
  applyQuicSniffing(config);
  return config;
}
