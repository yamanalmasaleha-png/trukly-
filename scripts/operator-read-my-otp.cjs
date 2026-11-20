#!/usr/bin/env node
// BiteShark Protected Operator One-Time Code Reader (`staging_mailbox` mode ONLY)
//
// Allows an SSH-authenticated operator on the VPS to read ONLY their own pending 6-digit
// sign-in verification code from the loopback-only staging mailbox endpoint without ever
// printing, logging, or exposing `STAGING_MAILBOX_SECRET`.
//
// Usage on VPS:
//   /opt/nodejs/node-v22-lts/bin/node /srv/truckly-staging/current/scripts/operator-read-my-otp.cjs --email <your-email>

const fs = require('node:fs');

function parseEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  const out = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function parseArgs(argv) {
  const opts = {
    email: '',
    envFile: '/etc/truckly-staging/staging.env',
    port: ''
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--email' && argv[i + 1]) {
      opts.email = argv[++i];
    } else if (a.startsWith('--email=')) {
      opts.email = a.slice('--email='.length);
    } else if (a === '--env-file' && argv[i + 1]) {
      opts.envFile = argv[++i];
    } else if (a.startsWith('--env-file=')) {
      opts.envFile = a.slice('--env-file='.length);
    } else if (a === '--port' && argv[i + 1]) {
      opts.port = argv[++i];
    } else if (a.startsWith('--port=')) {
      opts.port = a.slice('--port='.length);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv);
  const email = String(opts.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('Usage: node scripts/operator-read-my-otp.cjs --email <your-email> [--env-file /etc/truckly-staging/staging.env]');
  }

  const fileEnv = parseEnvFile(opts.envFile);
  const bsSecret = String(process.env.BITESHARK_STAGING_MAILBOX_SECRET || fileEnv.BITESHARK_STAGING_MAILBOX_SECRET || '').trim();
  const trSecret = String(process.env.TRUCKLY_STAGING_MAILBOX_SECRET || fileEnv.TRUCKLY_STAGING_MAILBOX_SECRET || '').trim();
  if (bsSecret && trSecret && bsSecret !== trSecret) {
    throw new Error('Conflicting staging mailbox secret variables in environment.');
  }
  const secret = bsSecret || trSecret;
  if (!secret) {
    throw new Error('Staging mailbox secret is not configured in environment or --env-file.');
  }

  const port = Number(opts.port || process.env.PORT || fileEnv.PORT || 4100);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid loopback API port.');
  }

  const res = await fetch(`http://127.0.0.1:${port}/api/auth/staging-mailbox`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Staging-Mailbox-Secret': secret
    },
    body: JSON.stringify({ email })
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      payload.error ||
        `Loopback staging mailbox returned HTTP ${res.status}. Request a code at /login.html?next=%2Fadmin first.`
    );
  }

  process.stdout.write(
    `Email:      ${payload.email}\n` +
      `OTP Code:   ${payload.code}\n` +
      `Expires At: ${payload.expires_at}\n`
  );
}

main().catch(err => {
  process.stderr.write(`operator-read-my-otp: ${err.message}\n`);
  process.exit(1);
});
