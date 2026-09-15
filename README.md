# Feature-Sliced Design: Agent Skills

Agent skills that teach AI coding agents how to apply the [Feature-Sliced Design (FSD)](https://fsd.how) v2.1 methodology.

## Installation

```bash
npx skills add feature-sliced/skills
```

## Available skills

### feature-sliced-design

Apply FSD v2.1 principles when structuring frontend projects. The agent learns layer hierarchy, import rules, the decision framework for code placement, and common patterns.

Its bias is pages-first: start with `app/`, `pages/`, and `shared/`, and open a features or entities boundary only when a stable shared responsibility has earned one. Code used in two places does not, by itself, earn a layer.

It follows the official FSD v2.1 documentation but is not a verbatim copy. Where two official guides answer the same question differently, it picks one and says which. Where an integration guide has fallen behind a framework's own docs, it follows the framework. It also folds in recent maintainer guidance so an agent decides consistently across tasks. Passages that depart from a guide say so inline.

**Use when:**

- Setting up or reorganizing a frontend project structure
- Deciding where code belongs across app, pages, features, entities, and shared
- Placing static assets (images, icons, fonts, PDFs) in the right slice or layer
- Grouping closely related slices into slice groups as the project grows
- Deciding where page layouts belong, or whether to use the widgets layer (discouraged)
- Resolving cross-import issues or evaluating the @x pattern
- Deciding whether to create or remove an entity, or whether to skip the entities layer entirely
- Migrating from FSD v2.0 or a non-FSD codebase
- Integrating FSD with Next.js (App Router or Pages Router), React Router, Nuxt, Vite, or Astro
- Implementing auth, API request handling, or state management (Redux, TanStack Query) within FSD

**Examples:**

```text
Set up FSD project structure with Next.js App Router
```

```text
This rule is used on two pages now. Should it become an entity?
```

```text
Where should I put auth tokens and session state?
```

```text
These two entities need to import from each other. How do I fix this?
```

```text
Where should I put hero images for my landing page?
```

## Skill structure

```text
feature-sliced-design/
  SKILL.md                         Core rules and decision framework
  references/
    layer-structure.md             Detailed folder structures per layer (incl. slice groups)
    growth-walkthrough.md          One shop through four snapshots: which moments earn a layer
    asset-handling.md              Where to place images, icons, fonts, and other static assets
    cross-import-patterns.md       Cross-import resolution: 4 strategies for features/widgets, @x for entities
    excessive-entities.md          Keeping the entities layer clean: when to skip, what to extract
    migration-guide.md             v2.0→v2.1 and non-FSD migration
    framework-integration.md       Next.js, React Router, Nuxt, Vite, Astro setup
    auth-and-api.md                Auth, type definitions, API request handling
    state-management.md            Redux, TanStack Query (React Query)
  evals/
    README.md                      How to run and maintain the cases
    evals.json                     Placement regression cases
```

`SKILL.md` is the entry point. It tells the agent to read a reference file only when the task calls for it, so the initial context stays small.

## Contributing

Run the validator before opening a pull request:

```bash
node .github/scripts/validate-skills.mjs
```

It enforces this repository's skill-package rules, which are based in part on the guidance in [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) `AGENTS.md`:

- The `SKILL.md` body stays under 500 lines to keep the initial skill context lightweight. Frontmatter is excluded from the count.
- The frontmatter `name` matches the skill's directory name and is at most 64 characters.
- The frontmatter contains a `description` of at most 1024 characters, the limits from the Agent Skills specification.
- Every `references/<file>.md` path, whether written in `SKILL.md` or in another reference, resolves to an existing file.
- Every file under `references/` is routed from the `Conditional references` section of `SKILL.md`, so a reference that section forgets fails the build instead of shipping unreachable. Naming it elsewhere in the body, or inside a fenced example, does not count. A skill with no such section falls back to requiring a mention anywhere in `SKILL.md`.
- Every numbered cross-reference resolves. `Section N`, `Section N-M`, and `Rule N-M` always mean a numbered heading in `SKILL.md`, whichever file mentions them; `Step N`, `Strategy X`, `Snapshot N`, `Part N`, and `Question N` mean a heading or bold label somewhere in the package.
- A named rule such as "the request placement rule" that is cited from more than one file is a heading or bold label somewhere in the package, so renaming the anchor fails the build instead of stranding its readers.
- Each skill's `evals/evals.json` is valid JSON whose `skill_name` matches the skill directory and whose `evals` array is non-empty; every case has `id`, `prompt`, `expected_output`, a non-empty `assertions` array, `why`, `source`, and `rule`, ids are unique, every `source` path exists, and every `rule` fragment resolves to a passage of the skill (see `feature-sliced-design/evals/README.md`).

The validator has its own tests, which break one thing at a time in a copy of the repository and assert that it is reported:

```bash
node --test .github/scripts/validate-skills.test.mjs
```

## References

- [fsd.how](https://fsd.how): FSD official documentation
- [Steiger](https://github.com/feature-sliced/steiger): Official FSD linter
- [skills.sh](https://skills.sh): Agent skills directory

## License

MIT
