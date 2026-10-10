#!/usr/bin/env python3
"""Create a local TencentDB pilot user, team and agent without printing keys."""

import json
import os
import stat
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / ".data" / "tencentdb"
ADMIN_KEY = DATA / "admin-key"
BUSINESS_KEY = DATA / "business-key"
APP_CONFIG = DATA / "aionui-memory.json"
DOCKER_CONFIG = DATA / "aionui-memory.docker.json"
BASE = "http://127.0.0.1:8420/v3/meta"
USERNAME = "ellmsha_v3"
TEAM_NAME = "eLLMsha v3"
AGENT_NAME = "General"


def read_private_text(path: Path) -> str:
    """Read a regular file only after restricting its descriptor to this user."""
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise RuntimeError(f"Private credential path is not a regular file: {path}")
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "r") as source:
            fd = -1
            value = source.read().strip()
    finally:
        if fd >= 0:
            os.close(fd)
    if not value:
        raise RuntimeError(f"Private credential file is empty: {path}")
    return value


def write_private_text(path: Path, value: str, *, exclusive: bool = False) -> None:
    """Write private data through a descriptor that is mode 0600 before any bytes."""
    flags = os.O_WRONLY | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0)
    flags |= os.O_EXCL if exclusive else os.O_TRUNC
    fd = os.open(path, flags, 0o600)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w") as output:
            fd = -1
            output.write(value)
            output.flush()
            os.fsync(output.fileno())
    except Exception:
        if exclusive:
            try:
                path.unlink()
            except FileNotFoundError:
                pass
        raise
    finally:
        if fd >= 0:
            os.close(fd)


def request(route: str, key: str | None, body: dict) -> dict:
    headers = {"Content-Type": "application/json", "x-tdai-service-id": "default"}
    if key:
        headers["x-tdai-user-key"] = key
    req = urllib.request.Request(
        f"{BASE}/{route}",
        data=json.dumps(body).encode(),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        # Error bodies can contain credentials. Keep failures concise.
        raise RuntimeError(f"{route}: HTTP {error.code}") from error
    if result.get("code") != 0:
        raise RuntimeError(f"{route}: {result.get('message', 'unknown API error')}")
    return result.get("data") or {}


def identity(key: str) -> dict:
    data = request("auth/verify", None, {"user_key": key})
    if not data.get("valid") or not data.get("user"):
        raise RuntimeError("Saved TencentDB key is invalid")
    return data["user"]


def main() -> None:
    if not ADMIN_KEY.is_file():
        raise RuntimeError("Start the memory stack first: scripts/v3.sh up")
    admin_key = read_private_text(ADMIN_KEY)
    identity(admin_key)

    if BUSINESS_KEY.is_file():
        business_key = read_private_text(BUSINESS_KEY)
        user = identity(business_key)
    else:
        users = request("user/list", admin_key, {"username": USERNAME})
        if users.get("items"):
            raise RuntimeError("Pilot user exists but business-key is missing; recover or create a new user in the panel")
        created = request("user/create", admin_key, {"username": USERNAME})
        business_key = created["default_user_key"]
        write_private_text(BUSINESS_KEY, business_key, exclusive=True)
        user = identity(business_key)

    user_id = user["user_id"]
    teams = request("team/list", business_key, {"user_id": user_id, "limit": 100})
    team = next((item for item in teams.get("items", []) if item["name"] == TEAM_NAME), None)
    if team is None:
        team = request("team/create", business_key, {"name": TEAM_NAME, "owner_user_id": user_id})

    team_id = team["team_id"]
    agents = request("agent/list", business_key, {"team_id": team_id, "limit": 100})
    agent = next((item for item in agents.get("items", []) if item["name"] == AGENT_NAME), None)
    if agent is None:
        agent = request(
            "agent/create",
            business_key,
            {
                "team_id": team_id,
                "owner_user_id": user_id,
                "name": AGENT_NAME,
                "description": "General coding and research agent for the eLLMsha v3 pilot",
            },
        )

    settings = {}
    env_file = ROOT / ".env"
    if env_file.is_file():
        for line in env_file.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                name, _, value = line.partition("=")
                settings[name.strip()] = value.strip().strip("\"'")
    app_config = {
        "gatewayUrl": "http://127.0.0.1:8420",
        "serviceId": "default",
        "teamId": team_id,
        "agentId": agent["agent_id"],
        "userId": user_id,
        "gatewayApiKey": settings.get("MEMORY_CORE_GATEWAY_API_KEY", ""),
        "knowledgeServiceKey": settings.get("KNOWLEDGE_SERVICE_KEY", ""),
    }
    source_root = settings.get("KNOWLEDGE_LOCAL_SOURCE_ROOT", "")
    mount_root = settings.get("KNOWLEDGE_LOCAL_MOUNT_ROOT") or "/workspaces/ellmsha-v3"
    knowledge_port = settings.get("KNOWLEDGE_PORT") or "8424"
    targets = [
        (APP_CONFIG, "http://127.0.0.1:8420", f"http://127.0.0.1:{knowledge_port}", source_root),
        (DOCKER_CONFIG, "http://memory-core:8420", "http://memory-hub:8424", mount_root),
    ]
    for config_path, gateway, knowledge_url, host_path in targets:
        config = {
            **app_config,
            "gatewayUrl": gateway,
            "knowledgeUrl": knowledge_url,
            "knowledgeWorkspaces": [{"hostPath": host_path, "servicePath": mount_root}] if source_root else [],
        }
        write_private_text(config_path, json.dumps(config) + "\n")

    print(f"Memory pilot ready: team={team_id}, agent={agent['agent_id']}")
    print(f"Business key stored locally at {BUSINESS_KEY}; do not commit it.")
    print(f"AionUi memory configuration stored locally at {APP_CONFIG}.")


if __name__ == "__main__":
    try:
        main()
    except (KeyError, OSError, RuntimeError, ValueError) as error:
        print(f"bootstrap-memory: {error}", file=sys.stderr)
        sys.exit(1)
