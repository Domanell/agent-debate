---
name: agent-debate
description: Debate between two AI agents in one shared file until they agree. Use when the user asks agents to debate or settle a disagreement, wants a cross-review or second opinion from another agent, or pastes another agent's conflicting answer.
---

# Agent Debate

Two agents find the correct solution together. Each brings facts, checks the other's facts, and agrees only with what the facts support. All talk happens in one debate file, an append-only ledger of claims: add to the end only, earlier text stays exactly as written, except the two limit lines in the header, which the user may extend. A helper script tracks turns and reports the clock and the limits.

Nobody is named in advance. Each agent introduces itself in its own first round.

Helper: `node <skill-dir>/scripts/debate.mjs`, where `<skill-dir>` is the directory containing this file.

## Evidence

A claim stands on facts you found and opened yourself. Your memory points where to look; the fact is what you find there. Cite the fact in the claim so the other agent can open it:

- **Documentation**: official docs, specifications, changelogs. Link, quoted passage, version.
- **Practice**: best practice, common practice, design pattern. Its name, the source that describes it, why it fits this case.
- **Code and behavior**: `file:line`, command output, a repro anyone can run.
- **Data**: the source and the query or command that reproduces it.

No fact, no claim.

## Debate types

The type sets which facts carry the debate.

- **factual**: there is a ground truth (data, specs, behavior). Primary sources decide; aggregate or secondary data only corroborates.
- **review**: code or document findings. `file:line` with observed behavior or a repro, plus the documentation or practice the finding rests on.
- **design**: no ground truth. Requirements, codebase constraints, failure modes and trade-offs, weighed by the decision rule's criteria and supported by documentation, practices and patterns.

## Who you are

Pick a name for yourself: a short lowercase label for what you are, with no spaces or parentheses. Use it in every round heading and in `wait`. It must differ from every name already in the file.

State who you are in the `Identity:` line of your first round: model and harness, in one line. Learn who the other agent is from the file.

## Start a debate

Ask the user for anything you cannot infer: topic, type, file location (default `./debate.md` in the project root). The other agent needs no name.

```bash
node <skill-dir>/scripts/debate.mjs init ./debate.md \
  --topic "<topic>" --type factual \
  --rounds 10 --minutes 60 \
  --rule "<what makes a claim or option win>" \
  --deliverable "<the artifact the debate must produce>"
```

Write the decision rule and deliverable if the user gave none; the other agent can dispute them as a claim.

Then write round 1 at once, without waiting. Give the user one line for the other agent: "Use the agent-debate skill to join ./debate.md."

## Join a debate

1. Run `node <skill-dir>/scripts/debate.mjs wait <file> --timeout 90` without a name. Exit 0 means round 1 is complete. Exit 3: run it again.
2. Read the file, pick your name, and write round 2.

## The loop

Run until the file ends with `[AGREED: ...]` or `[DEADLOCKED]`; report to the user only then.

1. Wait: `node <skill-dir>/scripts/debate.mjs wait <file> <your-name> --timeout 90`. Keep `--timeout` below your harness's command limit, or run it in the background. Exit 0: your turn. Exit 1: finished. Exit 2: the other agent missed the deadline, close with the facts you have. Exit 3: timeout, run `wait` again. Exit 4: file missing.
2. Read the whole file, top to bottom, and the status JSON (`openClaims`, `nextRound`, `nextClaimId`, `deadlinePassed`, `roundLimitReached`).
3. Search for facts. Done when every open claim of the other agent has been checked against a source you opened, and every claim you plan to make has a source you opened. Search beyond the sources the other agent cited.
4. If the file ends with an `## Outcome` and no last line, review it (Closing, step 2). Close (below) when `deadlinePassed` or `roundLimitReached` is true, or when you judge the debate settled or stuck. Otherwise write one round.
5. Go to 1.

## Writing a round

Write the whole round in a single edit at the end of the file, numbered by status `nextRound`. The `[END ROUND <n>]` line closes the round and tells the other agent it is complete; only a closing edit continues past it, with the Outcome. The format is in the file.

- One round per turn: a position and claim lines, about 250 words plus evidence. Stay on the topic, not the process.
- Give each open claim of the other agent a verdict from your own check. `accepted` when your check confirms it; `refuted` when your check shows it wrong, naming what is wrong and the fact that shows it. Agreement and disagreement both come from checked facts.
- One verdict per claim line. When only a claim's wording or evidence is wrong, use `accepted` and name the correction; the Outcome uses the corrected wording. `refuted` and `retracted` mean the claim itself is false.
- `Checked` records what you opened yourself, on every verdict and every new claim.
- Before calling a claim false, check that exact point against every source you rely on. A claim refuted from a single source can be wrong; absence from one dataset does not prove absence in the world.
- Concede at once when facts show you wrong: `retracted` for your claim, `accepted` for theirs.
- Your only edits go to the debate file. Applying the outcome is a separate task the user asks for.

## Closing

You judge when the debate is settled or stuck. Settled: no claim is open, and both agents have checked the final state and accept it. Stuck: the last rounds changed no verdict and each side has given its best evidence.

Close only when the other agent's latest round raised nothing you have not answered and your final round adds no new claim or verdict; otherwise write a normal round first. Withdrawing your own claim is not a new verdict.

Closing takes two turns, so the other agent sees the Outcome:

1. You append in one edit: a final round with your position, ending with its `[END ROUND <n>]` line, then `## Outcome`: the deliverable (final list, decision or findings), accepted and refuted claims in one line each, unresolved claims with each side's best evidence.
2. The other agent checks every Outcome line against the claim lines and its own `Checked`. If all hold, it appends the last line, alone: `[AGREED: <one-sentence summary>]` when settled, otherwise `[DEADLOCKED]`. If a line does not hold, it writes a round naming the correction, and you append the corrected `## Outcome` and the last line.

At a limit, append the round, the Outcome and the last line in one edit. When `deadlinePassed` or `roundLimitReached` is true with claims still open, first ask the user to extend: on yes, raise `Max rounds per agent` or `Deadline` in the header and continue the loop; on no, or if you cannot ask, close and list what the other agent has not seen under unresolved.

The agent that appends the last line tells the user the outcome in a few lines and the file path. On `[DEADLOCKED]`, list the 1 to 3 unresolved points and ask the user to decide.

The deadline and the rounds per agent are set at `init` and reported by `status`/`wait`; only the user extends them.
