# Framework Integration

How to set up FSD within specific frameworks. Covers directory placement,
routing integration, and framework-specific path alias configuration.

---

## General Principle

Place FSD layers inside `src/` to avoid naming conflicts with framework
directories. The FSD `app/` layer and `pages/` layer are **not** the same as
framework directories with the same names (e.g., Next.js `app/` directory).

---

## Next.js (App Router)

### Directory structure

```text
my-nextjs-project/
  app/                     ← Next.js App Router (routing + layouts)
    layout.tsx             ← Root layout — imports from FSD app layer
    page.tsx               ← Route entry — imports from FSD pages layer
    profile/
      page.tsx             ← Route entry for /profile
    api/                   ← Next.js API routes (if needed)
  src/
    app/                   ← FSD app layer
      providers/
        index.tsx          ← All providers (QueryClient, theme, etc.)
      styles/
        globals.css
    pages/                 ← FSD pages layer
      home/
        ui/HomePage.tsx
        index.ts
      profile/
        ui/ProfilePage.tsx
        model/profile.ts
        api/fetch-profile.ts
        index.ts
    widgets/               ← FSD widgets layer (when needed)
    features/              ← FSD features layer (when needed)
    entities/              ← FSD entities layer (when needed)
    shared/                ← FSD shared layer
      ui/
      lib/
      api/
```

### Wiring Next.js routes to FSD pages

```typescript
// app/layout.tsx
import { Providers } from '@/app/providers';
import '@/app/styles/globals.css';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

// app/page.tsx — thin route entry
import { HomePage } from '@/pages/home';
export default function Page() {
  return <HomePage />;
}

// app/profile/page.tsx
import { ProfilePage } from '@/pages/profile';
export default function Page() {
  return <ProfilePage />;
}
```

### Path aliases (next.config + tsconfig)

```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/app/*": ["src/app/*"],
      "@/pages/*": ["src/pages/*"],
      "@/widgets/*": ["src/widgets/*"],
      "@/features/*": ["src/features/*"],
      "@/entities/*": ["src/entities/*"],
      "@/shared/*": ["src/shared/*"]
    }
  }
}
```

Next.js automatically reads `tsconfig.json` paths — no additional
`next.config.js` alias configuration is needed.

### Server Components and Public API splitting

FSD layers work inside both Server and Client Components. However, the
standard single `index.ts` public API can cause problems in RSC environments
because re-exporting client and server code from the same entry point may
trigger bundler errors or unintended client/server boundary crossings.

**Split the public API into multiple entry points per environment:**

```text
entities/user/
  model/
    user.ts
  ui/
    UserAvatar.tsx          ← 'use client' — uses hooks
    UserProfileCard.tsx     ← Server Component — no hooks
  api/
    user-queries.server.ts  ← Server-only data fetching
  index.ts                  ← Shared exports (types, pure functions)
  index.client.ts           ← Client component exports
  index.server.ts           ← Server component + server-only exports
```

```typescript
// entities/user/index.ts — shared (types, pure logic, no components)
export type { User } from "./model/user";
export { formatUserName } from "./model/user";

// entities/user/index.client.ts — client components only
export { UserAvatar } from "./ui/UserAvatar";

// entities/user/index.server.ts — server components + server-only code
export { UserProfileCard } from "./ui/UserProfileCard";
export { fetchUser } from "./api/user-queries.server";
```

```typescript
// Consumers import from the appropriate entry point:

// In a Server Component (pages/profile/ui/ProfilePage.tsx)
import { UserProfileCard } from "@/entities/user/index.server";
import type { User } from "@/entities/user";

// In a Client Component (features/comment/ui/CommentAuthor.tsx)
import { UserAvatar } from "@/entities/user/index.client";
```

**Rules for split public APIs:**

1. **`index.ts`** — Export only types, constants, and pure functions that work
   in both environments. This is the default import path.
2. **`index.client.ts`** — Export components that use `'use client'`, hooks,
   or browser APIs.
3. **`index.server.ts`** — Export Server Components, server-only data fetching
   functions, and code that uses server-only APIs.
4. **The `index.[env].ts` pattern is permissible in general** — not just for
   RSC. Any meta-framework that has distinct runtime environments can use this
   pattern (e.g., `index.edge.ts` for edge runtime code). Verified for Next.js
   App Router. Nuxt and Astro compatibility is under review and may require
   adjustments
5. Steiger support for multiple entry points is available or coming in an
   upcoming release. If Steiger flags `index.client.ts` / `index.server.ts`,
   check for version updates.

**When NOT to split:**

- If a slice has no client/server boundary concerns (e.g., pure model logic),
  a single `index.ts` is sufficient.
- Do not pre-emptively split all slices — split only when you actually have
  both client and server exports in the same slice.

---

## Nuxt 3

### Directory structure

```text
my-nuxt-project/
  pages/                   ← Nuxt file-based routing
    index.vue              ← Route entry — imports from FSD pages layer
    profile.vue
  src/
    app/                   ← FSD app layer
      providers/
    pages/                 ← FSD pages layer
      home/
        ui/HomePage.vue
        index.ts
      profile/
        ui/ProfilePage.vue
        model/profile.ts
        index.ts
    shared/                ← FSD shared layer
      ui/
      lib/
      api/
```

### Wiring Nuxt routes to FSD pages

```vue
<!-- pages/index.vue — thin route entry -->
<template>
  <HomePage />
</template>
<script setup>
import { HomePage } from "@/pages/home";
</script>

<!-- pages/profile.vue -->
<template>
  <ProfilePage />
</template>
<script setup>
import { ProfilePage } from "@/pages/profile";
</script>
```

### Path aliases (nuxt.config.ts)

```typescript
// nuxt.config.ts
import { resolve } from "path";

export default defineNuxtConfig({
  alias: {
    "@/app": resolve(__dirname, "src/app"),
    "@/pages": resolve(__dirname, "src/pages"),
    "@/widgets": resolve(__dirname, "src/widgets"),
    "@/features": resolve(__dirname, "src/features"),
    "@/entities": resolve(__dirname, "src/entities"),
    "@/shared": resolve(__dirname, "src/shared"),
  },
});
```

---

## Vite + React

### Directory structure

```text
my-vite-project/
  src/
    app/                   ← FSD app layer
      providers/
      router.tsx
      styles/
      main.tsx             ← Entry point
    pages/
    shared/
  index.html
  vite.config.ts
  tsconfig.json
```

### Path aliases (vite.config.ts + tsconfig.json)

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@/app": resolve(__dirname, "src/app"),
      "@/pages": resolve(__dirname, "src/pages"),
      "@/widgets": resolve(__dirname, "src/widgets"),
      "@/features": resolve(__dirname, "src/features"),
      "@/entities": resolve(__dirname, "src/entities"),
      "@/shared": resolve(__dirname, "src/shared"),
    },
  },
});
```

Also configure `tsconfig.json` paths (same as Next.js example above) for
TypeScript IDE support.

---

## Create React App (CRA)

CRA does not natively support path aliases without ejecting. Options:

1. **Use `craco`** to override webpack config:

   ```javascript
   // craco.config.js
   const path = require("path");
   module.exports = {
     webpack: {
       alias: {
         "@/app": path.resolve(__dirname, "src/app"),
         "@/pages": path.resolve(__dirname, "src/pages"),
         "@/widgets": path.resolve(__dirname, "src/widgets"),
         "@/features": path.resolve(__dirname, "src/features"),
         "@/entities": path.resolve(__dirname, "src/entities"),
         "@/shared": path.resolve(__dirname, "src/shared"),
       },
     },
   };
   ```

2. **Migrate to Vite** — recommended for new projects. CRA is no longer
   actively maintained.

---

## Key Reminders for All Frameworks

1. **FSD lives in `src/`** — framework directories (`app/`, `pages/`) at the
   project root are the framework's own routing layer, not FSD layers.
2. **Framework route files are thin wrappers** — they import and render FSD
   page components. Business logic stays in FSD pages.
3. **Path aliases are required** — without them, import paths become long and
   fragile. Configure both the bundler and `tsconfig.json`.
4. **Pages First still applies** — regardless of framework, start with code
   in FSD `pages/` and extract only when needed.
