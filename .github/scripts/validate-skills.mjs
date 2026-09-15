#!/usr/bin/env node

/**
 * Validate repository-specific skill package rules.
 * The official skills CLI validates frontmatter and installation.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const SKILL_LINE_LIMIT = 500;
// Limits from the Agent Skills specification for SKILL.md frontmatter.
const NAME_LIMIT = 64;
const DESCRIPTION_LIMIT = 1024;
const REFERENCE_PATH_PATTERN = /\breferences\/([A-Za-z0-9._-]+\.md)\b/g;
// The heading of the section where SKILL.md routes a situation to the
// reference file that covers it.
const ROUTING_SECTION_PATTERN =
  /^(#{1,6})\s+(?:\d+\.\s+)?Conditional references\s*$/i;
const IS_GITHUB_ACTIONS = process.env.GITHUB_ACTIONS === "true";

// Set by validateRepository for the duration of one run, so the helpers
// below can stay free of parameter threading.
let ROOT = DEFAULT_ROOT;
let errors = [];
let log = console.log;
let logError = console.error;

function isFile(filePath) {
  return statSync(filePath, { throwIfNoEntry: false })?.isFile() ?? false;
}

function readLines(filePath) {
  const lines = readFileSync(filePath, "utf8")
    .replace(/\r\n?/g, "\n")
    .split("\n");

  // Do not count the empty value created by a trailing newline.
  if (lines.at(-1) === "") {
    lines.pop();
  }

  return lines;
}

function readFrontmatterField(lines, bodyStart, field) {
  // Scalar (`name: value`) or folded block (`description: >`) form.
  const pattern = new RegExp(`^${field}:\\s*(.*)$`);

  for (let index = 1; index < bodyStart - 1; index += 1) {
    const match = lines[index].match(pattern);

    if (match === null) {
      continue;
    }

    const inline = match[1].trim();

    if (inline !== "" && inline !== ">" && inline !== "|") {
      return inline;
    }

    // Folded or literal block: collect the indented lines beneath it.
    const block = [];

    for (let next = index + 1; next < bodyStart - 1; next += 1) {
      if (!/^\s+\S/.test(lines[next])) {
        break;
      }

      block.push(lines[next].trim());
    }

    return block.join(" ").trim();
  }

  return null;
}

function findBodyStart(filePath, lines) {
  if (lines[0] !== "---") {
    recordError(filePath, "SKILL.md is missing its frontmatter block", 1);
    return null;
  }

  const closingDelimiter = lines.indexOf("---", 1);

  if (closingDelimiter === -1) {
    recordError(
      filePath,
      "SKILL.md frontmatter is missing its closing --- delimiter",
      1,
    );
    return null;
  }

  return closingDelimiter + 1;
}

function recordError(filePath, message, lineNumber) {
  const relativePath = path.relative(ROOT, filePath).split(path.sep).join("/");
  errors.push({ file: relativePath, message, line: lineNumber });

  if (IS_GITHUB_ACTIONS) {
    const location =
      lineNumber === undefined
        ? `file=${relativePath}`
        : `file=${relativePath},line=${lineNumber}`;

    logError(`::error ${location}::${message}`);
    return;
  }

  const location =
    lineNumber === undefined ? relativePath : `${relativePath}:${lineNumber}`;

  logError(`ERROR  ${location}  ${message}`);
}

function findSkillDirectories() {
  const skillDirectories = [];

  for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }

    const skillDirectory = path.join(ROOT, entry.name);
    const skillFile = path.join(skillDirectory, "SKILL.md");

    if (isFile(skillFile)) {
      skillDirectories.push(skillDirectory);
    }
  }

  return skillDirectories.sort();
}

// The routing section as a [start, end) line range, or null when the skill
// has no such section. Scoping the mention set to this range is what makes
// a reference named only in passing prose count as unrouted.
//
// Fenced lines are skipped at both ends: a `# comment` inside a fenced
// example is not the next heading, and a heading shown inside a fenced
// example is not the section.
function findRoutingSection(lines) {
  let inFence = false;
  let start = -1;
  let depth = 0;

  for (const [index, line] of lines.entries()) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      continue;
    }

    if (start === -1) {
      const opening = ROUTING_SECTION_PATTERN.exec(line);

      if (opening !== null) {
        start = index;
        depth = opening[1].length;
      }

      continue;
    }

    const heading = /^(#{1,6})\s+/.exec(line);

    if (heading !== null && heading[1].length <= depth) {
      return [start, index];
    }
  }

  return start === -1 ? null : [start, lines.length];
}

function inSection(range, index) {
  return range === null || (index >= range[0] && index < range[1]);
}

function validateSkill(skillDirectory, documentsBySkill) {
  const skillFile = path.join(skillDirectory, "SKILL.md");
  const lines = readLines(skillFile);
  const bodyStart = findBodyStart(skillFile, lines);

  // The limit applies to the body, which is what the agent loads when the
  // skill activates. Frontmatter is metadata, so it is excluded.
  const bodyLength =
    bodyStart === null ? lines.length : lines.length - bodyStart;

  log(
    `  ${path.basename(skillDirectory)}/SKILL.md: ` +
      `${bodyLength} body lines`,
  );

  if (bodyLength >= SKILL_LINE_LIMIT) {
    recordError(
      skillFile,
      `SKILL.md body contains ${bodyLength} lines; ` +
        `it must stay under ${SKILL_LINE_LIMIT} lines`,
    );
  }

  if (bodyStart !== null) {
    // The installed skill is addressed by its directory name, so a
    // frontmatter name that disagrees with it routes to nothing.
    const declaredName = readFrontmatterField(lines, bodyStart, "name");
    const directoryName = path.basename(skillDirectory);

    if (declaredName === null) {
      recordError(skillFile, "frontmatter is missing a name field", 1);
    } else if (declaredName.length > NAME_LIMIT) {
      recordError(
        skillFile,
        `frontmatter name is ${declaredName.length} characters; ` +
          `the limit is ${NAME_LIMIT}`,
        1,
      );
    } else if (declaredName !== directoryName) {
      recordError(
        skillFile,
        `frontmatter name "${declaredName}" does not match the ` +
          `directory name "${directoryName}"`,
        1,
      );
    }

    // The description is the only text an agent reads when deciding
    // whether to activate the skill.
    const description = readFrontmatterField(lines, bodyStart, "description");

    if (description === null || description === "") {
      recordError(skillFile, "frontmatter is missing a description", 1);
    } else {
      log(`    description: ${description.length}/${DESCRIPTION_LIMIT} characters`);

      if (description.length > DESCRIPTION_LIMIT) {
        recordError(
          skillFile,
          `frontmatter description is ${description.length} characters; ` +
            `the limit is ${DESCRIPTION_LIMIT}`,
          1,
        );
      }
    }
  }

  // Every `references/<file>.md` path, wherever it is written, must resolve.
  // SKILL.md routes to the references; the references point at each other.
  // Only the routing section counts as routing, so a reference the section
  // forgets is caught even when the body names it somewhere else.
  const routingSection = findRoutingSection(lines);
  const mentionedInSkill = new Set();

  for (const filePath of documentFiles(skillDirectory)) {
    const documentLines =
      filePath === skillFile ? lines : readLines(filePath);
    let inFence = false;

    for (const [index, line] of documentLines.entries()) {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }

      for (const match of line.matchAll(REFERENCE_PATH_PATTERN)) {
        const referenceName = match[1];

        // A path written in a fenced example still has to resolve, but an
        // example is not a rule that routes a situation to the file.
        if (
          filePath === skillFile &&
          !inFence &&
          inSection(routingSection, index)
        ) {
          mentionedInSkill.add(referenceName);
        }

        const referenceFile = path.join(
          skillDirectory,
          "references",
          referenceName,
        );

        if (!isFile(referenceFile)) {
          recordError(
            filePath,
            `references/${referenceName} does not exist`,
            index + 1,
          );
        }
      }
    }
  }

  // A reference the routing section never names is dead weight: it ships
  // with the package but no routing rule can reach it.
  const referencesDirectory = path.join(skillDirectory, "references");

  if (statSync(referencesDirectory, { throwIfNoEntry: false })?.isDirectory()) {
    for (const entry of readdirSync(referencesDirectory)) {
      if (entry.endsWith(".md") && !mentionedInSkill.has(entry)) {
        recordError(
          path.join(referencesDirectory, entry),
          routingSection === null
            ? `references/${entry} is never mentioned in SKILL.md`
            : `references/${entry} is not routed from the ` +
              `"Conditional references" section of SKILL.md`,
        );
      }
    }
  }

  const documents = loadDocuments(skillDirectory);
  documentsBySkill.set(skillDirectory, documents);
  validateCrossReferences(skillDirectory, documents);
}

// Cross-references between the skill's documents. Section and rule numbers
// are the addresses the documents use for each other, and nothing else
// notices when a renumbering or a renamed heading leaves one dangling.
//
// Conventions the check enforces:
//   - `Section N`, `Section N-M`, and `Rule N-M` always mean a numbered
//     heading in SKILL.md, whichever file mentions them.
//   - `Step N`, `Strategy X`, `Snapshot N`, `Part N`, and `Question N` mean
//     a heading or bold label somewhere in the skill package.
//   - A named rule ("the request placement rule") that is mentioned from
//     more than one file must be a heading or bold label somewhere, so a
//     rename of the anchor breaks the build instead of the reader.
const HEADING_PATTERN = /^#{1,6}\s+(.+?)\s*$/;
const BOLD_LABEL_PATTERN = /^\s*(?:[-*>]\s+|\d+\.\s+)?\*\*(.+?)(?:\*\*|$)/;
const SKILL_SCOPED_TOKEN_PATTERN =
  /\b(Sections?|Rules?)\s+(\d+(?:-\d+)?(?:(?:,\s*|,?\s+and\s+)\d+(?:-\d+)?)*)\b/g;
// Ids are a single letter or a run of digits, so a package that reaches
// Step 10 keeps being checked instead of silently dropping out.
const PACKAGE_SCOPED_TOKEN_PATTERN =
  /\b(Steps?|Strateg(?:y|ies)|Snapshots?|Parts?|Questions?)\s+((?:[A-Z]|\d+)(?:(?:,\s*|,?\s+and\s+)(?:[A-Z]|\d+))*)\b/g;
const NAMED_RULE_PATTERN = /\bthe ((?:[a-z@][\w@/-]*\s+){1,3}rule)\b/gi;
const QUOTED_PHRASE_PATTERN = /'([^']+)'|"([^"]+)"/g;

function normalizeAnchorText(text) {
  return text
    .replace(/[`*]/g, "")
    .replace(/^(?:\d+(?:-\d+)?\.|Step \d+\.)\s+/, "")
    .replace(/:\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function collectAnchors(lines) {
  // tokens: "section 1", "rule 4-2", "step 3", "strategy d", "snapshot 1"
  // names: normalized heading and bold-label texts
  const anchors = { tokens: new Set(), names: new Set() };
  let inFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      continue;
    }

    const heading = line.match(HEADING_PATTERN);
    const label = heading === null ? line.match(BOLD_LABEL_PATTERN) : null;
    const raw = heading?.[1] ?? label?.[1];

    if (raw === undefined) {
      continue;
    }

    const text = raw.replace(/[`*]/g, "").trim();

    if (heading !== null) {
      const numbered = text.match(/^(\d+)(-\d+)?\.\s/);

      if (numbered !== null) {
        anchors.tokens.add(`section ${numbered[1]}${numbered[2] ?? ""}`);

        if (numbered[2] !== undefined) {
          anchors.tokens.add(`rule ${numbered[1]}${numbered[2]}`);
        }
      }
    }

    const scoped = text.match(
      /^(Step|Strategy|Snapshot|Part|Question)\s+([A-Z]|\d+)\b/,
    );

    if (scoped !== null) {
      anchors.tokens.add(`${scoped[1].toLowerCase()} ${scoped[2]}`);
    }

    anchors.names.add(normalizeAnchorText(text));
  }

  return anchors;
}

function singularKeyword(keyword) {
  const lower = keyword.toLowerCase();

  if (lower === "strategies") {
    return "strategy";
  }

  return lower.replace(/s$/, "");
}

function* tokenReferences(text) {
  // Yields { kind, keyword, id, scope } for each numbered reference, with
  // "Rules 4-1, 4-2, and 4-4" expanded to one entry per id.
  for (const [pattern, scope] of [
    [SKILL_SCOPED_TOKEN_PATTERN, "skill"],
    [PACKAGE_SCOPED_TOKEN_PATTERN, "package"],
  ]) {
    for (const match of text.matchAll(pattern)) {
      const keyword = singularKeyword(match[1]);

      for (const id of match[2].split(/,?\s+and\s+|,\s*/)) {
        yield { keyword, id, scope, token: `${keyword} ${id}` };
      }
    }
  }
}

function tokenExists(reference, skillAnchors, packageTokens) {
  if (reference.scope === "skill") {
    // "Section 4-2" and "Rule 4-2" are the same heading.
    return (
      skillAnchors.tokens.has(`section ${reference.id}`) ||
      skillAnchors.tokens.has(`rule ${reference.id}`)
    );
  }

  return packageTokens.has(reference.token);
}

function documentFiles(skillDirectory) {
  const files = [path.join(skillDirectory, "SKILL.md")];
  const referencesDirectory = path.join(skillDirectory, "references");

  if (statSync(referencesDirectory, { throwIfNoEntry: false })?.isDirectory()) {
    for (const entry of readdirSync(referencesDirectory).sort()) {
      if (entry.endsWith(".md")) {
        files.push(path.join(referencesDirectory, entry));
      }
    }
  }

  return files;
}

function loadDocuments(skillDirectory) {
  const documents = new Map();

  for (const filePath of documentFiles(skillDirectory)) {
    const lines = readLines(filePath);
    documents.set(filePath, { lines, anchors: collectAnchors(lines) });
  }

  return documents;
}

function packageTokensOf(documents) {
  const tokens = new Set();

  for (const { anchors } of documents.values()) {
    for (const token of anchors.tokens) {
      tokens.add(token);
    }
  }

  return tokens;
}

function nameIsAnchored(name, documents) {
  for (const { anchors } of documents.values()) {
    for (const anchor of anchors.names) {
      if (anchor.includes(name) || name.includes(anchor)) {
        return true;
      }
    }
  }

  return false;
}

function validateCrossReferences(skillDirectory, documents) {
  const skillFile = path.join(skillDirectory, "SKILL.md");
  const skillAnchors = documents.get(skillFile).anchors;
  const packageTokens = packageTokensOf(documents);
  const namedRuleFiles = new Map();
  let referenceCount = 0;

  for (const [filePath, { lines }] of documents) {
    let inFence = false;

    for (const [index, line] of lines.entries()) {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }

      if (inFence) {
        continue;
      }

      for (const reference of tokenReferences(line)) {
        referenceCount += 1;

        if (!tokenExists(reference, skillAnchors, packageTokens)) {
          const where =
            reference.scope === "skill"
              ? "a numbered heading in SKILL.md"
              : "a heading or bold label in the skill package";

          recordError(
            filePath,
            `"${reference.keyword} ${reference.id}" does not match ${where}`,
            index + 1,
          );
        }
      }

      for (const match of line.matchAll(NAMED_RULE_PATTERN)) {
        const name = match[1].replace(/\s+/g, " ").toLowerCase();
        const files = namedRuleFiles.get(name) ?? new Set();
        files.add(filePath);
        namedRuleFiles.set(name, files);
      }
    }
  }

  for (const [name, files] of namedRuleFiles) {
    if (files.size < 2 || nameIsAnchored(name, documents)) {
      continue;
    }

    for (const filePath of files) {
      recordError(
        filePath,
        `"the ${name}" is cited from ${files.size} files but is not a ` +
          "heading or bold label anywhere in the skill package",
      );
    }
  }

  log(
    `  ${path.basename(skillDirectory)}: ` +
      `${referenceCount} numbered cross-reference(s) resolve`,
  );
}

function resolveRuleFragment(fragment, sourceFile, documents, skillFile) {
  // Returns null when the fragment resolves, otherwise a reason.
  const referencesDirectory = path.join(path.dirname(skillFile), "references");
  const fileMention = fragment.match(/\b([\w.-]+\.md)\b/);
  let targetFile = sourceFile;

  if (fileMention !== null) {
    targetFile =
      fileMention[1] === "SKILL.md"
        ? skillFile
        : path.join(referencesDirectory, fileMention[1]);
  }

  const target = documents.get(targetFile);

  if (target === undefined) {
    return `names "${fileMention?.[1] ?? targetFile}", which is not a document of the skill`;
  }

  const skillAnchors = documents.get(skillFile).anchors;
  const packageTokens = packageTokensOf(documents);
  let checked = false;

  for (const reference of tokenReferences(fragment)) {
    checked = true;

    if (!tokenExists(reference, skillAnchors, packageTokens)) {
      return `cites "${reference.keyword} ${reference.id}", which does not exist`;
    }
  }

  const targetText = target.lines.join("\n");

  for (const match of fragment.matchAll(QUOTED_PHRASE_PATTERN)) {
    checked = true;
    const phrase = match[1] ?? match[2];

    if (!targetText.includes(phrase)) {
      return `quotes "${phrase}", which does not appear in ${path.basename(targetFile)}`;
    }
  }

  if (checked) {
    return null;
  }

  const name = normalizeAnchorText(
    fragment.replace(/\b[\w.-]+\.md\b/, "").trim(),
  );

  for (const anchor of target.anchors.names) {
    if (anchor === name || anchor.startsWith(`${name} `)) {
      return null;
    }
  }

  return (
    `"${fragment.trim()}" is not a heading, bold label, numbered reference, ` +
    `or quoted phrase of ${path.basename(targetFile)}`
  );
}

function validateCaseRule(evalsFile, label, testCase, documentsBySkill) {
  const sourceFile = path.join(ROOT, testCase.source);
  // A source is either <skill>/SKILL.md or <skill>/references/<file>.md.
  const sourceDirectory = path.dirname(sourceFile);
  const skillDirectory =
    path.basename(sourceDirectory) === "references"
      ? path.dirname(sourceDirectory)
      : sourceDirectory;
  const documents = documentsBySkill.get(skillDirectory);

  if (documents === undefined || !documents.has(sourceFile)) {
    recordError(
      evalsFile,
      `case ${label} cites "${testCase.source}", which is not a skill document`,
    );
    return;
  }

  const skillFile = path.join(skillDirectory, "SKILL.md");

  for (const fragment of testCase.rule.split(";")) {
    const problem = resolveRuleFragment(fragment, sourceFile, documents, skillFile);

    if (problem !== null) {
      recordError(evalsFile, `case ${label} rule ${problem}`);
    }
  }
}

// Each skill keeps its cases in <skill>/evals/evals.json, the layout that
// skill-creator and agent-skills-eval read, so the same file serves the
// validator here and a judge-model harness outside CI.
function validateEvals(skillDirectory, documentsBySkill) {
  const evalsFile = path.join(skillDirectory, "evals", "evals.json");

  if (!isFile(evalsFile)) {
    return;
  }

  let parsed;

  try {
    parsed = JSON.parse(readFileSync(evalsFile, "utf8"));
  } catch (error) {
    recordError(evalsFile, `is not valid JSON: ${error.message}`);
    return;
  }

  const skillName = path.basename(skillDirectory);

  // Harnesses key their reports on skill_name, so a mismatch files the
  // results under a skill that does not exist.
  if (parsed?.skill_name !== skillName) {
    recordError(
      evalsFile,
      `skill_name "${parsed?.skill_name}" does not match the ` +
        `skill directory "${skillName}"`,
    );
  }

  const cases = parsed?.evals;

  if (!Array.isArray(cases) || cases.length === 0) {
    recordError(evalsFile, "must contain a non-empty evals array");
    return;
  }

  log(`  ${skillName}/evals/evals.json: ${cases.length} case(s)`);

  const required = ["id", "prompt", "expected_output", "why", "source", "rule"];
  const seen = new Set();

  for (const [index, testCase] of cases.entries()) {
    const label = testCase?.id ?? `#${index + 1}`;

    for (const field of required) {
      if (typeof testCase?.[field] !== "string" || testCase[field] === "") {
        recordError(evalsFile, `case ${label} is missing "${field}"`);
      }
    }

    if (typeof testCase?.id === "string") {
      if (seen.has(testCase.id)) {
        recordError(evalsFile, `case id "${testCase.id}" is duplicated`);
      }

      seen.add(testCase.id);
    }

    // A case that cites a file which no longer exists silently stops
    // guarding anything, so treat the dangling path as an error.
    if (typeof testCase?.source === "string" && testCase.source !== "") {
      if (!isFile(path.join(ROOT, testCase.source))) {
        recordError(
          evalsFile,
          `case ${label} cites "${testCase.source}", which does not exist`,
        );
      } else if (typeof testCase.rule === "string" && testCase.rule !== "") {
        // The rule names the passage that decides the case. Check it the
        // same way the documents check each other, so a renamed heading
        // or renumbered section cannot leave a case pointing at nothing.
        validateCaseRule(evalsFile, label, testCase, documentsBySkill);
      }
    }
  }
}

/**
 * Validate the repository at `root`. Returns the list of problems found,
 * each as { file, message, line }, and prints them through the given
 * loggers. Tests call this on a mutated copy of the repository.
 */
export function validateRepository(root = DEFAULT_ROOT, options = {}) {
  ROOT = root;
  errors = [];
  log = options.log ?? console.log;
  logError = options.logError ?? console.error;

  const skillDirectories = findSkillDirectories();

  if (skillDirectories.length === 0) {
    errors.push({
      file: ".",
      message: "no skill packages found; expected */SKILL.md",
    });
    logError("ERROR  no skill packages found; expected */SKILL.md");
    return errors;
  }

  log(`Validating ${skillDirectories.length} skill package(s):`);

  const documentsBySkill = new Map();

  for (const skillDirectory of skillDirectories) {
    validateSkill(skillDirectory, documentsBySkill);
  }

  for (const skillDirectory of skillDirectories) {
    validateEvals(skillDirectory, documentsBySkill);
  }

  return errors;
}

function main() {
  const problems = validateRepository();

  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s) found.`);
    process.exitCode = 1;
    return;
  }

  console.log("\nAll checks passed.");
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
