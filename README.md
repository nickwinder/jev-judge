# jev-judge

An [Agent Skill](https://agentskills.io) — the open `SKILL.md` standard supported by Claude Code, Codex, and other agent clients — that wraps [Jev](https://typesafe.ai), TypeSafe AI's judgment model. Jev does not generate text — give it **state** (text or JSON) and a **question** with a fixed set of outcomes, and it returns a calibrated probability for each outcome in well under a second.

Use it when an LLM's own confidence is not reliable enough to threshold or branch on: a yes/no check (**noul**), picking one of several labels (**choice**), or rating on a defined scale (**score**).

## What's inside

- [`SKILL.md`](SKILL.md) — the skill instructions an agent loads, plus the full CLI flag reference and known API limits.
- [`scripts/cli.js`](scripts/cli.js) — a CLI on top of the official `@typesafe-ai/sdk`, vendored into one file so no `npm install` is needed.

## Install

Clone into your agent's skills directory, for example:

```sh
git clone https://github.com/nickwinder/jev-judge ~/.claude/skills/jev-judge
```

See the [Agent Skills client list](https://agentskills.io/clients) for other clients' skill directories.

Requires Node 20+, network access, and a `TYPESAFE_API_KEY` in the environment.

## Usage

```sh
echo "I was charged twice, please help" | node scripts/cli.js noul "Is this about billing?"
node scripts/cli.js help
```

See [`SKILL.md`](SKILL.md) for the full command reference (`noul` / `choice` / `score`, state input, flags, and limits).

## Security note

Web searches for "Jev CLI" turn up unrelated third-party packages with similar names and marketing-style descriptions. TypeSafe's own docs describe only the official `@typesafe-ai/sdk` — no CLI. This repo's `scripts/cli.js` is the vetted path; do not substitute a third-party package.

## License

MIT
