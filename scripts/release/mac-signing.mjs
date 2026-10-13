import { existsSync, readFileSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// electron-builder chooses the certificate class itself and rejects this prefix.
// Keep the original full identity for native codesign and certificate validation.
export function electronBuilderIdentity(identity) {
  const selector = identity.trim().replace(/^Developer ID Application:\s*/, '');
  if (!selector) throw new Error('electron-builder requires a non-empty certificate selector');
  return selector;
}

// Public selectors only. The private key stays in Xcode's login keychain.
export function macSigning({ root, env = process.env, home = os.homedir(), enabled, disabled = false }) {
  const configPath = env.ELLM_SHA_MAC_SIGNING_CONFIG || path.join(home, '.config/ellmsha/mac-signing.json');
  if (disabled) return null;
  if (!existsSync(configPath)) {
    if (enabled) throw new Error('Signed build requires the external ELLM_SHA_MAC_SIGNING_CONFIG file');
    return null;
  }
  const relative = path.relative(realpathSync(root), realpathSync(configPath));
  if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
    throw new Error('Mac signing configuration must be stored outside the repository');
  }
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const allowed = ['identity', 'teamIdentifier', 'type', 'notaryProfile'];
  if (Object.keys(config).some((key) => !allowed.includes(key))) throw new Error('Unsupported signing configuration field');
  if (typeof config.identity !== 'string' || /[\r\n\0]/.test(config.identity) || !/^(?:Apple Development|Developer ID Application): \S/.test(config.identity.trim())) {
    throw new Error('Select an explicit full Apple Development: or Developer ID Application: certificate common name; hashes and short selectors are not supported');
  }
  if (!/^[A-Z0-9]{10}$/.test(config.teamIdentifier || '')) throw new Error('Signing teamIdentifier is required');
  if (!['development', 'distribution'].includes(config.type)) throw new Error('Signing type must be development or distribution');
  if (config.notaryProfile !== undefined && (config.type !== 'distribution' || typeof config.notaryProfile !== 'string' || !config.notaryProfile.trim())) {
    throw new Error('Notarization requires a distribution identity and a keychain profile');
  }
  return { ...config, identity: config.identity.trim() };
}
