# Cross-Import Resolution Patterns

Detailed strategies and code examples for resolving cross-imports between
slices on the same layer. Includes the @x pattern and guidance on avoiding
excessive entity coupling.

---

## The Problem

Cross-imports occur when two slices on the same layer need to reference each
other's code. This violates FSD's core import rule. The resolution strategies
below must be tried **in order** — always attempt earlier strategies first.

---

## Strategy 1: Merge Slices

If two slices always change together, they likely represent a single concept
and should be merged.

**Indicators for merging:**

- Changes to one slice almost always require changes to the other
- The two slices share most of their dependencies
- Developers frequently confuse which slice owns which responsibility

```text
// Before: two features that always change together
features/send-message/
  ui/MessageInput.tsx
  model/message-draft.ts
features/message-list/
  ui/MessageList.tsx
  model/messages.ts

// After: one cohesive feature
features/messaging/
  ui/
    MessageInput.tsx
    MessageList.tsx
  model/
    message-draft.ts
    messages.ts
  index.ts
```

**When to use:** The two slices have overlapping responsibilities and always
evolve together.

**When NOT to use:** The slices are genuinely independent concepts that happen
to share a small piece of logic.

---

## Strategy 2: Extract Shared Logic to Entities

When multiple features or widgets share the same domain logic, extract that
logic to the entities layer. Keep UI and interaction-specific code in the
higher layer.

```text
// Before: two features duplicate order logic
features/order-create/
  model/order.ts        ← Order types + validation (duplicated)
  ui/OrderForm.tsx
features/order-history/
  model/order.ts        ← Order types + formatting (duplicated)
  ui/OrderList.tsx

// After: shared domain logic in entities, UI stays in features
entities/order/
  model/
    order.ts            ← Shared types + domain logic
  index.ts              ← Public API

features/order-create/
  ui/
    OrderForm.tsx       ← UI remains in feature
  model/
    order-form.ts       ← Feature-specific form logic
  index.ts
features/order-history/
  ui/
    OrderList.tsx       ← UI remains in feature
  model/
    order-display.ts    ← Feature-specific display logic
  index.ts
```

**Key principle:** Extract only the genuinely shared domain logic (types,
validation rules, business calculations). Feature-specific UI, state
management, and API calls stay in the feature.

---

## Strategy 3: Compose in a Higher Layer (Inversion of Control)

Use inversion of control — the parent layer (pages or app) imports both slices
and connects them. The slices never reference each other directly.

### React: Render Props / Children

```typescript
// Problem: features/comment-list wants to show user avatars from
// features/user-profile — but same-layer import is forbidden.

// Solution: pages/post composes both and passes data down.

// pages/post/ui/PostPage.tsx
import { CommentList } from '@/features/comments';
import { UserAvatar } from '@/entities/user';

const PostPage = ({ post }) => (
  <CommentList
    comments={post.comments}
    renderAuthor={(userId) => <UserAvatar userId={userId} />}
  />
);
```

### Vue: Named Slots

```vue
<!-- pages/post/ui/PostPage.vue -->
<template>
  <CommentList :comments="post.comments">
    <template #author="{ userId }">
      <UserAvatar :userId="userId" />
    </template>
  </CommentList>
</template>
```

### Any Framework: Dependency Injection

```typescript
// features/notifications/model/notifications.ts
// Instead of importing from features/user directly, accept a callback:
interface NotificationDeps {
  getUserName: (userId: string) => string;
}

export const createNotificationService = (deps: NotificationDeps) => ({
  formatNotification: (notification) =>
    `${deps.getUserName(notification.userId)}: ${notification.message}`,
});

// pages/dashboard/model/setup.ts — wire dependencies here
import { createNotificationService } from "@/features/notifications";
import { getUserName } from "@/entities/user";

export const notificationService = createNotificationService({ getUserName });
```

**When to use:** The slices are genuinely independent concepts, and the
connection between them is a composition concern, not a shared domain concern.

---

## Strategy 4: @x Notation (Last Resort)

When none of the above strategies apply, use `@x` to create explicit,
controlled cross-imports **between entities only**.

### How @x works

Each entity can expose a special `@x/` directory that contains files named
after the consuming entity. This makes the cross-import explicit and auditable.

```text
entities/
  user/
    @x/
      order.ts          ← Exposed specifically for the order entity
    model/
      user.ts
    index.ts
  order/
    model/
      order-summary.ts  ← Imports from user/@x/order
    index.ts
```

```typescript
// entities/user/@x/order.ts — exposes only what order needs
export { getUserDisplayName } from "../model/user";

// entities/order/model/order-summary.ts
import { getUserDisplayName } from "@/entities/user/@x/order";

export const formatOrderSummary = (order, userId) => {
  const name = getUserDisplayName(userId);
  return `${name}'s order #${order.id}`;
};
```

### @x Rules

1. **Document why @x is needed** and why other strategies do not apply.
2. **Review periodically** — requirements change and @x may become unnecessary.
3. **@x creates coupling between entities.** Overuse increases refactoring
   cost. Minimize the surface area of @x exports.
4. **Only use @x between entities.** Features, widgets, and pages should use
   Strategy 3 (composition) instead.
5. **Regular cross-imports (without @x) remain forbidden.** @x is the only
   sanctioned way to cross-import between entities.

---

## Excessive Entities — A Common Root Cause

Many cross-import problems originate from creating too many entities too early.
When entities are prematurely extracted, they often need to reference each
other, leading to cascading @x dependencies.

### Signs of excessive entities

- Multiple entities with @x dependencies on each other
- Entities that are only used by one page or feature
- Entity slices that are very thin (just a type + re-export)
- Frequent need to update multiple entities for a single feature change

### Resolution

1. **Audit entity usage.** Identify entities used in only one place.
2. **Move single-use entities back to their consuming page or feature.**
   Use Steiger's `insignificant-slice` rule to detect these.
3. **Merge closely related entities.** If `order` and `order-item` always
   change together, merge them into one `order` entity.
4. **Keep types in `shared/api/` instead of creating entities.** If all you
   need is a TypeScript interface for API responses, `shared/api/` is
   sufficient. An entity is warranted only when there is reusable domain
   logic attached to the data.

### Before and After

```text
// Before: excessive entities with @x dependencies
entities/user/
  @x/order.ts
  @x/notification.ts
entities/order/
  @x/user.ts           ← Circular @x!
entities/notification/
  model/notification.ts ← Used only in pages/dashboard

// After: simplified
entities/user/
  model/user.ts         ← Kept because genuinely reused
entities/order/
  model/order.ts        ← Kept, no longer needs @x
pages/dashboard/
  model/notification.ts ← Moved back — single use
shared/api/
  types.ts              ← Shared API response types
```

---

## Decision Flowchart

When you encounter a cross-import need:

```text
Two slices on the same layer need to share code
  │
  ├─ Do they always change together?
  │   └─ YES → Strategy 1: Merge slices
  │
  ├─ Is the shared part domain logic (types, validation, business rules)?
  │   └─ YES → Strategy 2: Extract to entities
  │
  ├─ Is the connection a composition concern (UI assembly, data wiring)?
  │   └─ YES → Strategy 3: Compose in higher layer (IoC)
  │
  └─ None of the above apply, and both are entities?
      └─ YES → Strategy 4: @x notation
      └─ NO  → Reconsider your slice boundaries. The need for cross-import
               often signals that the slices are not properly decomposed.
```
