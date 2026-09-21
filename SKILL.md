---
name: jev-judge
description: Get a calibrated confidence score or a fixed-label verdict for one atomic judgment — not a text answer — via Jev (TypeSafe AI's judgment model). Use whenever an LLM's self-reported confidence would not be trustworthy and code needs to threshold or branch on the result: classifying text into a fixed set of labels with a probability per label, a yes/no check with a true probability, or rating something on a defined ordered scale (urgency, severity, quality). Also fits eval/LLM-as-a-judge scoring, output verification against source text, and routing/triage by confidence. Do not use for open-ended generation, multi-step reasoning, or a decision that weighs several independent factors at once — decompose those into separate atomic questions first, or answer them directly instead of invoking this skill.
license: MIT
compatibility: Requires Node 20+, network access, and TYPESAFE_API_KEY.
metadata:
  author: nick
---

# Jev judge

Jev is TypeSafe AI's judge model (<https://typesafe.ai>). It does not generate text. Give it some
**state** (text or JSON) and a **question** with a fixed set of outcomes, and it returns a
probability for each outcome in well under a second.

Three question types:

- **noul** — yes/no, as a probability (e.g. "Is this about billing?")
- **choice** — one of your labels, with a probability per label (e.g. category, jurisdiction)
- **score** — a level on an ordered scale you define (e.g. urgency, confidence)

Jev is built for **atomic** judgments — a "gut-check" a knowledgeable person could make in a few
seconds. It is not for extended reasoning or a verdict that weighs several independent factors at
once; decompose a question like that into separate noul/choice/score calls instead of asking Jev
to do the weighing.

This skill bundles a small CLI, `scripts/cli.js`, built on the official `@typesafe-ai/sdk`
(npm). The SDK is vendored directly into that one file, so no `npm install` step is needed.
It does not call any third-party "Jev CLI" package.

## Setup

Requires `TYPESAFE_API_KEY` in the environment. Export it from `~/.zshenv` (Claude Code's Bash
tool is a non-interactive zsh, which reads `~/.zshenv` but not `~/.zshrc`), or pass it inline for
a one-off call:

```bash
TYPESAFE_API_KEY=... node ~/.agents/skills/jev-judge/scripts/cli.js noul "..."
```

## Usage

```bash
C=~/.agents/skills/jev-judge/scripts/cli.js

# noul: yes/no as a probability
echo "I was charged twice, please help" | node $C noul "Is this about billing?"

# choice: one of your labels
node $C choice "What is this ticket about?" billing=Payments technical=Bugs other \
  --state-file ticket.txt

# score: a level on your scale, low to high
node $C score "How urgent is this?" "not urgent" "somewhat urgent" "urgent" "critical" \
  --state-file ticket.txt

node $C <command> --json     # raw answer as JSON instead of a formatted line
node $C help                 # full flag reference
```

**State** — what Jev reads — comes from exactly one of: `--state "<text>"`, `--state-file <path>`
(a `.json` file is parsed as JSON; anything else is raw text), or piped stdin. Give a `choice` or
`score` command real descriptions for each label/level — Jev reads them, so "billing" alone
answers worse than `billing=Customer was charged an incorrect amount`.

Output: a `noul` answer is a single probability (0–1). A `choice` answer names the chosen label,
a confidence, and every label's probability. A `score` answer gives an expected score (which can
fall between levels), a confidence, and a probability per level.

## Known limits (from Jev's API)

- **State size**: roughly 32k tokens. Plain text runs about 4 characters per token; JSON runs
  under 2 (mostly ids and numbers) so it hits the limit sooner. Split large documents by page or
  section rather than sending the whole thing.
- **Choice labels**: at most 255.
- Every call is one HTTP round trip — for a big batch (many documents, many questions), fan out
  script calls yourself; the CLI here answers one question at a time.

## Security note

A web search for "Jev CLI" turns up several unrelated third-party packages (`jev-cli` under
different unaffiliated GitHub accounts, `jevctl` on npm, `typesafeai-cli` / `jev-cli` on PyPI)
with near-identical, marketing-style descriptions. TypeSafe's own docs (`typesafe.ai`,
`docs.typesafe.ai`) document only the official `@typesafe-ai/sdk` — no CLI. Treat those
third-party packages as unverified; do not install or run them. This skill's `scripts/cli.js` is
the vetted path — it depends only on the official SDK.

## Reference

- Official SDK: <https://github.com/typesafe-ai/typesafe-sdk-js> (`npm install @typesafe-ai/sdk`)
- Docs: <https://docs.typesafe.ai/>
- Nutrient's `docsignals` (<https://github.com/PSPDFKit-labs/docsignals>) is a worked example of
  Jev used at scale: DWS extraction feeding Jev questions over document pages, with reducers and
  page-level provenance.
