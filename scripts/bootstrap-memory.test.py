#!/usr/bin/env python3
"""Focused regression checks for the VPS memory bootstrap lifecycle."""

import contextlib
import importlib.util
import io
import json
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT = Path(__file__).with_name("bootstrap-memory.py")


def load_module():
    spec = importlib.util.spec_from_file_location("bootstrap_memory_test_target", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class BootstrapMemoryTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.data = self.root / ".data" / "tencentdb"
        self.data.mkdir(parents=True)
        self.module = load_module()
        self.module.ROOT = self.root
        self.module.DATA = self.data
        self.module.ADMIN_KEY = self.data / "admin-key"
        self.module.BUSINESS_KEY = self.data / "business-key"
        self.module.APP_CONFIG = self.data / "aionui-memory.json"
        self.module.DOCKER_CONFIG = self.data / "aionui-memory.docker.json"
        self.module.ADMIN_KEY.write_text("admin-fixture")
        os.chmod(self.module.ADMIN_KEY, 0o644)

        self.state = {"user": None, "team": None, "agent": None, "creates": {}}

        def count(name):
            self.state["creates"][name] = self.state["creates"].get(name, 0) + 1

        def fake_identity(key):
            if key == "admin-fixture":
                return {"user_id": "admin-user"}
            if key == "business-fixture" and self.state["user"]:
                return self.state["user"]
            raise RuntimeError("invalid fixture key")

        def fake_request(route, key, body):
            if route == "user/list":
                return {"items": [self.state["user"]] if self.state["user"] else []}
            if route == "user/create":
                count(route)
                self.state["user"] = {"user_id": "user-fixture"}
                return {"default_user_key": "business-fixture"}
            if route == "team/list":
                return {"items": [self.state["team"]] if self.state["team"] else []}
            if route == "team/create":
                count(route)
                self.state["team"] = {"team_id": "team-fixture", "name": self.module.TEAM_NAME}
                return self.state["team"]
            if route == "agent/list":
                return {"items": [self.state["agent"]] if self.state["agent"] else []}
            if route == "agent/create":
                count(route)
                self.state["agent"] = {"agent_id": "agent-fixture", "name": self.module.AGENT_NAME}
                return self.state["agent"]
            raise AssertionError(f"unexpected route: {route}")

        self.module.identity = fake_identity
        self.module.request = fake_request

    def tearDown(self):
        self.temp.cleanup()

    def test_private_create_mode_exists_before_first_write(self):
        target = self.data / "new-private-value"
        observed_modes = []
        real_open = os.open

        def recording_open(path, flags, mode=0o777):
            fd = real_open(path, flags, mode)
            observed_modes.append(stat.S_IMODE(os.fstat(fd).st_mode))
            return fd

        old_umask = os.umask(0o022)
        try:
            with mock.patch.object(self.module.os, "open", side_effect=recording_open):
                self.module.write_private_text(target, "private", exclusive=True)
        finally:
            os.umask(old_umask)

        self.assertEqual(observed_modes, [0o600])
        self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)

    def test_main_is_idempotent_and_tightens_private_files(self):
        output = io.StringIO()
        old_umask = os.umask(0o022)
        try:
            with contextlib.redirect_stdout(output):
                self.module.main()
            os.chmod(self.module.BUSINESS_KEY, 0o644)
            with contextlib.redirect_stdout(output):
                self.module.main()
        finally:
            os.umask(old_umask)

        self.assertEqual(
            self.state["creates"],
            {"user/create": 1, "team/create": 1, "agent/create": 1},
        )
        for path in (
            self.module.ADMIN_KEY,
            self.module.BUSINESS_KEY,
            self.module.APP_CONFIG,
            self.module.DOCKER_CONFIG,
        ):
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600, path)

        docker_config = json.loads(self.module.DOCKER_CONFIG.read_text())
        self.assertEqual(docker_config["gatewayUrl"], "http://memory-core:8420")
        self.assertEqual(docker_config["knowledgeUrl"], "http://memory-hub:8424")
        self.assertEqual(docker_config["teamId"], "team-fixture")
        self.assertEqual(docker_config["agentId"], "agent-fixture")
        self.assertNotIn("business-fixture", output.getvalue())


if __name__ == "__main__":
    unittest.main()
