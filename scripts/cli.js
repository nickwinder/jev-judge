#!/usr/bin/env node
'use strict';

/**
 * jev — ask Jev (TypeSafe AI's typed-judgment model) a single question from the command line.
 *
 * Thin wrapper over the official @typesafe-ai/sdk. Jev never returns prose: every answer is a
 * probability over a fixed set of outcomes.
 *
 *   node cli.js <noul|choice|score> "<question>" [args...] [flags]
 */

const fs = require('fs');
const { TypeSafeClient } = require('@typesafe-ai/sdk');

const USAGE = `jev — ask Jev a single typed question from the command line

  noul   "<question>" [--true "<desc>"] [--false "<desc>"]   yes/no, as a probability
  choice "<question>" <label>[=<desc>] <label>[=<desc>] ...  pick one of your labels
  score  "<question>" <level0-desc> <level1-desc> ...        a level on your ordered scale

STATE (what Jev reads to answer)
  --state "<text>"          literal text
  --state-file <path>       read from a file; .json is parsed as JSON, anything else is raw text
  (piped stdin)             used only when neither --state nor --state-file is given

FLAGS
  --model <name>    override the default model (env TYPESAFE_DEFAULT_MODEL, else jev-latest)
  --timeout <ms>    per-request timeout (SDK default: 10000)
  --json            print the raw answer as JSON instead of a formatted line

Requires TYPESAFE_API_KEY in the environment.

Examples:
  echo "I was charged twice, please help" | node cli.js noul "Is this about billing?"
  node cli.js choice "What is this ticket about?" billing=Payments technical=Bugs other \\
    --state-file ticket.txt
  node cli.js score "How urgent is this?" "not urgent" "somewhat urgent" "urgent" "critical" \\
    --state-file ticket.txt --json`;

function fail(message) {
  throw new Error(message);
}

function parseFlags(argv) {
  const flags = { json: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') flags.json = true;
    else if (a === '--state') flags.state = requireValue(argv, ++i, '--state');
    else if (a === '--state-file') flags.stateFile = requireValue(argv, ++i, '--state-file');
    else if (a === '--true') flags.true = requireValue(argv, ++i, '--true');
    else if (a === '--false') flags.false = requireValue(argv, ++i, '--false');
    else if (a === '--model') flags.model = requireValue(argv, ++i, '--model');
    else if (a === '--timeout') flags.timeout = requireNumber(argv, ++i, '--timeout');
    else if (a.startsWith('--')) fail(`unknown flag: ${a}`);
    else positional.push(a);
  }
  return { flags, positional };
}

function requireValue(argv, i, name) {
  const v = argv[i];
  if (v === undefined) fail(`${name} needs a value`);
  return v;
}

function requireNumber(argv, i, name) {
  const raw = requireValue(argv, i, name);
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) fail(`${name} needs a positive number (got ${raw})`);
  return n;
}

// `isTTY` is undefined (not false) when stdin is a pipe with nothing behind it yet, which is
// exactly how an agent's shell tool runs a command — so the isTTY check below never catches an
// invocation that forgot --state/--state-file. This timeout is what actually fails it loud
// instead of hanging: a held-open pipe with no bytes on it, or a genuine terminal, both error
// out after 5s of silence rather than blocking the caller forever.
const STDIN_SILENCE_TIMEOUT_MS = 5000;

function readStdin() {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    let data = '';
    const onData = (chunk) => {
      clearTimeout(timer);
      data += chunk;
    };
    const onEnd = () => {
      clearTimeout(timer);
      resolve(data);
    };
    const onError = (err) => {
      clearTimeout(timer);
      reject(err);
    };
    const timer = setTimeout(() => {
      stdin.removeListener('data', onData);
      stdin.removeListener('end', onEnd);
      stdin.removeListener('error', onError);
      stdin.pause();
      reject(new Error('timed out waiting for stdin; pass --state or --state-file instead'));
    }, STDIN_SILENCE_TIMEOUT_MS);
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
    stdin.on('end', onEnd);
    stdin.on('error', onError);
  });
}

async function resolveState(flags) {
  if (flags.state !== undefined && flags.stateFile !== undefined) {
    fail('pass only one of --state or --state-file');
  }
  if (flags.state !== undefined) return flags.state;
  if (flags.stateFile !== undefined) {
    if (!fs.existsSync(flags.stateFile)) fail(`--state-file not found: ${flags.stateFile}`);
    const raw = fs.readFileSync(flags.stateFile, 'utf8');
    if (flags.stateFile.endsWith('.json')) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        fail(`--state-file ${flags.stateFile} ends in .json but is not valid JSON: ${e.message}`);
      }
    }
    return raw;
  }
  if (process.stdin.isTTY) {
    fail('no state given: pass --state, --state-file, or pipe content on stdin');
  }
  const raw = await readStdin();
  if (!raw.trim()) fail('stdin was empty; pass --state or --state-file instead');
  return raw;
}

function splitLabel(arg) {
  const eq = arg.indexOf('=');
  if (eq === -1) return [arg, null];
  const label = arg.slice(0, eq);
  const desc = arg.slice(eq + 1);
  if (!label) fail(`bad label argument: ${arg}`);
  return [label, desc === '' ? null : desc];
}

function requestOptions(flags) {
  return flags.timeout === undefined ? undefined : { timeout: flags.timeout };
}

function rejectNoulFlags(flags, command) {
  if (flags.true !== undefined || flags.false !== undefined) {
    fail(`--true/--false only apply to noul, not ${command}`);
  }
}

async function ask(question, flags) {
  const state = await resolveState(flags);
  const { answers } = await new TypeSafeClient().systemOne(
    { state, questions: { answer: question }, ...(flags.model ? { model: flags.model } : {}) },
    requestOptions(flags),
  );
  return answers.answer;
}

async function runNoul(positional, flags) {
  const [question] = positional;
  if (!question) fail('noul needs a question: node cli.js noul "<question>"');
  const criteria = {};
  if (flags.true !== undefined) criteria.true = flags.true;
  if (flags.false !== undefined) criteria.false = flags.false;
  return ask(
    {
      type: 'noul',
      instructions: question,
      ...(Object.keys(criteria).length > 0 ? { criteria } : {}),
    },
    flags,
  );
}

async function runChoice(positional, flags) {
  rejectNoulFlags(flags, 'choice');
  const [question, ...labelArgs] = positional;
  if (!question) fail('choice needs a question: node cli.js choice "<question>" label=desc ...');
  if (labelArgs.length < 2) fail('choice needs at least two labels');
  const criteria = Object.create(null);
  for (const arg of labelArgs) {
    const [label, desc] = splitLabel(arg);
    if (Object.hasOwn(criteria, label)) fail(`duplicate label: ${label}`);
    criteria[label] = desc;
  }
  return ask({ type: 'choice', instructions: question, criteria }, flags);
}

async function runScore(positional, flags) {
  rejectNoulFlags(flags, 'score');
  const [question, ...levels] = positional;
  if (!question) fail('score needs a question: node cli.js score "<question>" level0-desc level1-desc ...');
  if (levels.length < 2) fail('score needs at least two ordered level descriptions');
  const criteria = levels.map((l) => (l === '' ? null : l));
  return ask({ type: 'score', instructions: question, criteria }, flags);
}

function format(answer) {
  if (answer.type === 'noul') return `noul: ${answer.noul}`;
  if (answer.type === 'choice') {
    const probs = Object.entries(answer.probabilities)
      .map(([label, p]) => `${label}=${p}`)
      .join(', ');
    return `choice: ${answer.choice} (confidence ${answer.confidence})\n${probs}`;
  }
  if (answer.type === 'score') {
    // `score` can fall between integer rubric levels (index.d.mts: ScoreResponse.score), so
    // `legend` — keyed by whole levels — needs rounding before it can label it.
    const nearest = Math.round(answer.score);
    const label = answer.legend[nearest];
    const approx = label !== undefined && answer.score !== nearest ? '~' : '';
    const probs = Object.entries(answer.probabilities)
      .map(([level, p]) => `${answer.legend[level] ?? level}=${p}`)
      .join(', ');
    return `score: ${answer.score}${label ? ` (${approx}${label})` : ''} (confidence ${answer.confidence})\n${probs}`;
  }
  fail(`unrecognized answer type: ${answer.type}`);
}

async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(USAGE);
    return;
  }
  const { flags, positional } = parseFlags(rest);

  let answer;
  if (command === 'noul') answer = await runNoul(positional, flags);
  else if (command === 'choice') answer = await runChoice(positional, flags);
  else if (command === 'score') answer = await runScore(positional, flags);
  else fail(`unknown command: ${command}\n\n${USAGE}`);

  console.log(flags.json ? JSON.stringify(answer, null, 2) : format(answer));
}

main(process.argv.slice(2)).catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
});
