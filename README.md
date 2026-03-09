# Feature-Sliced Design — Agent Skills

Agent skills that teach AI coding agents [Feature-Sliced Design (FSD)](https://fsd.how) v2.1 architectural methodology.

## Installation

```bash
npx skills add feature-sliced/skills
```

## Available Skills

### feature-sliced-design

Apply FSD v2.1 principles when structuring frontend projects. The agent learns layer hierarchy, import rules, the decision framework for code placement, and common patterns.

**Use when:**

- Setting up or reorganizing a frontend project structure
- Deciding where to place code (pages vs. features vs. entities vs. shared)
- Resolving cross-import issues or evaluating the @x pattern
- Migrating from FSD v2.0 or a non-FSD codebase
- Integrating FSD with Next.js, Nuxt, or Vite
- Implementing auth, API request handling, or state management within FSD

**Examples:**

```text
Set up FSD project structure with Next.js App Router
```

```text
Where should I put this auth logic?
```

```text
These two entities need to import from each other — how do I fix this?
```

## Skill Structure

```text
feature-sliced-design/
  SKILL.md                         Core rules and decision framework
  references/
    layer-structure.md             Detailed folder structures per layer
    cross-import-patterns.md       Cross-import resolution strategies and @x
    migration-guide.md             v2.0→v2.1 and non-FSD migration
    framework-integration.md       Next.js, Nuxt, Vite/CRA setup and RSC
    practical-examples.md          Auth, types, API, Redux, React Query
```

The agent reads only `SKILL.md` by default. Reference files are loaded on demand based on the task.

## Contributing

When adding or modifying reference files, keep these constraints in mind:

- `SKILL.md` body ≤ 500 lines
- Each reference file: 200–500 lines
- `SKILL.md` + any single reference ≤ 1,000 lines combined
- If a reference exceeds 500 lines, split it and update the conditional loading section at the bottom of `SKILL.md`

## References

- [fsd.how](https://fsd.how) — FSD official documentation
- [Steiger](https://github.com/feature-sliced/steiger) — Official FSD linter
- [skills.sh](https://skills.sh) — Agent skills directory

## License

MIT
