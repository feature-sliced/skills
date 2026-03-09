# Layer Structure Reference

Detailed folder structures, code examples, and naming conventions for each
FSD layer. Use this reference when creating, reviewing, or reorganizing
project structure.

---

## App Layer

App-wide initialization: providers, routing, global styles, entry point.
Organized by segments only — no slices.

```text
app/
  providers/       ← Redux, React Query, Theme providers
  styles/          ← Global CSS, reset, theme variables
  router.tsx       ← Route configuration
  index.tsx        ← Entry point
```

```typescript
// app/router.tsx
import { HomePage } from '@/pages/home';
import { ProfilePage } from '@/pages/profile';

export const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/profile/:id', element: <ProfilePage /> },
]);
```

**Belongs in app:** Global providers (Redux store, QueryClient, theme),
routing setup, global styles, error boundaries, analytics initialization.

**Does not belong:** Feature-specific code, business logic, page-level UI.

---

## Pages Layer

Route-level composition. In v2.1, pages **own substantial logic** — they are
not thin wrappers. In early project stages, most code lives here.

```text
pages/
  home/
    ui/
      HomePage.tsx
      HeroSection.tsx
      FeaturesGrid.tsx
    model/
      home-data.ts          ← Page-specific state + logic
    api/
      fetch-home-data.ts    ← Page-specific API calls
    index.ts
  profile/
    ui/
      ProfilePage.tsx
      ProfileForm.tsx
      ProfileStats.tsx
    model/
      profile.ts            ← Profile state + validation logic
    api/
      update-profile.ts
      fetch-profile.ts
    index.ts
```

**Belongs in pages:** Page-specific UI, forms, validation, data fetching,
state management, business logic, API integrations. Even code that looks
reusable stays here if it is simpler to keep local.

**Does not belong:** Code that is genuinely reused in 2+ pages (extract only
when the team agrees).

### Page Layout Patterns

A typical page composes widgets, features, and entities from lower layers,
plus its own local UI components:

```typescript
// pages/product-detail/ui/ProductDetailPage.tsx
import { Header } from '@/widgets/header';
import { AddToCart } from '@/features/add-to-cart';
import { Product } from '@/entities/product';

export const ProductDetailPage = ({ productId }) => {
  const product = useProductDetail(productId); // local hook in this page

  return (
    <>
      <Header />
      <Product.Card data={product} />
      <AddToCart productId={productId} />
      <RelatedProducts products={product.related} /> {/* local component */}
    </>
  );
};
```

For pages that only need shared + page-local code (no extracted layers):

```typescript
// pages/about/ui/AboutPage.tsx
import { Card } from '@/shared/ui/Card';
import { TeamSection } from './TeamSection';  // local to this page
import { MissionStatement } from './MissionStatement';

export const AboutPage = () => (
  <main>
    <MissionStatement />
    <Card><TeamSection /></Card>
  </main>
);
```

---

## Widgets Layer

Composite UI blocks with their own logic, **reused across multiple pages**.
Add this layer only when UI blocks actually appear in 2+ pages and sharing
provides clear value.

```text
widgets/
  header/
    ui/
      Header.tsx
      Navigation.tsx
      UserMenu.tsx
    model/
      header.ts              ← Widget state
    api/
      fetch-notifications.ts
    index.ts
  sidebar/
    ui/
      Sidebar.tsx
    model/
      sidebar.ts
    index.ts
```

**Belongs in widgets:** Navigation bars, sidebars, dashboards, footers,
complex card layouts that combine data from multiple entities/features.

**Does not belong:** Simple UI primitives (→ `shared/ui/`), single-use
page sections (→ keep in the page).

---

## Features Layer

Independent, reusable user interactions. **Create only when used in 2+ places.**

```text
features/
  auth/
    ui/
      LoginForm.tsx
      RegisterForm.tsx
    model/
      auth.ts               ← Auth state + logic
    api/
      login.ts
      register.ts
    index.ts
  add-to-cart/
    ui/
      AddToCartButton.tsx
    model/
      cart.ts
    index.ts
  like-post/
    ui/
      LikeButton.tsx
    model/
      like.ts
    api/
      toggle-like.ts
    index.ts
```

**Feature composition** — features consume entities and are composed in
higher layers:

```typescript
// widgets/post-card/ui/PostCard.tsx
import { UserAvatar } from '@/entities/user';
import { LikeButton } from '@/features/like-post';
import { CommentButton } from '@/features/comment-create';

export const PostCard = ({ post }) => (
  <article>
    <UserAvatar userId={post.authorId} />
    <h2>{post.title}</h2>
    <p>{post.content}</p>
    <div>
      <LikeButton postId={post.id} />
      <CommentButton postId={post.id} />
    </div>
  </article>
);
```

---

## Entities Layer

Reusable business domain models. **Create only when used in 2+ places. Starting
without this layer is completely valid.**

```text
// Minimal entity — model only (most common form)
entities/user/
  model/
    user.ts                  ← Types + domain logic
  index.ts

// Entity with UI (use with caution)
// ⚠️ Adding UI to entities increases cross-import risk.
// Other entities may want to import this UI, leading to @x dependencies.
// Entity UI should only be imported from higher layers (features, widgets,
// pages) — never from other entities.
entities/product/
  model/
    product.ts
  ui/
    ProductCard.tsx
  index.ts
```

---

## Shared Layer Structure

Infrastructure with no business logic. Organized by segments only (no slices).
Segments may import from each other.

```text
shared/
  ui/                ← UI kit: Button, Input, Modal, Card
  lib/               ← Utilities: formatDate, debounce, classnames
  api/               ← API client, route constants, CRUD helpers, base types
  auth/              ← Auth tokens, login utilities, session management
  config/            ← Environment variables, app settings
  assets/            ← Images, fonts, icons (company branding allowed)
```

```typescript
// shared/ui/Button/Button.tsx
export const Button = ({ children, onClick, variant = 'primary' }) => (
  <button className={`btn btn-${variant}`} onClick={onClick}>
    {children}
  </button>
);

// shared/ui/Button/index.ts
export { Button } from './Button';
export type { ButtonProps } from './Button';
```

Shared **may** contain application-aware code (route constants, API endpoints,
branding assets, common types). It must **never** contain business logic,
feature-specific code, or entity-specific code.

---

## Segment Naming Conventions

### Domain-based naming

Always name files after the business domain, not the technical role:

```text
// ❌ Technical-role naming — mixes domains
model/types.ts          ← Which types? User? Order?
model/utils.ts
api/endpoints.ts
model/selectors.ts

// ✅ Domain-based naming — each file owns one domain
model/user.ts           ← User types + logic + store
model/order.ts          ← Order types + logic + store
api/fetch-profile.ts    ← Clear what this API does
model/todo.ts           ← Redux slice + selectors + thunks
```

### Single-concern segments

If a segment contains only one domain concern, the filename may match the
slice name:

```text
features/auth/
  model/
    auth.ts          ← Single concern, matches slice name
```

### Index files as public API

Every slice must have an `index.ts` that re-exports its public interface:

```typescript
// entities/user/index.ts
export { UserAvatar } from "./ui/UserAvatar";
export { useUser, type User } from "./model/user";
```

---

## Path Aliases

Configure path aliases so imports follow the `@/layer/slice` pattern:

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

For framework-specific alias configuration (Vite, Next.js, Nuxt), see
`references/framework-integration.md`.
