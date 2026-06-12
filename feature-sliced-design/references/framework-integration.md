# Framework Integration

How to set up FSD within specific frameworks. Covers directory placement,
routing integration, and framework-specific path alias configuration.

## General Principle

Place FSD layers inside `src/` to avoid naming conflicts with framework
directories. The FSD `app/` and `pages/` layers are **not** the same as
framework directories with the same names (e.g., Next.js `app/`).

All FSD projects follow the same `@/<layer>/*` path alias convention. The
exact configuration differs by framework. See each framework section
below. Astro is the one exception, using a single `@/*` alias instead.

## Next.js

FSD works with both the App Router and the Pages Router. Next.js uses the
`app/` and `pages/` folder names for its own routing. Those names collide with
the FSD `app/` and `pages/` layers. Rename the FSD layers to `_app/` and `_pages/`
(with the underscore prefix). Do this even if you only use one router. Keep the Next.js
routing folders at the project root so `src/` holds only FSD code. The FSD
linter (Steiger) expects this naming.

### Projects on the previously recommended pattern

An earlier version of this guide recommended a different layout. It kept the
Next.js `app`/`pages` folders at the root and added an empty root `pages/`
placeholder. The `src/app`/`src/pages` layers were not prefixed. Projects set
up that way keep working. The empty `pages/` placeholder can break the build on
Next.js 13.5 and later. That is why the prefix is now the default. Use
`_app`/`_pages` for new projects. Move a project off the old pattern when you
can.

### App Router

Route files in `app/` re-export from the FSD `_pages/` layer.

#### Directory structure

```text
my-nextjs-project/
  app/                     ← Next.js App Router (routing only)
    layout.tsx
    page.tsx
    profile/
      page.tsx
    api/
      get-example/
        route.ts
  src/
    _app/                  ← FSD app layer
      providers/
        index.tsx          ← All providers (QueryClient, theme, etc.)
      styles/
        globals.css
      api-routes/          ← Route Handler implementations (see below)
        index.ts
        get-example-data.ts
    _pages/                ← FSD pages layer
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
      db/                  ← Database queries (see below)
```

#### Wiring Next.js routes to FSD pages

```typescript
// app/layout.tsx
import { Providers } from '@/_app/providers';
import '@/_app/styles/globals.css';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}

// app/example/page.tsx: re-export the FSD page (component + metadata)
export { ExamplePage as default, metadata } from '@/_pages/example';
```

Always re-export both the component and `metadata`. Route files contain no logic.

### Pages Router

The Pages Router uses `pages/` at the project root.
Each route file should re-export the corresponding page module from the FSD `_pages/` layer.

```text
my-nextjs-project/
  pages/                   ← Next.js Pages Router (routing only)
    _app.tsx
    api/example.ts         ← API route re-export
    example/index.tsx
  src/
    _app/
      custom-app/          ← Custom App component
      api-routes/          ← Route Handler implementations
    _pages/
      example/
        ui/example.tsx
        index.ts
```

```typescript
// pages/example/index.tsx
export { Example as default } from '@/_pages/example';

// pages/_app.tsx: re-export the custom App from src/_app/custom-app
export { App as default } from '@/_app/custom-app';
```

The custom App component itself lives in `src/_app/custom-app/` and exports
`App` from its public API like any other FSD slice.

### Middleware and instrumentation

`middleware.js` and `instrumentation.js` must live at the **project root**,
next to the Next.js `app/` and `pages/` folders. Next.js will not detect
them inside `src/`.

### Route Handlers (API routes)

Use a dedicated `api-routes` segment in the FSD `_app/` layer
(`src/_app/api-routes/`) to host the actual request handlers. The Next.js
`app/api/*/route.ts` (App Router) or `pages/api/*.ts` (Pages Router) files
become thin re-exports.

**App Router:**

```typescript
// src/_app/api-routes/get-example-data.ts
import { getExamplesList } from '@/shared/db';

export const getExampleData = () => {
  try {
    const examplesList = getExamplesList();
    return Response.json({ examplesList });
  } catch {
    return Response.json(null, {
      status: 500,
      statusText: 'Ouch, something went wrong',
    });
  }
};

// src/_app/api-routes/index.ts
export { getExampleData } from './get-example-data';

// app/api/example/route.ts
export { getExampleData as GET } from '@/_app/api-routes';
```

**Pages Router:**

```typescript
// src/_app/api-routes/get-example-data.ts
import type { NextApiRequest, NextApiResponse } from 'next';

const config = { api: { bodyParser: { sizeLimit: '1mb' } }, maxDuration: 5 };
const handler = (req: NextApiRequest, res: NextApiResponse) =>
  res.status(200).json({ message: 'Hello from FSD' });

export const getExampleData = { config, handler } as const;

// app/api/example.ts
import { getExampleData } from '@/_app/api-routes';
export const config = getExampleData.config;
export default getExampleData.handler;
```

FSD is primarily a frontend methodology. If `api-routes` grows to many
endpoints, consider moving the backend to a separate package in a monorepo.

### Database access

Place database queries in a `db` segment in `shared/` (`src/shared/db/`).
Co-locate caching and revalidation logic with the queries themselves.

### Path aliases

```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/_app/*": ["src/_app/*"],
      "@/_pages/*": ["src/_pages/*"],
      "@/widgets/*": ["src/widgets/*"],
      "@/features/*": ["src/features/*"],
      "@/entities/*": ["src/entities/*"],
      "@/shared/*": ["src/shared/*"]
    }
  }
}
```

Next.js reads `tsconfig.json` paths automatically. No `next.config.js`
alias configuration is needed.

### Server and client public APIs

In the Next.js App Router, a single slice can contain both client-usable modules
and server-only modules.

Keep `index.ts` free of server-only exports, such as Server Components or
data-access functions that import `server-only`. When a Client Component imports
the slice, those exports can enter the client module graph and cause build
errors.

Split only when this boundary is required. Put server-only exports in
`index.server.ts`.

## Nuxt 3

### Directory structure

```text
my-nuxt-project/
  pages/                   ← Nuxt file-based routing
    index.vue              ← Route entry, imports from FSD pages layer
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
<!-- pages/index.vue: thin route entry -->
<template>
  <HomePage />
</template>
<script setup>
import { HomePage } from "@/pages/home";
</script>
```

### Path aliases

In addition to the standard `tsconfig.json` mapping, Nuxt requires explicit
runtime aliases in `nuxt.config.ts`:

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

### Path aliases

Mirror the standard `tsconfig.json` mapping in `vite.config.ts` so the
Vite resolver agrees with TypeScript:

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

## Create React App (CRA)

CRA is no longer actively maintained. **Migrate to Vite for new projects.**

If you must stay on CRA, path aliases require ejecting or using `craco` to
override the webpack config:

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

## Astro

Astro uses `src/pages/` for file-based routing, which collides with the FSD
`pages/` layer. Move the FSD pages layer to `src/_pages/` (with the
underscore prefix) and reserve `src/pages/` for Astro routes.

### Directory structure

```text
my-astro-project/
  src/
    pages/                 ← Astro routing (thin entry points)
      404.astro
      index.astro
    _pages/                ← FSD pages layer
      home/
        ui/HomePage.astro
        index.ts
    widgets/
    features/
    entities/
    shared/
```

### Wiring Astro routes to FSD pages

The Astro route file imports and renders the FSD page, nothing else:

```astro
// src/pages/index.astro
import { HomePage } from '@/_pages/home';
<HomePage />
```

### Path aliases (tsconfig.json)

Astro projects use a single `@/*` alias instead of one alias per layer. This
is the convention the FSD Astro guide recommends:

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Imports then reference the layer path directly: `@/_pages/home`,
`@/shared/ui`, `@/entities/user`.

### Working with integrations

Some Astro integrations (for example, Starlight) use content collections
that expect content in fixed folders such as `src/content/docs/`. If the
integration does not allow the path to be changed, leave it as-is. The
content folder lives alongside FSD layers without collision:

```text
src/
  _pages/                  ← FSD pages layer
  content/                 ← Integration content (Starlight, etc.)
    docs/
      getting-started.md
  shared/                  ← FSD shared layer
```

Let the integration handle its own routing and rendering, while FSD layers
manage application-specific code.

## Key Reminders for All Frameworks

1. **FSD lives in `src/`**: root-level `app/` and `pages/` belong to the
   framework's routing, not FSD.
2. **Framework route files are thin wrappers**: they import and render FSD
   page components. Business logic stays in FSD pages.
3. **Path aliases are required**: configure both the bundler and
   `tsconfig.json`.
4. **Pages First still applies**: regardless of framework, start with code
   in FSD `pages/` and extract only when needed.
