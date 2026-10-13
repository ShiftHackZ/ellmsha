// Match the desktop runtime's dependency manifest; npm ci checks its shared lock.
import fs from 'node:fs';
const file = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
delete pkg.devDependencies;
delete pkg.peerDependencies;
delete pkg.peerDependenciesMeta;
delete pkg.scripts;
pkg.dependencies.tsx = '^4.21.0';
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
