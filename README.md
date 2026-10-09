# agent-debate

A skill that lets two AI agents settle a disagreement by checking each other's evidence. All talk happens in one append-only file. A small Node script hands out turns and reports the clock, so the loop ends when the agents settle, or when the round or time limit is hit.

Nobody is named in advance. Each agent picks its own name and states who it is in its first round.

It works in any harness that can run Node 18+ and edit files.

## Why

Agents in a plain back-and-forth repeat their positions. Here every claim cites facts the author looked up (official documentation, best practices, design patterns, code, command output), and the other side checks them before answering:

- Every claim has an ID, a status (`open`, `accepted`, `refuted`, `retracted`), a source, and a note on what the author opened.
- Agents look up facts themselves, beyond what the other agent cited, and say plainly when a claim is wrong or right.
- A claim is refuted only after checking the exact point against every source the refuter relies on.
- A wrong claim is retracted, not defended.
- `AGREED` means no claim is open and both agents checked the final state and accept it. The agents judge this; the script does not.
- Agents are told apart by the name in their round headings, so each name must be unique in the file.

## Debate types

| Type | Evidence |
| --- | --- |
| `factual` | A primary source plus a command or URL anyone can re-run. Aggregate data only corroborates. |
| `review` | `file:line` plus observed behavior or a repro, and the documentation or practice the finding rests on. |
| `design` | Requirements, constraints, failure modes and trade-offs, supported by documentation, practices and patterns. The decision rule names the criteria. |

## Install

Claude Code plugin:

```
/plugin install github:Domanell/agent-debate
```

Any other harness: copy `skills/agent-debate` into the folder your harness reads skills from, for example `~/.agents/skills/agent-debate`. Every agent in a debate needs the skill: the debate file holds only the header, the round format and the rounds.

## Use

Start a debate (the first agent):

```bash
node skills/agent-debate/scripts/debate.mjs init ./debate.md \
  --topic "REST or GraphQL for the new API" --type design \
  --rounds 10 --minutes 60 \
  --rule "Pick the option that meets the listed constraints at the lowest operating cost" \
  --deliverable "One decision with the reasons"
```

The first agent then writes round 1 and gives the other agent one line: `Use the agent-debate skill to join ./debate.md.`

The second agent runs `wait` without a name until round 1 is complete, reads the file, picks a name that is not in it, and writes round 2.

Each agent then loops until the file ends with `[AGREED: ...]` or `[DEADLOCKED]`:

1. `node debate.mjs wait ./debate.md <your-name> --timeout 90`
2. Read the whole file and the JSON status, then append one round at the end of the file in a single edit whose last line is the `[END ROUND <n>]` marker.
3. Repeat.

### Commands

| Command | Purpose |
| --- | --- |
| `init <file> --topic --type [--rounds 10] [--minutes 60] [--rule] [--deliverable]` | Create the debate file: header and round format. Refuses an existing file or an unknown type. |
| `status <file>` | JSON facts: last author, whether the last round is complete, `finished`, `deadlinePassed`, `roundLimitReached`, open claims, next round and claim ID. |
| `wait <file> [name] [--timeout 90] [--interval 2]` | Block until a completed round was written by someone other than `name`, or the debate ends. Without a name, until any round is complete. |

`wait` exit codes: `0` your turn, `1` finished, `2` deadline passed (close it), `3` timeout (run again), `4` file missing.

### Round format

```
### Round 2 (<your-name>)
Identity: who you are, model and harness (first round only)
Position: one or two sentences
- C1 accepted: why | Evidence: source or command | Checked: what the author opened to confirm it
- C2 refuted: what is false | Evidence: the fact that shows it | Checked: how it was checked
- C3 open: new claim | Evidence: source, URL, documentation, practice, pattern, file:line or command | Checked: what the author opened
[END ROUND 2]
```

## Limits

Set at `init` and reported by the script:

- Max rounds per agent (default 10).
- Deadline (default 60 minutes).

The script only reports them; the agents close the debate. When a limit is hit, or the agents judge the debate settled or stuck, one agent writes an `## Outcome` section, and the other checks it and appends the final `[AGREED: ...]` or `[DEADLOCKED]`. At a limit one agent writes both at once.

## Develop

```bash
npm test
```

No dependencies. Tests use `node:test`.

## License

MIT
