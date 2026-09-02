#!/usr/bin/env node
"use strict";

// poweri-web standalone launcher — the PowerI fork's own CLI identity.
//
// Upstream pi-web ships `bin/pi-web.js` (default port 30141). This wrapper is
// the poweri-web counterpart: same launcher behavior, but with the fork's own
// defaults — port 9989, the PowerI-dedicated port the desktop release shell
// also listens on, so a standalone instance is naturally distinct from
// pi-web AND is auto-reused by the PowerI desktop app.
//
// Fork red line: upstream `bin/` files are never modified. This wrapper only
// applies fork defaults and then delegates to the upstream launcher, so node
// version gating, PI_WEB_* env handling, and the `next start` spawn logic
// stay identical to pi-web. The legacy `pi-web` bin stays published for old
// desktop shells: they resolve the `pi-web` bin and always pass an explicit
// `-p`, so they are unaffected by the 9989 default.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path");

const DEFAULT_PORT = "9989";

const args = process.argv.slice(2);

// Own --help/-h: the upstream help text hardcodes the pi-web name and the
// 30141 default, which would mislead poweri-web users.
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: poweri-web [options]

Start the PowerI Web UI server (standalone mode of @poweri/poweri-web).

Options:
  -p, --port <port>          Server port (default: ${DEFAULT_PORT}, or PORT)
  -H, --hostname <host>      Bind hostname (default: 127.0.0.1, or PI_WEB_HOSTNAME)
      --no-open              Do not open a browser automatically
  -h, --help                 Show this help message and exit

Environment:
  PORT                       Default port when --port is omitted
  PI_WEB_HOSTNAME            Default hostname when --hostname is omitted
  PI_WEB_NO_OPEN             Set to 1/true/yes/on to disable browser open
  PI_WEB_PASSWORD            Enable HTTP Basic Auth (username is always "pi")
  PI_WEB_ALLOWED_HOSTS       Extra exact proxy/custom hostnames, comma-separated
`);
  process.exit(0);
}

// Apply the fork's default port unless the caller already chose one — same
// precedence as upstream (flag > PORT env > default). strict:false lets
// unknown flags pass through untouched; the upstream launcher re-parses
// strictly. Parse failures defer to the upstream launcher's canonical error.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { parseArgs } = require("util");
  const { values } = parseArgs({
    args,
    options: { port: { type: "string", short: "p" } },
    strict: false,
    allowPositionals: true,
  });
  if (values.port === undefined && !process.env.PORT) {
    process.env.PORT = DEFAULT_PORT;
  }
} catch {
  // Defer to the upstream launcher's parse error message.
}

// Delegate to the upstream launcher (it has no require.main guard: requiring
// it runs it). It re-parses argv, re-checks the node version, and spawns
// `next start` from the package root.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require(path.join(__dirname, "..", "..", "bin", "pi-web.js"));
