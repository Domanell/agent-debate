import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { parse } from "../skills/agent-debate/scripts/debate.mjs";

const script = fileURLToPath(new URL("../skills/agent-debate/scripts/debate.mjs", import.meta.url));

function header({ rounds = 10, deadline = "2999-01-01T00:00:00.000Z" } = {}) {
  return `# Debate: t

- Type: factual
- Max rounds per agent: ${rounds}
- Deadline: ${deadline}

## Rounds
`;
}

function round(n, agent, claims, { end = true } = {}) {
  const body = `\n### Round ${n} (${agent})\nPosition: p\n${claims.map((c) => `- ${c}`).join("\n")}\n`;
  return end ? `${body}[END ROUND ${n}]\n` : body;
}

describe("parse", () => {
  it("has no rounds in a fresh file", () => {
    const s = parse(header());
    assert.equal(s.lastAuthor, undefined);
    assert.equal(s.roundComplete, false);
    assert.equal(s.nextRound, 1);
    assert.equal(s.nextClaimId, "C1");
  });

  it("reads the author of the last round from its heading", () => {
    const text = header() + round(1, "x", ["C1 open: x"]) + round(2, "y", ["C1 accepted: ok"]);
    const s = parse(text);
    assert.equal(s.lastAuthor, "y");
    assert.equal(s.roundComplete, true);
    assert.equal(s.nextRound, 3);
  });

  it("treats a round without its end marker as incomplete", () => {
    const s = parse(header() + round(1, "x", ["C1 open: x"], { end: false }));
    assert.equal(s.lastAuthor, "x");
    assert.equal(s.roundComplete, false);
  });

  it("tracks the latest status of each claim", () => {
    const text =
      header() +
      round(1, "a", ["C1 open: x | Evidence: e", "C2 open: y | Evidence: e"]) +
      round(2, "b", ["C1 accepted: ok | Evidence: e", "C3 open: z | Evidence: e"]);
    const s = parse(text);
    assert.deepEqual(s.openClaims, ["C2", "C3"]);
    assert.equal(s.nextClaimId, "C4");
  });

  it("detects the end of a debate", () => {
    assert.equal(parse(header() + "\n[AGREED: done]\n").finished, "agreed");
    assert.equal(parse(header() + "\n[DEADLOCKED]\n").finished, "deadlocked");
  });

  it("ignores marker text that is not at the start of a line", () => {
    const text =
      header() + "\nUse `[AGREED: summary]` or `[DEADLOCKED]` to close.\n    [END ROUND 1]\n" + round(1, "a", ["C1 open: x"], { end: false });
    const s = parse(text);
    assert.equal(s.finished, null);
    assert.equal(s.roundComplete, false);
  });

  it("reports the round limit", () => {
    const text = header({ rounds: 1 }) + round(1, "a", ["C1 open: x"]);
    assert.equal(parse(text).roundLimitReached, false);
    assert.equal(parse(text + round(2, "b", ["C1 accepted: ok"])).roundLimitReached, true);
  });

  it("reports the deadline", () => {
    assert.equal(parse(header()).deadlinePassed, false);
    assert.equal(parse(header({ deadline: "2000-01-01T00:00:00.000Z" })).deadlinePassed, true);
  });
});

describe("cli", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-debate-"));
  const init = (file) => execFileSync("node", [script, "init", file, "--topic", "t", "--type", "design"]);

  it("init writes a file that status can read, and refuses to overwrite it", () => {
    const file = path.join(dir, "debate.md");
    init(file);
    const status = JSON.parse(execFileSync("node", [script, "status", file], { encoding: "utf8" }));
    assert.equal(status.nextRound, 1);
    assert.equal(spawnSync("node", [script, "init", file, "--topic", "t", "--type", "design"]).status, 2);
  });

  it("init rejects an unknown type", () => {
    const bad = path.join(dir, "bad.md");
    assert.equal(spawnSync("node", [script, "init", bad, "--topic", "t", "--type", "vibes"]).status, 2);
    assert.equal(fs.existsSync(bad), false);
  });

  it("wait blocks until a round is complete, then hands the turn to the other name", () => {
    const file = path.join(dir, "wait.md");
    init(file);
    assert.equal(spawnSync("node", [script, "wait", file, "--timeout", "1", "--interval", "0.2"]).status, 3);
    fs.appendFileSync(file, round(1, "x", ["C1 open: x"]));
    assert.equal(spawnSync("node", [script, "wait", file, "--timeout", "1"]).status, 0);
    assert.equal(spawnSync("node", [script, "wait", file, "y", "--timeout", "1"]).status, 0);
    assert.equal(spawnSync("node", [script, "wait", file, "x", "--timeout", "1", "--interval", "0.2"]).status, 3);
  });

  it("wait exits 1 when the debate is finished and 4 when the file is missing", () => {
    const file = path.join(dir, "done.md");
    init(file);
    fs.appendFileSync(file, "\n[DEADLOCKED]\n");
    assert.equal(spawnSync("node", [script, "wait", file, "b", "--timeout", "1"]).status, 1);
    assert.equal(spawnSync("node", [script, "wait", path.join(dir, "nope.md"), "a"]).status, 4);
  });

  it("runs when the skill directory is reached through a link", () => {
    const link = path.join(dir, "linked-scripts");
    fs.symlinkSync(path.dirname(script), link, "junction");
    const file = path.join(dir, "linked.md");
    execFileSync("node", [path.join(link, "debate.mjs"), "init", file, "--topic", "t", "--type", "design"]);
    assert.ok(fs.existsSync(file));
  });
});
