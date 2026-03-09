# Migration Guide

Step-by-step instructions for migrating to FSD v2.1 from either FSD v2.0 or
a non-FSD codebase.

---

## Part 1: FSD v2.0 → v2.1 (Non-breaking)

The v2.1 update emphasizes "start simple, extract when needed." The migration
is non-breaking — it simplifies your codebase by moving single-use code back
to where it is consumed.

### Step 1: Audit existing slices

Identify which features and entities are used in only one place.

```bash
# Use Steiger to detect single-use slices
npm install -D @feature-sliced/steiger
npx steiger src

# Look for these rules:
# - insignificant-slice: entity/feature used by only one consumer
# - excessive-slicing: too many slices in a layer
```

For each flagged slice, decide:

- Is it genuinely reused in 2+ places? → Keep in features/entities.
- Used in only one page? → Mark for migration back to that page.

### Step 2: Move page-specific code back to pages

Take single-use features and entities and inline them into the consuming page.

```text
// Before (v2.0): feature used by only one page
features/user-profile-form/
  ui/ProfileForm.tsx
  model/profile-form.ts
  api/update-profile.ts
  index.ts
pages/profile/
  ui/ProfilePage.tsx       ← Thin wrapper, just composes

// After (v2.1): code lives in the page that owns it
pages/profile/
  ui/
    ProfilePage.tsx
    ProfileForm.tsx         ← Moved from features
  model/
    profile.ts              ← Merged form logic here
  api/
    update-profile.ts       ← Moved from features
  index.ts
```

**Migration checklist for each moved slice:**

1. Copy all files from the feature/entity into the consuming page.
2. Update the page's `index.ts` to export what is needed.
3. Update all imports across the codebase to point to the new location.
4. Delete the now-empty feature/entity directory.
5. Run tests to verify nothing broke.

### Step 3: Move widget-specific code to widgets

If a feature or entity is used only within one widget, move it into that
widget slice.

```text
// Before: entity used only by the header widget
entities/notification-count/
  model/notification-count.ts

// After: inline into the widget
widgets/header/
  model/
    notification-count.ts   ← Moved from entities
```

### Step 4: Keep genuinely reused code in place

Code that is confirmed to be used in 2+ places remains in features/entities.
Do not move it.

### Step 5: Deprecate the processes layer

The `processes/` layer is deprecated in v2.1. Migrate its code:

**Multi-page workflows** (e.g., checkout flow, onboarding wizard):

- Move orchestration logic to the page that initiates the workflow.
- If multiple pages share the workflow state, create a feature for it.

**Background processes** (e.g., polling, sync):

- Move to `app/` if truly global (app-wide polling).
- Move to the relevant page or feature if scoped.

```text
// Before: processes layer
processes/
  checkout/
    model/checkout-flow.ts    ← Multi-step checkout orchestration
  sync/
    model/background-sync.ts  ← Periodic data sync

// After: distributed to appropriate layers
features/checkout/
  model/
    checkout-flow.ts           ← Now a feature (used in 2+ pages)
  index.ts
app/
  sync/
    background-sync.ts         ← Global concern → app layer
```

### Post-migration verification

After completing the migration:

1. Run `npx steiger src` — all `insignificant-slice` warnings should be gone.
2. Verify import directions — no upward or same-layer cross-imports.
3. Check that no empty layer directories remain.
4. Update documentation to reflect the new structure.

---

## Part 2: Non-FSD Codebase → FSD

Migrate incrementally. Do not attempt a big-bang rewrite.

### Phase 1: Establish shared/ (Week 1-2)

Move infrastructure code that has no business logic:

```text
// Typical targets for shared/
shared/
  ui/          ← Existing UI component library
  lib/         ← Utility functions (formatDate, validators, etc.)
  api/         ← API client setup, axios/fetch configuration
  auth/        ← Auth token management, session utilities
  config/      ← Environment variables, app constants
  assets/      ← Images, fonts, icons
```

**Rules during this phase:**

- Only move code with zero business logic.
- Do not refactor the moved code yet — just relocate.
- Set up path aliases (`@/shared/...`).

### Phase 2: Create pages/ (Week 2-4)

Organize route-level components into page slices:

```text
// Before: flat or feature-grouped structure
src/
  components/
    Dashboard.tsx
    Profile.tsx
    Settings.tsx

// After: FSD pages with their own segments
src/
  pages/
    dashboard/
      ui/Dashboard.tsx
      model/dashboard.ts
      api/fetch-dashboard.ts
      index.ts
    profile/
      ui/Profile.tsx
      model/profile.ts
      api/fetch-profile.ts
      index.ts
```

**Rules during this phase:**

- Each page owns its UI, state, and API calls.
- Do not extract features or entities yet.
- It is fine for pages to have substantial code — this is v2.1 behavior.

### Phase 3: Set up app/ (Week 3-4)

Move global configuration:

```text
src/
  app/
    providers/      ← Redux store, React Query client, theme
    router.tsx      ← Route configuration
    styles/         ← Global CSS, reset styles
    index.tsx       ← Entry point
```

### Phase 4: Extract features/ and entities/ (Ongoing)

Only when genuine reuse is observed and the team agrees:

```text
// Signal: "profile form" is now needed in both /profile and /settings pages
// Team agrees to extract → create a feature

features/profile-form/
  ui/ProfileForm.tsx
  model/profile-form.ts
  index.ts
```

**Decision criteria for extraction:**

- The code is genuinely used in 2+ places (not hypothetically).
- The team agrees the extraction reduces net complexity.
- The extracted slice has a clear, focused responsibility.

### Common pitfalls during migration

1. **Extracting too early.** Wait for real reuse, not anticipated reuse.
2. **Creating empty layers.** Do not create `features/`, `entities/`, or
   `widgets/` directories until you have content for them.
3. **Refactoring while migrating.** Separate relocation from refactoring.
   First move files, then improve them in separate commits.
4. **Ignoring import direction.** Enforce import rules from day one. Use
   ESLint with `eslint-plugin-import` or Steiger to catch violations.
5. **Big-bang migration.** Migrate module by module, verifying each step.
   A hybrid structure (partially FSD, partially legacy) is acceptable
   during transition.
