# Skill evaluation cases

`evals.json` records the placement answers this skill is supposed to produce.
The validator keeps the file honest; a person or a harness grades the answers.

The file uses the `evals/evals.json` layout that Anthropic's `skill-creator`
and [agent-skills-eval](https://github.com/darkrishabh/agent-skills-eval)
read, so the same cases run in a judge-model harness without conversion.
The `why`, `source`, and `rule` fields are this repository's additions;
harnesses ignore them and the validator checks them.

## Why this exists

The other checks in this repository verify that the documents are well formed:
the body stays under the line limit, every reference path resolves, no
reference is orphaned. None of them verify the thing the skill is for, which
is whether an agent reading it places code correctly.

That gap is not theoretical. Several rules in this skill were changed because
two passages decided the same question on different grounds, and nothing in CI
noticed. A case list is the cheapest way to catch the next one.

## Running the cases

There is no semantic grader in CI, because comparing an answer to
`expected_output` needs a model or a person.

### With a harness

See "Running the eval cases" in the root `README.md` for the command.
The command is documented outside `feature-sliced-design/` because that
directory is distributed to agents as the skill.

This harness loads `SKILL.md` and all files in `references/` upfront.
A pass means the model answered the case correctly with all those files
available. It does not show whether the agent follows `SKILL.md` to find
the right reference files. Check that separately by hand.

### By hand

1. Start an agent session with only this skill installed.
2. Send one `prompt` verbatim. Do not add context; the point is to see what
   the skill alone produces.
3. Check the answer against each assertion. Judge the placement, not the
   wording.
4. On a mismatch, read the file named in `source` and check whether the rule
   is absent, ambiguous, contradicted elsewhere, or whether the case itself
   no longer describes the behavior the skill intends. Fix whichever one is
   wrong. Never edit `expected_output` just to match what the model said.

Start a fresh session per case. A previous answer in the same conversation
will steer the next one.

## Adding a case

Add an object to `evals` with all seven fields:

| Field | Meaning |
| --- | --- |
| `id` | kebab-case, unique |
| `prompt` | what the user types, verbatim |
| `expected_output` | the placement, plus what must not happen if that matters |
| `assertions` | `expected_output` split into conditions a judge can grade one at a time |
| `why` | what regression this case guards against |
| `source` | repo-relative path to the primary file that decides it |
| `rule` | the passage that decides it, as `;`-separated fragments; name a passage from another file too when the decision leans on one |

Each assertion states one condition on the answer, phrased as "The output
...". The first one names the placement. Each thing that must not happen
gets an assertion of its own, so a failed run names the condition that
broke. Two to four per case is usual; a routing case that asks about
several items gets one per item.

`source` names one file, the one to open first on a mismatch, even where
the decision is settled by more than one passage. It must point at a file
that exists, and `node .github/scripts/validate-skills.mjs` enforces that,
so no case can cite a file that has been deleted.

The validator also resolves every fragment of `rule` against the skill's
documents, so a renamed heading or renumbered section fails the build
instead of leaving a case pointing at nothing. A fragment resolves against
`source` unless it names another file (`SKILL.md`, `auth-and-api.md`), and
it must contain at least one of:

- a numbered reference such as `Section 2, Step 3`, `Rule 4-2`,
  `Strategy D`, `Snapshot 1`, or `Question 2`
- a phrase in single or double quotes that appears verbatim in the file
- the text of a heading or bold label in the file, such as `Decision tree`

`Section N` and `Rule N-M` always mean a numbered heading in `SKILL.md`.
Free prose after a numbered reference is allowed and not checked, so
`Section 6 anti-pattern on the user entity` is fine.

Write a case when it guards a mistake that is actually likely: a rule two
readings could defend, a regression that has already happened once, or a
convention from outside FSD that an agent will reach for anyway. Several
cases here are the third kind, where the rule is plain and the pull toward
breaking it is what needs holding down.

Keep a case on one architectural decision where you can. A prompt that
checks several independent placements fails as one result, and then the
failure does not say which rule broke. Split it instead.

A case that restates an obvious rule without guarding a realistic mistake
costs a run and catches nothing.
