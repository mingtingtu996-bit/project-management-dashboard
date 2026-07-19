#!/usr/bin/env python3
"""Read-only Tencent control-plane discovery with deliberately sanitized output."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import hmac
import json
import os
import socket
import ssl
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


ALLOWED_DNS_VALUE_TYPES = {"A", "AAAA", "CNAME"}
COMPUTE_APIS = (
    {
        "service": "cvm",
        "host": "cvm.tencentcloudapi.com",
        "version": "2017-03-12",
    },
    {
        "service": "lighthouse",
        "host": "lighthouse.tencentcloudapi.com",
        "version": "2020-03-24",
    },
)
DNS_API = {
    "service": "dnspod",
    "host": "dnspod.tencentcloudapi.com",
    "version": "2021-03-23",
}


class TencentApiError(RuntimeError):
    def __init__(self, service: str, action: str, code: str) -> None:
        super().__init__(f"{service}:{action}:{code}")
        self.service = service
        self.action = action
        self.code = code


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args: Any, **_kwargs: Any) -> None:
        return None


def sha256_hex(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def hmac_sha256(key: bytes, value: str) -> bytes:
    return hmac.new(key, value.encode("utf-8"), hashlib.sha256).digest()


def tencent_request(
    *,
    secret_id: str,
    secret_key: str,
    service: str,
    host: str,
    version: str,
    action: str,
    payload: dict[str, Any],
    region: str | None = None,
) -> dict[str, Any]:
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    timestamp = int(time.time())
    date = dt.datetime.fromtimestamp(timestamp, tz=dt.timezone.utc).strftime("%Y-%m-%d")
    content_type = "application/json; charset=utf-8"
    canonical_headers = (
        f"content-type:{content_type}\n"
        f"host:{host}\n"
        f"x-tc-action:{action.lower()}\n"
    )
    signed_headers = "content-type;host;x-tc-action"
    canonical_request = "\n".join(
        (
            "POST",
            "/",
            "",
            canonical_headers,
            signed_headers,
            sha256_hex(body),
        )
    )
    credential_scope = f"{date}/{service}/tc3_request"
    string_to_sign = "\n".join(
        (
            "TC3-HMAC-SHA256",
            str(timestamp),
            credential_scope,
            sha256_hex(canonical_request.encode("utf-8")),
        )
    )
    secret_date = hmac_sha256(("TC3" + secret_key).encode("utf-8"), date)
    secret_service = hmac_sha256(secret_date, service)
    secret_signing = hmac_sha256(secret_service, "tc3_request")
    signature = hmac.new(
        secret_signing,
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    authorization = (
        "TC3-HMAC-SHA256 "
        f"Credential={secret_id}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    headers = {
        "Authorization": authorization,
        "Content-Type": content_type,
        "Host": host,
        "X-TC-Action": action,
        "X-TC-Timestamp": str(timestamp),
        "X-TC-Version": version,
    }
    if region:
        headers["X-TC-Region"] = region

    request = urllib.request.Request(
        f"https://{host}",
        data=body,
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            document = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        try:
            document = json.loads(error.read().decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise TencentApiError(service, action, f"HTTP_{error.code}") from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise TencentApiError(service, action, type(error).__name__) from error

    api_response = document.get("Response") or {}
    api_error = api_response.get("Error")
    if api_error:
        raise TencentApiError(service, action, str(api_error.get("Code") or "Unknown"))
    return api_response


def chunks(values: list[str], size: int) -> list[list[str]]:
    return [values[index : index + size] for index in range(0, len(values), size)]


def normalized_tags(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    tags: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        key = item.get("Key") or item.get("TagKey")
        tag_value = item.get("Value") or item.get("TagValue")
        if isinstance(key, str) and isinstance(tag_value, str):
            tags.append({"key": key, "value": tag_value})
    return sorted(tags, key=lambda tag: (tag["key"], tag["value"]))


def normalize_instance(
    service: str,
    region: str,
    instance: dict[str, Any],
    status_by_id: dict[str, str],
) -> dict[str, Any]:
    instance_id = str(instance.get("InstanceId") or "")
    public_ips: set[str] = set()
    for field in ("PublicIpAddresses", "PublicAddresses"):
        values = instance.get(field)
        if isinstance(values, list):
            public_ips.update(str(value) for value in values if isinstance(value, str))
    return {
        "service": service,
        "region": region,
        "instanceId": instance_id,
        "name": str(instance.get("InstanceName") or ""),
        "state": status_by_id.get(instance_id)
        or str(instance.get("InstanceState") or instance.get("InstanceStatus") or ""),
        "publicIps": sorted(public_ips),
        "tags": normalized_tags(instance.get("Tags")),
    }


def discover_compute(
    api: dict[str, str], secret_id: str, secret_key: str
) -> dict[str, Any]:
    service = api["service"]
    region_response = tencent_request(
        secret_id=secret_id,
        secret_key=secret_key,
        service=service,
        host=api["host"],
        version=api["version"],
        action="DescribeRegions",
        payload={},
    )
    regions = sorted(
        {
            str(item.get("Region"))
            for item in region_response.get("RegionSet") or []
            if item.get("Region")
        }
    )
    instances: list[dict[str, Any]] = []
    for region in regions:
        region_instances: list[dict[str, Any]] = []
        offset = 0
        while True:
            response = tencent_request(
                secret_id=secret_id,
                secret_key=secret_key,
                service=service,
                host=api["host"],
                version=api["version"],
                action="DescribeInstances",
                payload={"Limit": 100, "Offset": offset},
                region=region,
            )
            page = response.get("InstanceSet") or []
            region_instances.extend(item for item in page if isinstance(item, dict))
            total = int(response.get("TotalCount") or len(region_instances))
            if not page or len(region_instances) >= total:
                break
            offset += len(page)

        instance_ids = [
            str(item.get("InstanceId"))
            for item in region_instances
            if item.get("InstanceId")
        ]
        status_by_id: dict[str, str] = {}
        for id_group in chunks(instance_ids, 100):
            status_response = tencent_request(
                secret_id=secret_id,
                secret_key=secret_key,
                service=service,
                host=api["host"],
                version=api["version"],
                action="DescribeInstancesStatus",
                payload={"InstanceIds": id_group},
                region=region,
            )
            for status in status_response.get("InstanceStatusSet") or []:
                instance_id = status.get("InstanceId")
                state = status.get("InstanceState") or status.get("InstanceStatus")
                if instance_id and state:
                    status_by_id[str(instance_id)] = str(state)
        instances.extend(
            normalize_instance(service, region, instance, status_by_id)
            for instance in region_instances
        )
    return {
        "service": service,
        "regionCount": len(regions),
        "instances": sorted(
            instances,
            key=lambda item: (item["region"], item["instanceId"]),
        ),
    }


def resolve_addresses(hostname: str) -> set[str]:
    try:
        return {
            item[4][0]
            for item in socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
            if item and item[4]
        }
    except socket.gaierror:
        return set()


def record_fqdn(domain: str, record_name: str) -> str | None:
    name = record_name.strip().rstrip(".")
    if name == "@":
        return domain
    if not name or "*" in name:
        return None
    if name == domain or name.endswith("." + domain):
        return name
    return f"{name}.{domain}"


def sanitize_dns_record(
    domain: str,
    record: dict[str, Any],
    current_host_ip: str,
) -> dict[str, Any]:
    record_type = str(record.get("Type") or "").upper()
    name = str(record.get("Name") or "")
    output: dict[str, Any] = {
        "name": name,
        "type": record_type,
        "status": str(record.get("Status") or ""),
    }
    if record_type in ALLOWED_DNS_VALUE_TYPES:
        value = str(record.get("Value") or "").strip().rstrip(".")
        fqdn = record_fqdn(domain, name)
        resolved = resolve_addresses(fqdn) if fqdn else set()
        if record_type == "CNAME" and value:
            resolved.update(resolve_addresses(value))
        output["pointsToCurrentHost"] = (
            value == current_host_ip or current_host_ip in resolved
        )
    return output


def discover_dns(
    secret_id: str,
    secret_key: str,
    current_host_ip: str,
) -> dict[str, Any]:
    domains: list[dict[str, Any]] = []
    offset = 0
    while True:
        response = tencent_request(
            secret_id=secret_id,
            secret_key=secret_key,
            service=DNS_API["service"],
            host=DNS_API["host"],
            version=DNS_API["version"],
            action="DescribeDomainList",
            payload={"Limit": 100, "Offset": offset},
        )
        page = response.get("DomainList") or []
        for raw_domain in page:
            domain_name = str(raw_domain.get("Name") or "").strip().rstrip(".")
            if not domain_name:
                continue
            records: list[dict[str, Any]] = []
            record_offset = 0
            while True:
                record_response = tencent_request(
                    secret_id=secret_id,
                    secret_key=secret_key,
                    service=DNS_API["service"],
                    host=DNS_API["host"],
                    version=DNS_API["version"],
                    action="DescribeRecordList",
                    payload={
                        "Domain": domain_name,
                        "Limit": 3000,
                        "Offset": record_offset,
                    },
                )
                record_page = record_response.get("RecordList") or []
                records.extend(
                    sanitize_dns_record(domain_name, record, current_host_ip)
                    for record in record_page
                    if isinstance(record, dict)
                )
                count_info = record_response.get("RecordCountInfo") or {}
                total = int(count_info.get("TotalCount") or len(records))
                if not record_page or len(records) >= total:
                    break
                record_offset += len(record_page)
            domains.append(
                {
                    "domain": domain_name,
                    "status": str(raw_domain.get("Status") or ""),
                    "records": sorted(
                        records,
                        key=lambda item: (item["name"], item["type"]),
                    ),
                }
            )
        count_info = response.get("DomainCountInfo") or {}
        total = int(count_info.get("DomainTotal") or len(domains))
        if not page or len(domains) >= total:
            break
        offset += len(page)
    return {"domains": sorted(domains, key=lambda item: item["domain"])}


def probe_health_url(raw_url: str, current_host_ip: str) -> dict[str, Any]:
    result: dict[str, Any] = {
        "configured": bool(raw_url.strip()),
        "httpsUrlParsed": False,
        "dnsResolutionSucceeded": False,
        "aOrAaaaPointsToCurrentHost": False,
        "tlsCertificateValid": False,
        "tlsSanValid": False,
        "readyzEndpointIdentityValid": False,
        "readyzHttpStatus": None,
        "buildReleaseSha": None,
    }
    if not raw_url.strip():
        return result
    try:
        parsed = urllib.parse.urlsplit(raw_url.strip())
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username
            or parsed.password
        ):
            return result
        result["httpsUrlParsed"] = True
        addresses = resolve_addresses(parsed.hostname)
        result["dnsResolutionSucceeded"] = bool(addresses)
        result["aOrAaaaPointsToCurrentHost"] = current_host_ip in addresses

        context = ssl.create_default_context()
        context.check_hostname = False
        with socket.create_connection((parsed.hostname, parsed.port or 443), timeout=15) as raw:
            with context.wrap_socket(raw, server_hostname=parsed.hostname) as secure:
                secure.getpeercert()
                result["tlsCertificateValid"] = True
        hostname_context = ssl.create_default_context()
        with socket.create_connection((parsed.hostname, parsed.port or 443), timeout=15) as raw:
            with hostname_context.wrap_socket(raw, server_hostname=parsed.hostname):
                result["tlsSanValid"] = True

        readyz_url = urllib.parse.urlunsplit(
            ("https", parsed.netloc, "/api/readyz", "", "")
        )
        request = urllib.request.Request(
            readyz_url,
            headers={"Accept": "application/json", "User-Agent": "workbuddy-readonly-audit/1"},
        )
        opener = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=ssl.create_default_context()),
            NoRedirectHandler(),
        )
        body = b""
        effective_url = readyz_url
        try:
            with opener.open(request, timeout=20) as response:
                result["readyzHttpStatus"] = response.status
                effective_url = response.geturl()
                if 200 <= response.status < 300:
                    body = response.read(1024 * 1024)
        except urllib.error.HTTPError as error:
            result["readyzHttpStatus"] = error.code
            effective_url = error.geturl()
        expected = urllib.parse.urlsplit(readyz_url)
        effective = urllib.parse.urlsplit(effective_url)
        expected_port = expected.port or 443
        effective_port = effective.port or (443 if effective.scheme == "https" else 80)
        status = result["readyzHttpStatus"]
        result["readyzEndpointIdentityValid"] = (
            effective.scheme == "https"
            and effective.hostname == expected.hostname
            and effective_port == expected_port
            and effective.path == expected.path
            and not (isinstance(status, int) and 300 <= status < 400)
        )
        if body and result["readyzEndpointIdentityValid"]:
            try:
                document = json.loads(body.decode("utf-8"))
                release_sha = (document.get("build") or {}).get("releaseSha")
                if isinstance(release_sha, str):
                    result["buildReleaseSha"] = release_sha
            except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
                pass
    except (OSError, ValueError, urllib.error.URLError):
        pass
    return result


def error_record(error: TencentApiError) -> dict[str, str]:
    return {
        "service": error.service,
        "action": error.action,
        "code": error.code,
    }


def run_discovery(output_path: Path) -> int:
    secret_id = os.environ.get("TENCENT_SECRET_ID", "").strip()
    secret_key = os.environ.get("TENCENT_SECRET_KEY", "").strip()
    current_host_ip = os.environ.get("CURRENT_DEPLOY_HOST_IP", "").strip()
    health_url = os.environ.get("DEPLOY_HEALTH_URL", "")
    if not secret_id or not secret_key or not current_host_ip:
        raise RuntimeError("Required read-only discovery inputs are missing")

    errors: list[dict[str, str]] = []
    compute: list[dict[str, Any]] = []
    for api in COMPUTE_APIS:
        try:
            compute.append(discover_compute(api, secret_id, secret_key))
        except TencentApiError as error:
            errors.append(error_record(error))

    dns: dict[str, Any] = {"domains": []}
    try:
        dns = discover_dns(secret_id, secret_key, current_host_ip)
    except TencentApiError as error:
        errors.append(error_record(error))

    result = {
        "schema": "workbuddy-tencent-readonly-infra-discovery/v1",
        "generatedAt": dt.datetime.now(tz=dt.timezone.utc).isoformat(),
        "allowedActions": [
            "DescribeRegions",
            "DescribeInstances",
            "DescribeInstancesStatus",
            "DescribeDomainList",
            "DescribeRecordList",
        ],
        "compute": compute,
        "dns": dns,
        "genericProductionHealth": probe_health_url(health_url, current_host_ip),
        "errors": errors,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(result, indent=2, sort_keys=True, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )
    dns_ok = not any(error["service"] == "dnspod" for error in errors)
    expected_compute_services = {api["service"] for api in COMPUTE_APIS}
    discovered_compute_services = {item.get("service") for item in compute}
    compute_ok = (
        discovered_compute_services == expected_compute_services
        and not any(error["service"] in expected_compute_services for error in errors)
    )
    return 0 if dns_ok and compute_ok else 1


def self_test() -> None:
    original_resolver = globals()["resolve_addresses"]
    globals()["resolve_addresses"] = lambda _hostname: {"203.0.113.10"}
    try:
        txt = sanitize_dns_record(
            "example.test",
            {"Name": "@", "Type": "TXT", "Status": "ENABLE", "Value": "secret-token"},
            "203.0.113.10",
        )
        address = sanitize_dns_record(
            "example.test",
            {"Name": "staging", "Type": "A", "Status": "ENABLE", "Value": "203.0.113.10"},
            "203.0.113.10",
        )
    finally:
        globals()["resolve_addresses"] = original_resolver
    normalized = normalize_instance(
        "cvm",
        "ap-test",
        {
            "InstanceId": "ins-test",
            "InstanceName": "test",
            "PublicIpAddresses": ["203.0.113.10"],
            "PrivateIpAddresses": ["10.0.0.1"],
            "LoginSettings": {"Password": "must-not-leak"},
            "UserData": "must-not-leak",
        },
        {"ins-test": "RUNNING"},
    )
    serialized = json.dumps({"txt": txt, "address": address, "instance": normalized})
    assert "secret-token" not in serialized
    assert "must-not-leak" not in serialized
    assert "10.0.0.1" not in serialized
    assert "value" not in txt
    assert address["pointsToCurrentHost"] is True
    assert normalized["publicIps"] == ["203.0.113.10"]

    original_compute = globals()["discover_compute"]
    original_dns = globals()["discover_dns"]
    original_probe = globals()["probe_health_url"]
    original_env = {
        key: os.environ.get(key)
        for key in (
            "TENCENT_SECRET_ID",
            "TENCENT_SECRET_KEY",
            "CURRENT_DEPLOY_HOST_IP",
            "DEPLOY_HEALTH_URL",
        )
    }
    globals()["discover_compute"] = lambda api, *_args: (
        {"service": api["service"], "regionCount": 1, "instances": []}
        if api["service"] == "cvm"
        else (_ for _ in ()).throw(
            TencentApiError("lighthouse", "DescribeRegions", "UnauthorizedOperation")
        )
    )
    globals()["discover_dns"] = lambda *_args: {"domains": []}
    globals()["probe_health_url"] = lambda *_args: {}
    os.environ.update(
        {
            "TENCENT_SECRET_ID": "test-id",
            "TENCENT_SECRET_KEY": "test-key",
            "CURRENT_DEPLOY_HOST_IP": "203.0.113.10",
            "DEPLOY_HEALTH_URL": "https://example.test",
        }
    )
    try:
        with tempfile.TemporaryDirectory() as directory:
            partial_exit = run_discovery(Path(directory) / "partial.json")
        assert partial_exit != 0, "partial compute discovery must fail closed"
    finally:
        globals()["discover_compute"] = original_compute
        globals()["discover_dns"] = original_dns
        globals()["probe_health_url"] = original_probe
        for key, value in original_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    class FakeRawSocket:
        def __enter__(self) -> "FakeRawSocket":
            return self

        def __exit__(self, *_args: Any) -> None:
            return None

    class FakeSecureSocket(FakeRawSocket):
        def getpeercert(self) -> dict[str, Any]:
            return {}

    class FakeSslContext:
        check_hostname = True

        def wrap_socket(self, *_args: Any, **_kwargs: Any) -> FakeSecureSocket:
            return FakeSecureSocket()

    class FakeResponse(FakeRawSocket):
        status = 200

        def read(self, _limit: int) -> bytes:
            return b'{"build":{"releaseSha":"redirected-sha"}}'

        def geturl(self) -> str:
            return "https://other.example.test/api/readyz"

    class FakeOpener:
        def open(self, *_args: Any, **_kwargs: Any) -> FakeResponse:
            return FakeResponse()

    original_create_connection = socket.create_connection
    original_ssl_context = ssl.create_default_context
    had_match_hostname = hasattr(ssl, "match_hostname")
    original_match_hostname = getattr(ssl, "match_hostname", None)
    original_urlopen = urllib.request.urlopen
    original_build_opener = urllib.request.build_opener
    original_resolver = globals()["resolve_addresses"]
    socket.create_connection = lambda *_args, **_kwargs: FakeRawSocket()
    ssl.create_default_context = lambda: FakeSslContext()
    setattr(ssl, "match_hostname", lambda *_args, **_kwargs: None)
    urllib.request.urlopen = lambda *_args, **_kwargs: FakeResponse()
    urllib.request.build_opener = lambda *_args, **_kwargs: FakeOpener()
    globals()["resolve_addresses"] = lambda _hostname: {"203.0.113.10"}
    try:
        redirected = probe_health_url(
            "https://example.test",
            "203.0.113.10",
        )
    finally:
        socket.create_connection = original_create_connection
        ssl.create_default_context = original_ssl_context
        if had_match_hostname:
            setattr(ssl, "match_hostname", original_match_hostname)
        else:
            delattr(ssl, "match_hostname")
        urllib.request.urlopen = original_urlopen
        urllib.request.build_opener = original_build_opener
        globals()["resolve_addresses"] = original_resolver
    assert redirected.get("readyzEndpointIdentityValid") is False
    assert redirected["buildReleaseSha"] is None
    print("sanitization self-test passed")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.output is None:
        raise SystemExit("--output is required")
    return run_discovery(args.output)


if __name__ == "__main__":
    sys.exit(main())
