import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateRepository } from "./validate-skills.mjs";

// Each test copies the real repository to a temporary directory, breaks
// one thing, and asserts that the validator names it. Using the live
// documents rather than hand-written fixtures means the tests also prove
// the validator accepts the repository as it is.

const ROOT = path.resolve(import.meta.dirname, "../..");
const SKILL = "feature-sliced-design/SKILL.md";
const ASSETS = "feature-sliced-design/references/asset-handling.md";
const AUTH = "feature-sliced-design/references/auth-and-api.md";
const CASES = "feature-sliced-design/evals/evals.json";
const LINE_LIMIT = 500;

function problemsAfter(mutate) {
  const dir = mkdtempSync(path.join(tmpdir(), "validate-skills-"));

  try {
    cpSync(
      path.join(ROOT, "feature-sliced-design"),
      path.join(dir, "feature-sliced-design"),
      { recursive: true },
    );

    mutate?.(dir);

    const quiet = { log() {}, logError() {} };
    return validateRepository(dir, quiet).map((problem) => problem.message);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function replaceIn(dir, relativePath, from, to) {
  const filePath = path.join(dir, relativePath);
  const text = readFileSync(filePath, "utf8");
  assert.ok(text.includes(from), `fixture text not found in ${relativePath}: ${from}`);
  writeFileSync(filePath, text.replace(from, to));
}

function appendTo(dir, relativePath, text) {
  const filePath = path.join(dir, relativePath);
  writeFileSync(filePath, readFileSync(filePath, "utf8") + text);
}

function bodyLineCount(dir) {
  const lines = readFileSync(path.join(dir, SKILL), "utf8")
    .replace(/\r\n?/g, "\n")
    .split("\n");

  if (lines.at(-1) === "") {
    lines.pop();
  }

  return lines.length - (lines.indexOf("---", 1) + 1);
}

function setRuleOfFirstCase(dir, rule) {
  const filePath = path.join(dir, CASES);
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  parsed.evals[0].rule = rule;
  parsed.evals[0].source = SKILL;
  writeFileSync(filePath, JSON.stringify(parsed, null, 2));
}

function assertOneProblemMatching(problems, pattern) {
  const matching = problems.filter((message) => pattern.test(message));
  assert.equal(
    matching.length,
    1,
    `expected exactly one problem matching ${pattern}, got:\n${problems.join("\n")}`,
  );
}

test("the repository as committed passes", () => {
  assert.deepEqual(problemsAfter(), []);
});

test("a section number with no heading in SKILL.md is reported", () => {
  const problems = problemsAfter((dir) =>
    appendTo(dir, ASSETS, "\nThe rest is in Section 77.\n"),
  );
  assertOneProblemMatching(problems, /"section 77" does not match a numbered heading/);
});

test("each id in a list of rules is checked", () => {
  const problems = problemsAfter((dir) =>
    appendTo(dir, ASSETS, "\nRules 4-1, 4-2, and 4-9 apply here.\n"),
  );
  assertOneProblemMatching(problems, /"rule 4-9" does not match/);
});

test("a package-scoped token with no anchor is reported", () => {
  const problems = problemsAfter((dir) =>
    appendTo(dir, ASSETS, "\nSee Snapshot 9 and Strategy E.\n"),
  );
  assertOneProblemMatching(problems, /"snapshot 9" does not match/);
  assertOneProblemMatching(problems, /"strategy E" does not match/);
});

test("references inside code fences are ignored", () => {
  const problems = problemsAfter((dir) =>
    appendTo(dir, ASSETS, "\n```text\n// Section 77 is only an example here\n```\n"),
  );
  assert.deepEqual(problems, []);
});

test("a named rule cited from several files must be a heading somewhere", () => {
  const problems = problemsAfter((dir) =>
    replaceIn(dir, AUTH, "### Request placement rule", "### Request placement policy"),
  );
  const matching = problems.filter((message) =>
    /"the request placement rule" is cited from \d+ files/.test(message),
  );
  assert.ok(matching.length >= 2, `expected the error once per citing file:\n${problems.join("\n")}`);
});

test("a case whose rule cites a missing rule id is reported", () => {
  const problems = problemsAfter((dir) => setRuleOfFirstCase(dir, "Rule 4-9"));
  assertOneProblemMatching(problems, /rule cites "rule 4-9", which does not exist/);
});

test("a case whose rule quotes text that is not in the source is reported", () => {
  const problems = problemsAfter((dir) =>
    setRuleOfFirstCase(dir, "Section 2, 'no such sentence anywhere'"),
  );
  assertOneProblemMatching(problems, /quotes "no such sentence anywhere", which does not appear/);
});

test("a case whose rule names a heading that does not exist is reported", () => {
  const problems = problemsAfter((dir) => setRuleOfFirstCase(dir, "No such heading"));
  assertOneProblemMatching(problems, /"No such heading" is not a heading, bold label/);
});

test("a case whose rule matches a heading of the source passes", () => {
  const problems = problemsAfter((dir) =>
    setRuleOfFirstCase(dir, "Quick placement table; SKILL.md Rule 4-2"),
  );
  assert.deepEqual(problems, []);
});

test("a case without assertions is reported", () => {
  const problems = problemsAfter((dir) => {
    const filePath = path.join(dir, CASES);
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    delete parsed.evals[0].assertions;
    writeFileSync(filePath, JSON.stringify(parsed, null, 2));
  });
  assertOneProblemMatching(problems, /needs a non-empty "assertions" array/);
});

test("a skill_name that differs from the skill directory is reported", () => {
  const problems = problemsAfter((dir) =>
    replaceIn(dir, CASES, '"skill_name": "feature-sliced-design"', '"skill_name": "fsd"'),
  );
  assertOneProblemMatching(problems, /skill_name "fsd" does not match the skill directory/);
});

test("a reference file pointing at a missing sibling is reported", () => {
  const problems = problemsAfter((dir) =>
    appendTo(dir, ASSETS, "\nMore in `references/gone.md`.\n"),
  );
  assertOneProblemMatching(problems, /references\/gone\.md does not exist/);
});

test("a reference the routing section never names is reported as orphaned", () => {
  const problems = problemsAfter((dir) =>
    writeFileSync(
      path.join(dir, "feature-sliced-design/references/orphan.md"),
      "# Orphan\n",
    ),
  );
  assertOneProblemMatching(problems, /references\/orphan\.md is not routed from/);
});

// The case the checklist used to ask a human to catch: the file is named in
// the body, so it is not orphaned, but no rule routes a situation to it.
test("a reference named only outside the routing section is reported", () => {
  const problems = problemsAfter((dir) => {
    writeFileSync(
      path.join(dir, "feature-sliced-design/references/prose-only.md"),
      "# Prose only\n",
    );
    replaceIn(
      dir,
      SKILL,
      "## 10. Conditional references",
      "The rest is in `references/prose-only.md`.\n\n## 10. Conditional references",
    );
  });
  assertOneProblemMatching(problems, /references\/prose-only\.md is not routed from/);
});

// The rule degrades rather than misfiring: a skill that organizes its
// routing differently keeps the older "mentioned anywhere" check.
test("a skill with no routing section falls back to any mention", () => {
  const problems = problemsAfter((dir) =>
    replaceIn(dir, SKILL, "## 10. Conditional references", "## 10. Reference routing"),
  );
  assert.deepEqual(problems, []);
});

// Both ends of the routing section ignore fenced lines, so a code example
// can neither cut the section short nor impersonate its heading.
test("a fenced comment inside the routing section does not end it", () => {
  const problems = problemsAfter((dir) =>
    replaceIn(
      dir,
      SKILL,
      "- **When resolving cross-import issues**",
      "```bash\n# install the CLI first\nnpx skills add .\n```\n\n- **When resolving cross-import issues**",
    ),
  );
  assert.deepEqual(problems, []);
});

test("a routing heading shown inside a fence is not the section", () => {
  const problems = problemsAfter((dir) =>
    replaceIn(
      dir,
      SKILL,
      "## 1. Core philosophy & layer overview",
      "```markdown\n## Conditional references\n```\n\n## 1. Core philosophy & layer overview",
    ),
  );
  assert.deepEqual(problems, []);
});

test("a null eval document is reported instead of crashing", () => {
  const problems = problemsAfter((dir) =>
    writeFileSync(path.join(dir, CASES), "null\n"),
  );
  assertOneProblemMatching(problems, /must contain a non-empty evals array/);
});

// Ids past one digit used to match nothing at all, so a dangling reference
// to Step 10 passed while Step 9 was caught.
test("a package token with two digits is checked", () => {
  const problems = problemsAfter((dir) =>
    appendTo(dir, ASSETS, "\nSee Step 10.\n"),
  );
  assertOneProblemMatching(problems, /"step 10" does not match/);
});

test("a package token with two digits resolves to its anchor", () => {
  const problems = problemsAfter((dir) =>
    appendTo(dir, ASSETS, "\n### Step 10. Ship it\n\nSee Step 10.\n"),
  );
  assert.deepEqual(problems, []);
});

// Padding is measured against the live document, so the boundary stays
// pinned whether SKILL.md grows or shrinks.
test("a reference named only inside a fence is not routed", () => {
  const problems = problemsAfter((dir) => {
    writeFileSync(
      path.join(dir, "feature-sliced-design/references/fenced.md"),
      "# Fenced\n",
    );
    appendTo(dir, SKILL, "\n```text\nreferences/fenced.md\n```\n");
  });
  assertOneProblemMatching(problems, /references\/fenced\.md is not routed from/);
});

test("a SKILL.md body one line under the limit passes", () => {
  const problems = problemsAfter((dir) =>
    appendTo(dir, SKILL, "Padding.\n".repeat(LINE_LIMIT - 1 - bodyLineCount(dir))),
  );
  assert.deepEqual(problems, []);
});

test("a SKILL.md body at the line limit is reported", () => {
  const problems = problemsAfter((dir) =>
    appendTo(dir, SKILL, "Padding.\n".repeat(LINE_LIMIT - bodyLineCount(dir))),
  );
  assertOneProblemMatching(problems, /must stay under 500 lines/);
});

test("a description over the specification limit is reported", () => {
  const problems = problemsAfter((dir) =>
    replaceIn(
      dir,
      SKILL,
      "description: >\n",
      `description: >\n  ${"x".repeat(1100)}\n`,
    ),
  );
  assertOneProblemMatching(problems, /frontmatter description is \d+ characters; the limit is 1024/);
});

test("a frontmatter name that differs from the directory is reported", () => {
  const problems = problemsAfter((dir) =>
    replaceIn(dir, SKILL, "name: feature-sliced-design", "name: fsd"),
  );
  assertOneProblemMatching(problems, /does not match the directory name/);
});
