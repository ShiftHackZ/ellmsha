#!/usr/bin/env python3
"""One-time, copy-only pilot migration. App and Docker writers must already be stopped."""
import argparse, hashlib, json, os, shutil, sqlite3, subprocess, sys, uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def table_counts(file):
    db = sqlite3.connect(f'file:{file}?mode=ro', uri=True)
    names = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    wanted = ('conversations', 'conversation_messages', 'messages', 'l1_records', 'l0_conversations', 'meta_users', 'meta_teams', 'meta_agents', 'knowledge_wiki', 'knowledge_code_graph', 'nodes', 'files')
    result = {name: db.execute(f'SELECT count(*) FROM "{name}"').fetchone()[0] for name in wanted if name in names}
    db.close()
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, required=True, help='Stopped Tencent volume copies containing core/ and knowledge/')
    parser.add_argument('--app-data', type=Path, default=ROOT / '.data/aionui-desktop-dev')
    parser.add_argument('--destination', type=Path, required=True)
    args = parser.parse_args()
    source, snapshot, target = args.app_data.resolve(), args.snapshot.resolve(), args.destination.resolve()
    if target.exists(): raise RuntimeError('Destination exists; refusing to merge or overwrite user data')
    if not (source / 'aionui/aionui-backend.db').is_file(): raise RuntimeError('Source chat database missing')
    if not (snapshot / 'core/vectors.db').is_file() or not (snapshot / 'knowledge/knowledge.db').is_file(): raise RuntimeError('Incomplete Tencent snapshot')
    # Validate actual writer state; do not turn a live copy into a purported backup.
    for container in ('tdai-memory-core', 'tdai-memory-hub'):
        running = subprocess.check_output(['docker', 'inspect', '--format', '{{.State.Running}}', container], text=True).strip()
        if running != 'false': raise RuntimeError(f'Stop {container} before migration')
    try:
        output = subprocess.check_output(['lsof', '-Fpa', str(source / 'aionui/aionui-backend.db')], text=True).strip()
        if any(line in ('aw', 'au') for line in output.splitlines()): raise RuntimeError('The source chat database is still open; quit eLLMsha first')
    except subprocess.CalledProcessError as error:
        if error.returncode != 1: raise
    stage = target.with_name(target.name + '.migration-' + uuid.uuid4().hex[:8])
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, stage, symlinks=True, ignore=shutil.ignore_patterns('SingletonLock', 'SingletonSocket', 'SingletonCookie'))
    memory = stage / 'tencentdb'
    memory.mkdir(mode=0o700)
    for name in ('core', 'knowledge'): shutil.copytree(snapshot / name, memory / name, symlinks=True)
    for name in ('admin-key', 'business-key'):
        shutil.copy2(ROOT / '.data/tencentdb' / name, memory / name)
        os.chmod(memory / name, 0o600)
    previous = json.loads((ROOT / '.data/tencentdb/aionui-memory.json').read_text())
    # Preserve the actual encoder, replacing only Docker's host alias.
    core_yaml = ROOT / '.data/tencentdb/core-config/tdai-gateway.yaml'
    node = ROOT / 'aionui/resources/tencent-memory/darwin-arm64/bin/node'
    yaml_dir = ROOT / 'aionui/resources/tencent-memory/darwin-arm64/MemoryCore'
    embedding = json.loads(subprocess.check_output([str(node), '-e', "const fs=require('fs'); const y=require('yaml'); process.stdout.write(JSON.stringify(y.parse(fs.readFileSync(process.argv[1],'utf8')).memory.embedding));", str(core_yaml)], cwd=yaml_dir, text=True))
    embedding['baseUrl'] = embedding.get('baseUrl', '').replace('host.docker.internal', '127.0.0.1')
    mappings = [{ 'hostPath': item['hostPath'], 'servicePath': item['hostPath'] } for item in previous.get('knowledgeWorkspaces', [])]
    settings = {'corePort':8420,'knowledgePort':8424,'panelPort':8125,'embedding':embedding,'knowledgeWorkspaces':mappings}
    (memory / 'runtime-settings.json').write_text(json.dumps(settings, indent=2)+'\n')
    os.chmod(memory / 'runtime-settings.json', 0o600)
    replacements = [(str(source), str(target)), ('/data/knowledge', str(target / 'tencentdb/knowledge')), ('/data/tdai-memory', str(target / 'tencentdb/core')), ('http://host.docker.internal:8424','http://127.0.0.1:8424')]
    replacements += [(item['servicePath'], item['hostPath']) for item in previous.get('knowledgeWorkspaces', [])]
    replacements += [('file://' + item['servicePath'], Path(item['hostPath']).as_uri()) for item in previous.get('knowledgeWorkspaces', [])]
    counts = {}
    for file in stage.rglob('*.db'):
        before = table_counts(file)
        db = sqlite3.connect(file)
        # Relocate operational path/endpoint columns only; memory/chat prose stays byte-for-byte intact.
        for (table,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall():
            if not table.replace('_','').isalnum() or '_vec' in table or '_fts' in table: continue
            for column in db.execute(f'PRAGMA table_info("{table}")').fetchall():
                name = column[1]
                if name not in ('path','file_path','root_path','repo_path','repo_url','service_url','source_url','local_path','storage_path'): continue
                for old, new in replacements:
                    db.execute(f'UPDATE "{table}" SET "{name}" = ? || substr("{name}", ?) WHERE "{name}" = ? OR "{name}" LIKE ?', (new,len(old)+1,old,old+'/%'))
        db.commit(); db.close()
        after = table_counts(file)
        if before != after: raise RuntimeError(f'Row counts changed in {file.name}')
        if before: counts[str(file.relative_to(stage))] = before
    # Wiki engine metadata lives outside SQLite and retains absolute source paths.
    wiki_registry = memory / 'knowledge/_wiki_engines/wiki-sources.json'
    if wiki_registry.is_file():
        registry = json.loads(wiki_registry.read_text())
        for item in registry.values():
            value = item.get('path', '')
            for old, new in replacements:
                if value == old or value.startswith(old + '/'):
                    item['path'] = new + value[len(old):]
                    break
        wiki_registry.write_text(json.dumps(registry, indent=2) + '\n')
    # Preserve plain application settings while relocating their own data root.
    setting_file = stage / 'config/aionui-config.txt'
    if setting_file.is_file():
        setting_file.write_text(setting_file.read_text().replace(str(source), str(target)))
    report = {'source_app_data':str(source),'source_snapshot':str(snapshot),'destination':str(target),'counts':counts,'originals_preserved':True}
    (stage / 'desktop-migration.json').write_text(json.dumps(report,indent=2)+'\n')
    os.rename(stage, target)
    print(json.dumps(report, indent=2))

if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(f'Migration stopped; originals retained: {error}', file=sys.stderr); sys.exit(1)
