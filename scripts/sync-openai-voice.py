"""Update the ChatGPT Voice sections from the official IP snapshot."""

import json
import re
import sys
from collections import Counter
from datetime import UTC, datetime
from ipaddress import ip_network
from pathlib import Path
from urllib.request import urlopen

URL = "https://openai.com/chatgpt-voice.json"
MARKER = f"# ChatGPT Voice IP Ranges · {URL} · "
ROOT = Path(__file__).resolve().parent.parent


def parse_timestamp(value):
    timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if timestamp.tzinfo is None:
        raise ValueError("Snapshot timestamp must include a timezone")
    return timestamp.astimezone(UTC)


def parse_snapshot(snapshot):
    timestamp = parse_timestamp(snapshot["creationTime"])
    prefixes = snapshot["prefixes"]
    if not isinstance(prefixes, list) or not prefixes:
        raise ValueError("Official snapshot must contain a non-empty prefixes list")

    networks = set()
    for entry in prefixes:
        if not isinstance(entry, dict) or len(entry) != 1:
            raise ValueError(f"Invalid official prefix: {entry!r}")
        key, value = next(iter(entry.items()))
        if not isinstance(value, str) or "/" not in value:
            raise ValueError(f"Invalid CIDR: {value!r}")
        network = ip_network(value)
        if key != f"ipv{network.version}Prefix" or not network.is_global:
            raise ValueError(f"Invalid official prefix: {entry!r}")
        if network in networks:
            raise ValueError(f"Duplicate official prefix: {network}")
        networks.add(network)
    return timestamp, networks


def read_rules(path, indent, prefix, suffix, ipv6_type):
    text = path.read_text(encoding="utf-8")
    marker = indent + MARKER
    lines = text.splitlines(keepends=True)
    indexes = [i for i, line in enumerate(lines) if line.startswith(marker)]
    if len(indexes) != 1:
        raise ValueError(f"{path}: expected one voice section")
    index = indexes[0]
    timestamp = parse_timestamp(lines[index].removeprefix(marker).strip())
    pattern = re.compile(
        rf"{re.escape(prefix)}(IP-CIDR|{ipv6_type}),([^,]+){re.escape(suffix)}"
    )
    networks = set()
    for line in lines[index + 1 :]:
        match = pattern.fullmatch(line.rstrip("\n"))
        if not match:
            raise ValueError(
                f"{path}: unexpected entry in voice section: {line.strip()!r}"
            )
        kind, value = match.groups()
        network = ip_network(value)
        expected_kind = "IP-CIDR" if network.version == 4 else ipv6_type
        if kind != expected_kind or "/" not in value or network in networks:
            raise ValueError(
                f"{path}: invalid or duplicate voice rule: {line.strip()!r}"
            )
        networks.add(network)
    if not networks:
        raise ValueError(f"{path}: empty voice section")
    return "".join(lines[:index]), timestamp, networks


def update_header(head, update_date, clash_rows=None):
    head, count = re.subn(
        r"(?m)^# UPDATED: \d{4}-\d{2}-\d{2}$", f"# UPDATED: {update_date}", head
    )
    if count != 1:
        raise ValueError("Expected one UPDATED field")
    if clash_rows is None:
        return head

    counts = Counter(line[4:].split(",", 1)[0] for line in clash_rows)
    head = re.sub(r"(?m)^# IP-CIDR6?: \d+\n", "", head)
    stats = [
        f"# {kind}: {counts[kind]}" for kind in ("IP-CIDR", "IP-CIDR6") if counts[kind]
    ]
    stats.append(f"# TOTAL: {sum(counts.values())}")
    head, count = re.subn(r"(?m)^# TOTAL: \d+$", "\n".join(stats), head)
    if count != 1:
        raise ValueError("Expected one Clash TOTAL field")
    return head


def sync(snapshot, root=ROOT):
    timestamp, official = parse_snapshot(snapshot)
    formats = (
        ("rules/clash/openai.yaml", "  ", "  - ", ",no-resolve", "IP-CIDR6"),
        ("rules/quantumult-x/openai.list", "", "", ",OpenAI", "IP6-CIDR"),
    )
    # Validate both inputs before preparing either replacement.
    updates = {}
    can_update = True
    ordered = sorted(
        official, key=lambda net: (net.version, net.network_address, net.prefixlen)
    )
    snapshot_time = timestamp.isoformat().replace("+00:00", "Z")
    update_date = datetime.now(UTC).date().isoformat()
    for name, indent, prefix, suffix, ipv6_type in formats:
        path = root / name
        head, local_time, existing = read_rules(path, indent, prefix, suffix, ipv6_type)
        print(
            f"{name}: {local_time.isoformat()} -> {snapshot_time}, "
            f"+{len(official - existing)} / -{len(existing - official)} CIDRs"
        )
        if timestamp <= local_time:
            if timestamp < local_time:
                print(f"{name}: official snapshot is older")
            elif official != existing:
                print(f"{name}: CIDRs differ at the same snapshot timestamp")
            can_update = False
            continue

        rows = [
            f"{prefix}{'IP-CIDR' if net.version == 4 else ipv6_type},{net}{suffix}"
            for net in ordered
        ]
        clash_rows = None
        if prefix:
            clash_rows = [
                line for line in head.splitlines() if line.startswith(prefix)
            ] + rows
        head = update_header(head, update_date, clash_rows)
        updates[path] = (
            head + indent + MARKER + snapshot_time + "\n" + "\n".join(rows) + "\n"
        )

    if not can_update:
        print(
            "No rule files updated. The official snapshot must be newer than both local snapshots."
        )
        return
    for path, content in updates.items():
        path.write_text(content, encoding="utf-8")
    print(f"Updated both rule files to {snapshot_time} ({len(official)} CIDRs).")


def main():
    try:
        with urlopen(URL, timeout=30) as response:
            snapshot = json.load(response)
        sync(snapshot)
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        print(f"OpenAI voice sync failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
