// BiteShark Code Registry — Versions, Scope, Safety Exclusions & Deterministic Serialization
// (`tools/code-registry/schema-versions.mjs`)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const GENERATOR_NAME = 'biteshark-code-registry';
export const GENERATOR_VERSION = '1.0.0';
export const REGISTRY_SCHEMA_VERSION = 'biteshark.code-registry.v1';
export const IMPACT_SCHEMA_VERSION = 'biteshark.change-impact.v1';
export const DRIFT_SCHEMA_VERSION = 'biteshark.drift-report.v1';
export const REPOSITORY_CANONICAL_URL = 'https://github.com/yamanalmasaleha-png/trukly-';

export const DEFAULT_INCLUDED_ROOTS = Object.freeze([
  'api',
  'lib',
  'server',
  'packages',
  'public',
  'migrations',
  'scripts',
  'deploy',
  'tests',
  'docs',
  '.github',
  'package.json',
  'README.md',
  'TECH_MAP.md',
  'AGENTS.md'
]);

export const EXPLICIT_EXCLUSION_RULES = Object.freeze([
  {
    rule_id: 'EXCL_GIT_INTERNAL',
    pattern: '.git/**',
    reason: 'Git internal object database and local reflogs.'
  },
  {
    rule_id: 'EXCL_NODE_MODULES',
    pattern: '**/node_modules/**',
    reason: 'Installed third-party npm packages (tracked separately via package.json/package-lock.json).'
  },
  {
    rule_id: 'EXCL_SECRET_AND_ENV_FILES',
    pattern: '**/.env*, **/*.pem, **/*.key, **/*.passphrase, **/id_ed25519*, **/id_rsa*',
    reason: 'Security boundary: never ingest environment files, private keys, or credential material.'
  },
  {
    rule_id: 'EXCL_HISTORICAL_ARCHIVES',
    pattern: 'docs/archive/**, truckly-v63.zip, truckly-data.sql.gz',
    reason: 'Historical pre-VPS snapshots retained in Git for provenance only; excluded from active runtime.'
  },
  {
    rule_id: 'EXCL_VENDORED_TOOLING',
    pattern: 'tools/code-registry/vendor/**',
    reason: 'Vendored third-party parser library (acorn@8.14.1, MIT); documented in DEPENDENCIES-AND-LICENSES.md.'
  },
  {
    rule_id: 'EXCL_GENERATED_REGISTRY_OUTPUTS',
    pattern: 'docs/engineering/generated/**, docs/engineering/schemas/drift-baseline.json',
    reason: 'Machine-generated outputs of this registry tool (excluded from self-ingestion to guarantee idempotence).'
  },
  {
    rule_id: 'EXCL_BINARY_MEDIA',
    pattern: '**/*.png, **/*.jpg, **/*.jpeg, **/*.webp, **/*.ico, **/*.woff2, **/*.gz, **/*.zip, **/*.gpg',
    reason: 'Binary media/archives; cataloged by path/size/SHA-256 metadata without text AST parsing.'
  }
]);

export function toPosixPath(relPath) {
  return String(relPath || '').split(path.sep).join('/').replace(/^\/+/, '');
}

export function classifyPathExclusion(relPosix) {
  const lower = relPosix.toLowerCase();
  const base = path.posix.basename(lower);

  if (relPosix === '.git' || relPosix.startsWith('.git/')) {
    return { excluded: true, rule_id: 'EXCL_GIT_INTERNAL' };
  }
  if (relPosix === 'node_modules' || relPosix.startsWith('node_modules/') || relPosix.includes('/node_modules/')) {
    return { excluded: true, rule_id: 'EXCL_NODE_MODULES' };
  }
  if (
    (/^\.env(\.|$)/i.test(base) && !base.endsWith('.example') && !base.endsWith('.template')) ||
    lower.endsWith('.pem') ||
    lower.endsWith('.key') ||
    lower.endsWith('.passphrase') ||
    base.startsWith('id_ed25519') ||
    base.startsWith('id_rsa')
  ) {
    return { excluded: true, rule_id: 'EXCL_SECRET_AND_ENV_FILES' };
  }
  if (
    relPosix === 'docs/archive' ||
    relPosix.startsWith('docs/archive/') ||
    relPosix === 'truckly-v63.zip' ||
    relPosix === 'truckly-data.sql.gz'
  ) {
    return { excluded: true, rule_id: 'EXCL_HISTORICAL_ARCHIVES' };
  }
  if (relPosix === 'tools/code-registry/vendor' || relPosix.startsWith('tools/code-registry/vendor/')) {
    return { excluded: true, rule_id: 'EXCL_VENDORED_TOOLING' };
  }
  if (
    relPosix === 'docs/engineering/generated' ||
    relPosix.startsWith('docs/engineering/generated/') ||
    relPosix === 'docs/engineering/schemas/drift-baseline.json'
  ) {
    return { excluded: true, rule_id: 'EXCL_GENERATED_REGISTRY_OUTPUTS' };
  }
  return { excluded: false, rule_id: null };
}

export function isBinaryAssetPath(relPosix) {
  return /\.(png|jpe?g|webp|ico|woff2?|gz|zip|gpg|pdf)$/i.test(relPosix);
}

export function collectWorkspaceFiles(rootDir, { customRoots = null } = {}) {
  const absRoot = path.resolve(rootDir);
  const rootsToScan = customRoots || DEFAULT_INCLUDED_ROOTS;
  const includedFiles = [];
  const binaryAssets = [];
  const excludedRecords = [];

  function walk(absCurrent, relCurrent) {
    const excl = classifyPathExclusion(relCurrent);
    if (excl.excluded) {
      excludedRecords.push({ path: relCurrent, rule_id: excl.rule_id });
      return;
    }

    let stat;
    try {
      stat = fs.lstatSync(absCurrent);
    } catch {
      return;
    }
    if (stat.isSymbolicLink()) {
      excludedRecords.push({ path: relCurrent, rule_id: 'EXCL_SYMLINK' });
      return;
    }

    if (stat.isDirectory()) {
      const entries = fs.readdirSync(absCurrent, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        const childRel = relCurrent ? `${relCurrent}/${entry.name}` : entry.name;
        walk(path.join(absCurrent, entry.name), childRel);
      }
      return;
    }

    if (!stat.isFile()) return;

    if (isBinaryAssetPath(relCurrent)) {
      const bytes = fs.readFileSync(absCurrent);
      binaryAssets.push({
        path: relCurrent,
        byte_size: stat.size,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex')
      });
      return;
    }

    includedFiles.push({
      path: relCurrent,
      absPath: absCurrent,
      byte_size: stat.size
    });
  }

  if (customRoots === null) {
    for (const candidate of rootsToScan) {
      const absCandidate = path.join(absRoot, candidate);
      if (fs.existsSync(absCandidate)) {
        walk(absCandidate, toPosixPath(candidate));
      }
    }
    // Also record top-level excluded items explicitly (e.g. truckly-v63.zip, node_modules)
    for (const topEntry of fs.readdirSync(absRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = toPosixPath(topEntry.name);
      const excl = classifyPathExclusion(rel);
      if (excl.excluded && !excludedRecords.some(e => e.path === rel)) {
        excludedRecords.push({ path: rel, rule_id: excl.rule_id });
      }
    }
  } else {
    for (const candidate of rootsToScan) {
      const absCandidate = path.join(absRoot, candidate);
      if (fs.existsSync(absCandidate)) {
        walk(absCandidate, toPosixPath(candidate));
      }
    }
  }

  includedFiles.sort((a, b) => a.path.localeCompare(b.path));
  binaryAssets.sort((a, b) => a.path.localeCompare(b.path));
  excludedRecords.sort((a, b) => a.path.localeCompare(b.path));

  return {
    rootDir: absRoot,
    includedFiles,
    binaryAssets,
    excludedRecords
  };
}

export function resolveGitProvenance(rootDir, { overrideRef = null, overrideSha = null } = {}) {
  const absRoot = path.resolve(rootDir);
  let commitSha = overrideSha || 'unknown';
  let branchOrRef = overrideRef || 'unknown';
  let dirtyFiles = [];
  let isClean = true;

  if (!overrideSha) {
    try {
      commitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: absRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
    } catch {
      commitSha = 'untracked-worktree';
    }
  }

  if (!overrideRef) {
    try {
      const sym = execFileSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
        cwd: absRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
      branchOrRef = sym || process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || 'DETACHED_HEAD';
    } catch {
      branchOrRef = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || 'DETACHED_HEAD';
    }
  }

  try {
    const statusOut = execFileSync('git', ['status', '--porcelain'], {
      cwd: absRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    dirtyFiles = statusOut
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
    isClean = dirtyFiles.length === 0;
  } catch {
    isClean = true;
  }

  return {
    repository: REPOSITORY_CANONICAL_URL,
    branch_or_ref: branchOrRef,
    commit_sha: commitSha,
    working_tree_clean: isClean,
    dirty_file_count: dirtyFiles.length
  };
}

export function sortObjectKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeysDeep);
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out = {};
    for (const k of Object.keys(value).sort()) {
      if (value[k] !== undefined) {
        out[k] = sortObjectKeysDeep(value[k]);
      }
    }
    return out;
  }
  return value;
}

export function deterministicStringify(payload, pretty = true) {
  const normalized = sortObjectKeysDeep(payload);
  return JSON.stringify(normalized, null, pretty ? 2 : 0) + '\n';
}

export function computePayloadDigest(payload) {
  // Strip volatile git-ref/timestamp headers so content digest depends purely on scanned source & findings
  const clone = { ...payload };
  delete clone.generated_at_utc;
  delete clone.deterministic_digest_sha256;
  delete clone.provenance;
  if (clone.scope) {
    const sc = { ...clone.scope };
    if (Array.isArray(sc.excluded_paths)) {
      sc.excluded_paths = sc.excluded_paths.filter(e => e.rule_id !== 'EXCL_GENERATED_REGISTRY_OUTPUTS');
      sc.excluded_item_count = sc.excluded_paths.length;
    }
    clone.scope = sc;
  }
  if (clone.drift_report && Array.isArray(clone.drift_report.findings)) {
    clone.drift_report = {
      ...clone.drift_report,
      findings: clone.drift_report.findings.map(f => {
        const fc = { ...f };
        delete fc.source_commit;
        return fc;
      })
    };
  }
  const canonical = deterministicStringify(clone, false);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}
