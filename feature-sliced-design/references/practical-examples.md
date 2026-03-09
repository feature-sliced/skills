# Practical Examples

Concrete code patterns for common scenarios within FSD structure. Covers
authentication, type definitions, API request handling, and state management
integration.

---

## Authentication Patterns

Auth is one of the most common sources of confusion in FSD. The key question
is: what goes in `shared/` vs. what goes in `features/` or `pages/`?

### Auth data → shared/auth or shared/api

Tokens, session state, and login utilities are **infrastructure**, not
business logic. Keep them in shared:

```typescript
// shared/auth/token.ts
const TOKEN_KEY = "auth_token";

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);

export const setToken = (token: string): void =>
  localStorage.setItem(TOKEN_KEY, token);

export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);

// shared/auth/session.ts
export interface Session {
  userId: string;
  email: string;
  role: "admin" | "user";
}

export const useSession = (): Session | null => {
  // Implementation depends on your auth provider
  // (React Context, Zustand, etc.)
};

// shared/auth/index.ts
export { getToken, setToken, clearToken } from "./token";
export { useSession, type Session } from "./session";
```

### Auth UI → pages (single use) or features (multi-use)

```text
// If login form is only used on the login page:
pages/login/
  ui/LoginPage.tsx
  ui/LoginForm.tsx
  model/login.ts          ← Form state, validation
  api/login.ts            ← POST /auth/login
  index.ts

// If login form is reused (e.g., modal login + dedicated login page):
features/auth/
  ui/LoginForm.tsx
  ui/RegisterForm.tsx
  model/auth.ts
  api/login.ts
  api/register.ts
  index.ts
```

### Do NOT create a `user` entity just for auth

Auth-context data (tokens, login DTOs, session info) is rarely reused outside
authentication flows. A `user` entity is only needed when user profile data
is genuinely consumed by 2+ pages/features for **non-auth purposes** (e.g.,
displaying user avatars in comments, showing user names in posts).

```text
// ❌ Premature entity
entities/user/
  model/user.ts         ← Just wraps the login response

// ✅ Keep auth data in shared, create entity only when needed
shared/auth/session.ts  ← Session with userId, email, role
// Later, if user profiles are genuinely reused:
entities/user/
  model/user.ts         ← Profile data (displayName, avatar, bio)
```

---

## Type Definition Patterns

### Where to define types

The location of type definitions follows the same rules as any other code:

| Type scope                                        | Location                                                     |
| ------------------------------------------------- | ------------------------------------------------------------ |
| API response/request shapes shared across the app | `shared/api/types.ts` or domain-named files in `shared/api/` |
| Types for a specific entity's domain model        | `entities/[name]/model/[name].ts`                            |
| Types used only within one page                   | `pages/[name]/model/[name].ts`                               |
| Types used only within one feature                | `features/[name]/model/[name].ts`                            |
| Generic utility types (e.g., `Nullable<T>`)       | `shared/lib/types.ts`                                        |

### Example: API types in shared

```typescript
// shared/api/product.ts — API response shapes
export interface ProductDTO {
  id: string;
  name: string;
  price: number;
  category: string;
  createdAt: string;
}

export interface ProductListResponse {
  items: ProductDTO[];
  total: number;
  page: number;
}
```

### Example: Domain types in entities

```typescript
// entities/product/model/product.ts — domain model with logic
import type { ProductDTO } from "@/shared/api/product";

export interface Product {
  id: string;
  name: string;
  price: number;
  formattedPrice: string;
  isOnSale: boolean;
}

export const fromDTO = (dto: ProductDTO): Product => ({
  id: dto.id,
  name: dto.name,
  price: dto.price,
  formattedPrice: `$${dto.price.toFixed(2)}`,
  isOnSale: dto.price < 10,
});
```

**Key principle:** Raw API shapes go in `shared/api/`. Domain models with
business logic go in `entities/`. If you only need the raw shape and have no
business logic, `shared/api/` alone is sufficient — do not create an entity
just for types.

---

## API Request Handling Patterns

### Basic pattern: API calls in the consuming slice

```typescript
// pages/product-detail/api/fetch-product.ts
import { apiClient } from "@/shared/api/client";
import type { ProductDTO } from "@/shared/api/product";

export const fetchProduct = async (id: string): Promise<ProductDTO> => {
  const response = await apiClient.get(`/products/${id}`);
  return response.data;
};
```

### Shared API client setup

```typescript
// shared/api/client.ts
import axios from "axios";
import { getToken } from "@/shared/auth/token";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

### CRUD helpers in shared

```typescript
// shared/api/crud.ts
import { apiClient } from "./client";

export const createCrudApi = <T>(resource: string) => ({
  getAll: () => apiClient.get<T[]>(`/${resource}`).then((r) => r.data),
  getById: (id: string) =>
    apiClient.get<T>(`/${resource}/${id}`).then((r) => r.data),
  create: (data: Partial<T>) =>
    apiClient.post<T>(`/${resource}`, data).then((r) => r.data),
  update: (id: string, data: Partial<T>) =>
    apiClient.put<T>(`/${resource}/${id}`, data).then((r) => r.data),
  remove: (id: string) => apiClient.delete(`/${resource}/${id}`),
});

// Usage in pages or features:
// pages/products/api/products-api.ts
import { createCrudApi } from "@/shared/api/crud";
import type { ProductDTO } from "@/shared/api/product";

export const productsApi = createCrudApi<ProductDTO>("products");
```

---

## State Management: Redux

### Redux slice inside a feature

```typescript
// features/todo-list/model/todo.ts
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { apiClient } from "@/shared/api/client";

interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

interface TodoState {
  items: Todo[];
  loading: boolean;
}

export const fetchTodos = createAsyncThunk("todos/fetch", async () => {
  const response = await apiClient.get<Todo[]>("/todos");
  return response.data;
});

const todoSlice = createSlice({
  name: "todos",
  initialState: { items: [], loading: false } as TodoState,
  reducers: {
    toggleTodo: (state, action) => {
      const todo = state.items.find((t) => t.id === action.payload);
      if (todo) todo.completed = !todo.completed;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTodos.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchTodos.fulfilled, (state, action) => {
        state.items = action.payload;
        state.loading = false;
      });
  },
});

export const { toggleTodo } = todoSlice.actions;
export const selectTodos = (state: RootState) => state.todos.items;
export default todoSlice.reducer;
```

**Key:** The entire Redux slice (reducer + selectors + thunks) lives in a
single domain-named file, not split across `reducers.ts`, `selectors.ts`,
`thunks.ts`.

### Registering slices in app

```typescript
// app/providers/store.ts
import { configureStore } from "@reduxjs/toolkit";
import todoReducer from "@/features/todo-list/model/todo";
import userReducer from "@/entities/user/model/user";

export const store = configureStore({
  reducer: {
    todos: todoReducer,
    user: userReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
```

---

## State Management: React Query

### Query hooks inside a slice

```typescript
// entities/user/api/user-queries.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/api/client";
import type { User } from "../model/user";

export const useUser = (userId: string) =>
  useQuery({
    queryKey: ["user", userId],
    queryFn: () => apiClient.get<User>(`/users/${userId}`).then((r) => r.data),
  });

export const useUpdateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; updates: Partial<User> }) =>
      apiClient.put(`/users/${data.id}`, data.updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["user", variables.id] });
    },
  });
};

// entities/user/index.ts
export { useUser, useUpdateUser } from "./api/user-queries";
export { type User } from "./model/user";
```

### Page-specific queries (not extracted)

```typescript
// pages/dashboard/api/dashboard-queries.ts
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/shared/api/client";

interface DashboardStats {
  totalUsers: number;
  revenue: number;
  activeOrders: number;
}

export const useDashboardStats = () =>
  useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: () =>
      apiClient.get<DashboardStats>("/dashboard/stats").then((r) => r.data),
    staleTime: 30_000,
  });
```

**Key principle:** Place React Query hooks in the slice that owns the domain.
If the query is page-specific, keep it in the page. If the data is shared
across multiple pages, place hooks in the entity.
