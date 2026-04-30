# Frontend Architecture

## Strategy

**Keep the UI components, rebuild the data layer.** The React component tree (atoms → molecules → templates) is well-structured. The data fetching layer (axios, case conversion interceptors, CSRF tokens, manual query hooks) is what needs replacing.

---

## Component Architecture

```
┌──────────────────────────────────────────────┐
│  templates/                                   │
│  Layout, Footer, Navbar, Sidebar              │
├──────────────────────────────────────────────┤
│  features/                                    │
│  Feature-specific composed views              │
│  media/MediaDetail, discover/DiscoverFeed    │
├──────────────────────────────────────────────┤
│  molecules/                                   │
│  Composed components with data dependencies   │
│  MediaGrid, PersonCard, SearchResults         │
├──────────────────────────────────────────────┤
│  atoms/                                       │
│  Pure presentational components               │
│  Button, Card, Badge, Input, Skeleton         │
└──────────────────────────────────────────────┘
```

### What Stays (No Changes)

```
src/components/atoms/     → Button, Card, Badge, Input, Select, Skeleton, Avatar
src/components/molecules/ → MediaGrid, PersonCard, CollectionCard, SearchResult
src/components/templates/ → Layout, Footer, Navbar, Sidebar, PageHeader
```

### What Gets Updated (Data Layer Swap)

```
src/features/media/       → New query hooks, same UI
src/features/discover/    → New query hooks, same filters
src/features/auth/        → New auth flow, same forms
src/features/search/      → New query hooks, same input
src/features/sync/        → New SSE stream, same status display
```

---

## Data Layer

### Before → After

| Concern | Before | After |
|---|---|---|
| HTTP client | axios instance with interceptors | `@otix/api-client` (generated) |
| Case conversion | snake_case ↔ camelCase interceptor | Handled by generated client |
| Auth header | CSRF token in cookie + session | `Authorization: Bearer <jwt>` |
| Query hooks | Custom `useQuery` wrappers | TanStack Query `queryOptions` with typed client |
| Cache keys | Ad-hoc string arrays | Structured query key factory |
| Optimistic updates | Manual cache manipulation | `queryClient.setQueryData` with typed data |
| Real-time | Django Channels WebSocket | EventSource (SSE) |

### Generated API Client Usage

```typescript
// packages/@otix/api-client/src/index.ts (generated)
import createClient from "openapi-fetch";
import type { paths } from "./openapi-types";

export const api = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL,
});

// In a feature module:
import { api } from "@otix/api-client";

// Fully type-safe — mediaType, mediaId, and response are all typed
const { data, error } = await api.GET("/media/{media_type}/{media_id}", {
  params: {
    path: { media_type: "movie", media_id: "550" },
  },
});
// data is typed as MediaDetailResponse | undefined
// error is typed as ErrorResponse | undefined
```

### Query Hooks Pattern

```typescript
// src/features/media/queries.ts
import { queryOptions } from "@tanstack/react-query";
import { api } from "@otix/api-client";

export const mediaQueries = {
  detail: (type: string, id: string) =>
    queryOptions({
      queryKey: ["media", type, id],
      queryFn: () =>
        api.GET("/media/{media_type}/{media_id}", {
          params: { path: { media_type: type, media_id: id } },
        }),
      staleTime: 5 * 60 * 1000, // 5 min
    }),

  list: (type: string, filters: MediaFilters) =>
    queryOptions({
      queryKey: ["media", type, "list", filters],
      queryFn: () =>
        api.GET("/media/{type}", {
          params: { path: { type }, query: filters },
        }),
      staleTime: 2 * 60 * 1000,
    }),

  credits: (type: string, id: string) =>
    queryOptions({
      queryKey: ["media", type, id, "credits"],
      queryFn: () =>
        api.GET("/media/{media_type}/{media_id}/credits", {
          params: { path: { media_type: type, media_id: id } },
        }),
    }),
};
```

---

## Auth Flow

### Token Storage

```typescript
// src/lib/auth.ts
let accessToken: string | null = null;

export function setAccessToken(token: string) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;
}
```

The refresh token is never accessible to JavaScript — it's an HTTP-only cookie set by the server.

### Client Initialization

```typescript
// src/lib/api-client.ts
import createClient from "openapi-fetch";
import type { paths } from "@otix/api-client";
import { getAccessToken, setAccessToken, clearAccessToken } from "./auth";

export const api = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL,
  headers: {
    get Authorization() {
      const token = getAccessToken();
      return token ? `Bearer ${token}` : undefined;
    },
  },
});

// Response interceptor for silent refresh
api.use({
  async onResponse({ response }) {
    if (response.status === 401) {
      const refreshResponse = await fetch(
        `${import.meta.env.VITE_API_URL}/auth/refresh`,
        { method: "POST", credentials: "include" }
      );
      if (refreshResponse.ok) {
        const { access_token } = await refreshResponse.json();
        setAccessToken(access_token);
        // Retry the original request — openapi-fetch handles this
        return response.clone();
      }
      clearAccessToken();
      window.location.href = "/auth/login";
    }
    return response;
  },
});
```

### Login Component

```typescript
// src/features/auth/login.tsx
async function handleLogin(email: string, password: string) {
  const { data, error } = await api.POST("/auth/login", {
    body: { email, password },
    credentials: "include", // Required for refresh cookie
  });

  if (error) {
    return { success: false, message: error.detail };
  }

  setAccessToken(data.access_token);
  return { success: true };
}

// Refresh cookie is set automatically by the browser
// because the server responds with Set-Cookie
```

---

## Routing

TanStack Router structure stays the same. Only the data loading inside route loaders changes:

```typescript
// src/routes/media.tsx
import { createFileRoute } from "@tanstack/react-router";
import { mediaQueries } from "@/features/media/queries";

export const Route = createFileRoute("/media/$type/$id")({
  loader: ({ params, context: { queryClient } }) =>
    queryClient.ensureQueryData(mediaQueries.detail(params.type, params.id)),
  component: MediaDetailPage,
});
```

---

## Discover Persistence

Lightweight IndexedDB caching for discover queries so the page feels instant on repeat visits:

```typescript
// src/lib/persistence.ts
import { openDB } from "idb";

const db = openDB("otix-discover", 1, {
  upgrade(db) {
    db.createObjectStore("queries", { keyPath: "queryKey" });
  },
});

export async function cacheDiscoverResult(queryKey: string, data: unknown) {
  const store = (await db).transaction("queries", "readwrite").objectStore("queries");
  await store.put({ queryKey, data, cachedAt: Date.now() });
}

export async function getCachedDiscoverResult(queryKey: string) {
  const store = (await db).transaction("queries", "readonly").objectStore("queries");
  const cached = await store.get(queryKey);
  if (!cached || Date.now() - cached.cachedAt > 30 * 60 * 1000) return null;
  return cached.data;
}
```

Used as `placeholderData` in TanStack Query so the UI renders instantly with stale data while fresh data loads.

---

## Real-Time Sync Status (SSE)

```typescript
// src/features/sync/useSyncStream.ts
export function useSyncStream() {
  const [jobs, setJobs] = useState<SyncJob[]>([]);

  useEffect(() => {
    const source = new EventSource(
      `${import.meta.env.VITE_API_URL}/sync/stream`
    );

    source.addEventListener("job_update", (event) => {
      const job = JSON.parse(event.data);
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === job.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = job;
          return next;
        }
        return [...prev, job];
      });
    });

    return () => source.close();
  }, []);

  return jobs;
}
```

---

## Provider Component Flattening

Before (8 levels deep):
```
MediaDetail → MediaProvider → TMDBProvider → MovieDetail → MovieCast
  → CastProvider → PersonProvider → PersonCard
```

After (5 levels max):
```
MediaDetail → MediaCasts (fetches + renders) → PersonCard
MediaDetail → MediaCollections (fetches + renders) → CollectionCard
MediaDetail → MediaSeasons (fetches + renders) → EpisodeList
```

The fetcher and renderer are in the same component. No separate "provider" wrapper components that only pass data.
