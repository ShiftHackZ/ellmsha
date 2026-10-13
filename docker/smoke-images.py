#!/usr/bin/env python3
"""Bounded, provider-free image smoke. Only owns UUID-named containers/network."""
import argparse
import json
import pathlib
import subprocess
import tempfile
import time
import uuid


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--service', choices=['web', 'memory-core', 'memory-hub', 'memory-proxy', 'all'], default='all')
    parser.add_argument('--output', default='docker-smoke.json')
    args = parser.parse_args()
    prefix = 'ellmsha-release-smoke-' + uuid.uuid4().hex[:12]
    containers = []
    results = []

    def docker(*items, check=True):
        return subprocess.run(['docker', *items], check=check, text=True, capture_output=True, timeout=45)

    def start(service, extra):
        name = f'{prefix}-{service}'
        containers.append(name)
        docker('run', '-d', '--name', name, '--network', prefix, '--memory', '2048m', '--cpus', '2', '--pids-limit', '256',
               '--tmpfs', '/data:rw,uid=10001,gid=10001,mode=1777', *extra, f'ellmsha-release-{service}:candidate')
        return name

    def probe(name, endpoint, expected_json=False):
        deadline = time.monotonic() + 150
        last = ''
        while time.monotonic() < deadline:
            result = docker('exec', name, 'curl', '--max-time', '4', '-fsS', endpoint, check=False)
            if result.returncode == 0:
                if expected_json:
                    json.loads(result.stdout)  # A static SPA fallback does not prove a working backend.
                return
            last = result.stderr[-200:]
            state = docker('inspect', '--format', '{{.State.Running}}', name, check=False)
            if state.stdout.strip() != 'true':
                break
            time.sleep(1)
        raise RuntimeError(f'{name} failed readiness: {last}')

    with tempfile.TemporaryDirectory(prefix=prefix) as temp:
        root = pathlib.Path(temp)
        core = root / 'core.yaml'
        core.write_text('''deployMode: standalone
stateBackend: local
server: { host: 0.0.0.0, port: 8420 }
data: { baseDir: /data/tdai-memory }
memory:
  capture: { enabled: false }
  extraction: { enabled: false }
  storeBackend: sqlite
  embedding: { provider: none, dimensions: 0 }
skill: { enabled: false }
''')
        proxy = root / 'proxy.yaml'
        proxy.write_text('''server: { host: 0.0.0.0, port: 8096 }
upstream: { url: "http://127.0.0.1:1/v1", apiKey: "" }
redis: { enabled: false }
storage: { enabled: true, backend: memory }
auth: { enabled: false }
contextInjection: { enabled: false }
extraction: { enabled: false }
sessionInit: { enabled: false }
tdai: { enabled: false }
''')
        selected = ['web', 'memory-core', 'memory-hub', 'memory-proxy'] if args.service == 'all' else [args.service]
        try:
            docker('network', 'create', '--internal', prefix)
            for service in selected:
                extra = []
                endpoints = []
                if service == 'web':
                    endpoints = [('http://127.0.0.1:3000/', False), ('http://127.0.0.1:3000/api/auth/status', True)]
                elif service == 'memory-core':
                    extra = ['--mount', f'type=bind,src={core},dst=/data/config/tdai-gateway.yaml,readonly', '-e', 'TDAI_GATEWAY_API_KEY=release-smoke-not-a-real-key', '-e', 'STORE_MODE=sqlite']
                    endpoints = [('http://127.0.0.1:8420/health', True)]
                elif service == 'memory-hub':
                    extra = ['-e', 'REMOTE_INSTANCE_URL=http://127.0.0.1:1', '-e', 'REMOTE_INSTANCE_KEY=release-smoke-not-a-real-key', '-e', 'KNOWLEDGE_SERVICE_KEY=release-smoke-not-a-real-key', '-e', 'KNOWLEDGE_AUTH_TOKEN=release-smoke-not-a-real-key', '-e', 'LLM_BASE_URL=http://127.0.0.1:1/v1', '-e', 'LLM_API_KEY=release-smoke-not-a-real-key']
                    endpoints = [('http://127.0.0.1:8424/health', True), ('http://127.0.0.1:8125/health', True), ('http://127.0.0.1:8125/', False)]
                else:
                    extra = ['--mount', f'type=bind,src={proxy},dst=/data/config.yaml,readonly']
                    endpoints = [('http://127.0.0.1:8096/health', True)]
                name = start(service, extra)
                for url, is_json in endpoints:
                    probe(name, url, is_json)
                if service == 'web':
                    version = docker('exec', name, '/opt/ellmsha/open-computer-use/open-computer-use', '--version').stdout.strip()
                    if version != '0.3.6':
                        raise RuntimeError('Incorrect Open Computer Use runtime version')
                results.append({'service': service, 'status': 'passed', 'probes': [url for url, _ in endpoints]})
                docker('rm', '-fv', name)
                containers.remove(name)
        except Exception:
            for name in containers:
                # Fixtures contain no credentials or user data; bound diagnostics nevertheless.
                log = docker('logs', '--tail', '80', name, check=False)
                print(log.stdout[-12000:] + log.stderr[-12000:])
            raise
        finally:
            for name in containers:
                docker('rm', '-fv', name, check=False)
            docker('network', 'rm', prefix, check=False)
            pathlib.Path(args.output).write_text(json.dumps({'format': 1, 'providerCalls': False, 'realUserData': False, 'results': results}, indent=2) + '\n')
    print('Image smoke passed: ' + ', '.join(item['service'] for item in results))


if __name__ == '__main__':
    main()
