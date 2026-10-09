#!/usr/bin/env node
// Debate file helper: init, status, wait. Node 18+, no dependencies.
//   node debate.mjs init <file> --topic T --type factual|review|design
//        [--rounds 10] [--minutes 60] [--rule "..."] [--deliverable "..."]
//   node debate.mjs status <file>
//   node debate.mjs wait <file> [name] [--timeout 90] [--interval 2]   (omit name only before your first round)
// wait exit codes: 0 your turn, 1 finished, 2 deadline passed, 3 timeout (run again), 4 file missing.

import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Real path, so the helper works when the skill directory is reached through a symlink or junction.
const SCRIPT = fs.realpathSync(fileURLToPath(import.meta.url));

const TYPES = ["factual", "review", "design"];
const ROUND_HEADING = /^### Round (\d+) \(([^)]+)\)[ \t]*$/gm;
const CLAIM_LINE = /^- (C\d+) (open|accepted|refuted|retracted)\b/gm;

const show = (value) => console.log(JSON.stringify(value, null, 2));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function die(message, code) {
  console.error(message);
  process.exit(code);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[++i];
    else positional.push(argv[i]);
  }
  return { positional, flags };
}

function field(text, key) {
  return text.match(new RegExp(`^- ${key}: (.*)$`, "m"))?.[1].trim();
}

export function parse(text) {
  const headings = [...text.matchAll(ROUND_HEADING)];
  const last = headings.at(-1);
  const roundComplete =
    Boolean(last) && new RegExp(`^\\[END ROUND ${last[1]}\\][ \\t]*$`, "m").test(text.slice(last.index));

  // The latest line for a claim ID sets its status.
  const claimStatus = new Map();
  let maxId = 0;
  for (const [, id, status] of text.slice(headings[0]?.index ?? text.length).matchAll(CLAIM_LINE)) {
    claimStatus.set(id, status);
    maxId = Math.max(maxId, Number(id.slice(1)));
  }

  let finished = null;
  if (/^\[AGREED:/m.test(text)) finished = "agreed";
  else if (/^\[DEADLOCKED\][ \t]*$/m.test(text)) finished = "deadlocked";

  return {
    finished,
    lastAuthor: last?.[2].trim(),
    roundComplete,
    nextRound: headings.length + 1,
    nextClaimId: `C${maxId + 1}`,
    openClaims: [...claimStatus].filter(([, status]) => status === "open").map(([id]) => id),
    deadlinePassed: Date.now() > Date.parse(field(text, "Deadline")),
    roundLimitReached: headings.length >= 2 * Number(field(text, "Max rounds per agent") ?? 10),
  };
}

const PROTOCOL = `## Protocol

Follow the agent-debate skill. Two agents take turns. Each picks its own name and states who it is in its first round. Round format:

    ### Round <n> (<your-name>)
    Identity: <who you are: model and harness; first round only>
    Position: <one or two sentences>
    - C<k> open: <new claim> | Evidence: <source, URL, documentation, practice, pattern, file:line or command> | Checked: <what you opened yourself>
    - C<j> accepted: <why> | Evidence: <...> | Checked: <what you opened that confirms it>
    - C<j> refuted: <what is false> | Evidence: <the fact that shows it> | Checked: <how you checked>
    - C<j> retracted: <your own claim, withdrawn> | Evidence: <what showed it wrong>
    [END ROUND <n>]`;

function init(file, flags) {
  if (fs.existsSync(file)) die(`refusing to overwrite ${file}`, 2);
  if (!flags.topic || !TYPES.includes(flags.type)) die("init needs --topic and --type factual|review|design", 2);

  const deadline = new Date(Date.now() + Number(flags.minutes ?? 60) * 60_000).toISOString();
  const text = `# Debate: ${flags.topic}

- Type: ${flags.type}
- Max rounds per agent: ${Number(flags.rounds ?? 10)}
- Deadline: ${deadline}
- Decision rule: ${flags.rule ?? "TBD by the first agent in round 1"}
- Deliverable: ${flags.deliverable ?? "TBD by the first agent in round 1"}

${PROTOCOL}

## Rounds
`;
  fs.writeFileSync(file, text);
  show(parse(text));
}

async function wait(file, name, flags) {
  const timeout = Number(flags.timeout ?? 90) * 1000;
  const interval = Number(flags.interval ?? 2) * 1000;
  const start = Date.now();
  const finish = (status, code) => {
    show(status);
    process.exit(code);
  };

  for (;;) {
    if (!fs.existsSync(file)) die(`missing ${file}`, 4);
    const s = parse(fs.readFileSync(file, "utf8"));
    if (s.finished) finish(s, 1);
    if (s.roundComplete && s.lastAuthor !== name) finish(s, 0);
    if (s.deadlinePassed) finish(s, 2);
    if (Date.now() - start >= timeout) finish(s, 3);
    await sleep(interval);
  }
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [cmd, file, name] = positional;
  if (cmd === "init" && file) init(file, flags);
  else if (cmd === "status" && file) show(parse(fs.readFileSync(file, "utf8")));
  else if (cmd === "wait" && file) await wait(file, name, flags);
  else die("usage: debate.mjs init|status|wait <file> [name] [flags]", 2);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === SCRIPT) await main();
