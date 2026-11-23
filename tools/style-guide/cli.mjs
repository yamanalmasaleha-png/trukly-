#!/usr/bin/env node
// BiteShark Design Style Guide CLI (`tools/style-guide/cli.mjs`)
//
// Commands:
//   generate [--root <dir>]   Deterministically generate docs/engineering/style-guide/*.md from decisions.json
//   validate [--root <dir>]   Validate schema, answer/status/N-A/reference rules & Markdown freshness (passes when answers are intentionally null)
//   status   [--root <dir>]   Print concise completion summary JSON

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadStyleGuideDecisions,
  computeCompletionStats,
  generateStyleGuideDocs,
  validateStyleGuideWorkspace
} from './lib.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx > 0) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        flags[arg.slice(2)] = argv[++i];
      } else {
        flags[arg.slice(2)] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { command: positional[0] || 'help', flags };
}

function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const repoRoot = flags.root ? path.resolve(String(flags.root)) : DEFAULT_REPO_ROOT;
  const customDecisionsPath = typeof flags.decisions === 'string' && flags.decisions ? flags.decisions : null;

  if (command === 'help' || flags.help) {
    console.log(
      [
        'BiteShark Design Style Guide & Completion Tracker CLI',
        '',
        'Commands:',
        '  generate [--root <dir>] [--decisions <path>]   Generate questionnaires, inventory & COMPLETION-REMINDER.md',
        '  validate [--root <dir>] [--decisions <path>]   Validate schema, rules, references & generated Markdown freshness',
        '  status   [--root <dir>] [--decisions <path>]   Print JSON completion summary by topic'
      ].join('\n')
    );
    return;
  }

  if (command === 'generate') {
    try {
      const res = generateStyleGuideDocs(repoRoot, { customDecisionsPath });
      console.log(JSON.stringify(res, null, 2));
    } catch (err) {
      console.error(`[style-guide] ${err.message}`);
      process.exit(1);
    }
    return;
  }

  if (command === 'validate') {
    const res = validateStyleGuideWorkspace(repoRoot, { customDecisionsPath });
    console.log(JSON.stringify(res, null, 2));
    if (!res.ok) {
      process.exit(1);
    }
    return;
  }

  if (command === 'status') {
    const { data } = loadStyleGuideDecisions(repoRoot, customDecisionsPath);
    const stats = computeCompletionStats(data);
    console.log(
      JSON.stringify(
        {
          lifecycle_mode: stats.lifecycle_mode,
          is_complete: stats.is_complete,
          remaining_gap_count: stats.remaining_gap_count,
          totals: stats.totals,
          by_topic: stats.by_topic.map(r => ({
            topic: r.topic.slug,
            file: r.topic.file,
            applicable_unanswered: r.applicable_unanswered,
            unconfirmed_pending: r.unconfirmed_pending,
            draft: r.draft,
            approved: r.approved,
            not_applicable: r.not_applicable,
            total: r.total
          }))
        },
        null,
        2
      )
    );
    return;
  }

  console.error(`[style-guide] Unknown command "${command}". Run with --help for usage.`);
  process.exit(1);
}

main();
