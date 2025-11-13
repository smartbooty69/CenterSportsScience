# Project Structure and Best Practices Guide

This document outlines the norms, best practices, and structural patterns used in this project that can be applied to other projects.

## Table of Contents
1. [Project Architecture](#project-architecture)
2. [Directory Structure](#directory-structure)
3. [Code Organization Patterns](#code-organization-patterns)
4. [TypeScript Configuration](#typescript-configuration)
5. [Styling Approach](#styling-approach)
6. [Component Patterns](#component-patterns)
7. [API Route Patterns](#api-route-patterns)
8. [Custom Hooks Pattern](#custom-hooks-pattern)
9. [Utility Functions](#utility-functions)
10. [Authentication Pattern](#authentication-pattern)
11. [Error Handling](#error-handling)
12. [Naming Conventions](#naming-conventions)
13. [File Organization](#file-organization)

---

## Project Architecture

### Framework Stack
- **Next.js 15** (App Router) with TypeScript
- **React 18** with Server Components
- **Sanity CMS** for content management
- **NextAuth.js v5** for authentication
- **Tailwind CSS** for styling
- **shadcn/ui** for UI components

### Key Architectural Decisions
1. **App Router**: Uses Next.js 15 App Router with route groups `(root)` for organization
2. **Server-First**: Leverages Server Components by default, using `'use client'` only when needed
3. **Type Safety**: Strict TypeScript configuration with path aliases
4. **Component Library**: shadcn/ui components with custom styling
5. **Monorepo Structure**: Clear separation of concerns with dedicated directories

---

## Directory Structure

```
project-root/
├── app/                      # Next.js App Router
│   ├── (root)/              # Route group for main pages
│   │   ├── page.tsx         # Home page
│   │   ├── layout.tsx       # Layout for route group
│   │   └── [feature]/       # Feature-based routes
│   ├── api/                 # API routes
│   │   └── [feature]/       # Feature-based API routes
│   │       └── route.ts     # Route handlers
│   ├── admin/               # Admin-only routes
│   ├── layout.tsx           # Root layout
│   ├── globals.css          # Global styles
│   └── fonts/               # Local font files
├── components/              # React components
│   ├── ui/                 # shadcn/ui components
│   ├── [Feature].tsx       # Feature components
│   └── Providers.tsx       # Context providers
├── lib/                    # Utility functions & services
│   ├── utils.ts            # General utilities
│   ├── [service].ts        # Service modules
│   └── validation.ts       # Validation functions
├── hooks/                  # Custom React hooks
│   └── use[Feature].ts     # Feature-specific hooks
├── sanity/                 # Sanity CMS configuration
├── public/                 # Static assets
├── scripts/                # Build/utility scripts
└── docs/                   # Documentation
```

### Key Patterns:
- **Route Groups**: Use parentheses `(root)` to organize routes without affecting URLs
- **Feature-Based Organization**: Group related files by feature/domain
- **Co-location**: Keep related files close together (e.g., `components/chat/` for chat components)

---

## Code Organization Patterns

### 1. Path Aliases
Configured in `tsconfig.json`:
```json
{
  "paths": {
    "@/*": ["./*"]
  }
}
```

Usage:
```typescript
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/useNotifications";
```

### 2. Server vs Client Components
- **Default**: Server Components (no directive needed)
- **Client Components**: Explicitly mark with `'use client'` at the top
- **Pattern**: Keep Server Components as default, extract interactive parts to Client Components

Example:
```typescript
// Server Component (default)
export default async function Page() {
  const data = await fetchData();
  return <ClientComponent data={data} />;
}

// Client Component
'use client';
export function ClientComponent({ data }) {
  const [state, setState] = useState();
  // Interactive logic
}
```

### 3. Providers Pattern
Centralize all context providers in a single component:

```typescript
// components/Providers.tsx
"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "./ThemeProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        {children}
      </ThemeProvider>
    </SessionProvider>
  );
}
```

Used in root layout:
```typescript
// app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
```

---

## TypeScript Configuration

### Strict Configuration
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2017",
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

### Type Definitions
- Use TypeScript interfaces for component props
- Export types from components when reused
- Use Sanity type generation for CMS types

Example:
```typescript
// components/StartupCard.tsx
export type StartupTypeCard = Omit<Startup, "author"> & { author?: Author };

interface StartupCardProps {
  post: StartupTypeCard;
  isLoggedIn?: boolean;
  userId?: string;
}
```

---

## Styling Approach

### 1. Tailwind CSS with Custom Utilities
- Use Tailwind utility classes primarily
- Create custom utility classes in `globals.css` for repeated patterns
- Use CSS variables for theming

### 2. Custom Utility Classes
Defined in `globals.css`:
```css
@layer utilities {
  .text-30-semibold {
    @apply font-semibold text-[30px] text-black;
  }
  
  .section_container {
    @apply px-6 py-10 max-w-7xl mx-auto;
  }
  
  .card_grid {
    @apply grid md:grid-cols-3 sm:grid-cols-2 gap-5;
  }
}
```

### 3. Component Styling Pattern
```typescript
import { cn } from "@/lib/utils";

export function Component({ className }: { className?: string }) {
  return (
    <div className={cn("base-classes", className)}>
      {/* content */}
    </div>
  );
}
```

### 4. Tailwind Configuration
- Custom colors defined in theme
- Custom breakpoints (e.g., `xs: "475px"`)
- Custom shadows and border radius
- Dark mode support via class strategy

---

## Component Patterns

### 1. Component Structure
```typescript
'use client'; // Only if needed

import { useState, useEffect } from 'react';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Type definitions
interface ComponentProps {
  prop1: string;
  prop2?: number;
}

// Component implementation
export default function Component({ prop1, prop2 }: ComponentProps) {
  // State
  const [state, setState] = useState();
  
  // Effects
  useEffect(() => {
    // Side effects
  }, []);
  
  // Handlers
  const handleClick = () => {
    // Handler logic
  };
  
  // Render
  return (
    <div className={cn("base-classes")}>
      {/* JSX */}
    </div>
  );
}
```

### 2. Component Composition
- Break down large components into smaller, reusable pieces
- Use compound components pattern for complex UI
- Extract logic into custom hooks

### 3. Props Pattern
- Use TypeScript interfaces for all props
- Provide default values where appropriate
- Use optional props with `?` for non-required props
- Destructure props in function signature

---

## API Route Patterns

### 1. Route Handler Structure
```typescript
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { client } from '@/sanity/lib/client';

export async function GET(req: Request) {
  try {
    // Extract query params
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    
    // Validate
    if (!id) {
      return NextResponse.json(
        { success: false, message: 'Missing id' },
        { status: 400 }
      );
    }
    
    // Fetch data
    const data = await client.fetch(query, { id });
    
    // Return response
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error in GET:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  // Authentication check
  const session = await auth();
  if (!session) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  try {
    // Parse body
    const body = await req.json();
    
    // Validate
    // Process
    // Return response
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in POST:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 2. Error Handling Pattern
- Always use try-catch blocks
- Return consistent error response format
- Log errors for debugging
- Don't expose internal errors to clients

### 3. Authentication Pattern
```typescript
const session = await auth();
if (!session) {
  return NextResponse.json(
    { success: false, message: 'Unauthorized' },
    { status: 401 }
  );
}
```

### 4. Response Format
Consistent response structure:
```typescript
// Success
{ success: true, data: {...} }

// Error
{ success: false, message: "Error message" }
```

---

## Custom Hooks Pattern

### 1. Hook Structure
```typescript
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

// Type definitions
export interface UseFeatureReturn {
  data: DataType[];
  loading: boolean;
  error: string | null;
  fetchData: () => Promise<void>;
  updateData: (id: string) => Promise<void>;
}

// Hook implementation
export function useFeature(): UseFeatureReturn {
  const { data: session } = useSession();
  const [data, setData] = useState<DataType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fetchData = useCallback(async () => {
    if (!session?.user?.id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/feature');
      const result = await response.json();
      
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.message || 'Failed to fetch');
      }
    } catch (err) {
      setError('Failed to fetch data');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);
  
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  return {
    data,
    loading,
    error,
    fetchData,
  };
}
```

### 2. Hook Naming
- Prefix with `use` (e.g., `useNotifications`, `useBadges`)
- Export return type interface
- Use `useCallback` for memoized functions
- Handle loading and error states

---

## Utility Functions

### 1. Utility File Structure
```typescript
// lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Class name utility
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Date formatting
export function formatDate(date: string) {
  const dateObj = new Date(date);
  const utcDate = new Date(Date.UTC(
    dateObj.getUTCFullYear(),
    dateObj.getUTCMonth(),
    dateObj.getUTCDate()
  ));
  
  return utcDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
}

// Server action response parser
export function parseServerActionResponse<T>(response: T) {
  return JSON.parse(JSON.stringify(response));
}
```

### 2. Service Modules
Organize related functionality in service files:
- `lib/ai-services.ts` - AI-related services
- `lib/email.ts` - Email functionality
- `lib/validation.ts` - Validation functions
- `lib/storage.ts` - File storage operations

---

## Authentication Pattern

### 1. NextAuth Configuration
```typescript
// auth.ts
import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  callbacks: {
    async signIn({ user, profile }) {
      // User creation/update logic
      return true;
    },
    async jwt({ token, profile }) {
      // JWT token customization
      return token;
    },
    async session({ session, token }) {
      // Session customization
      session.user.id = token.id;
      return session;
    },
  },
});
```

### 2. Using Auth in Components
```typescript
// Server Component
import { auth } from '@/auth';

export default async function Page() {
  const session = await auth();
  // Use session
}

// Client Component
'use client';
import { useSession } from 'next-auth/react';

export function Component() {
  const { data: session } = useSession();
  // Use session
}
```

### 3. Protected Routes
```typescript
// API Route
const session = await auth();
if (!session) {
  return NextResponse.json(
    { success: false, message: 'Unauthorized' },
    { status: 401 }
  );
}
```

---

## Error Handling

### 1. API Route Error Handling
```typescript
try {
  // Operation
} catch (error) {
  console.error('Error description:', error);
  return NextResponse.json(
    { success: false, message: 'User-friendly error message' },
    { status: 500 }
  );
}
```

### 2. Component Error Handling
```typescript
const [error, setError] = useState<string | null>(null);

try {
  // Operation
} catch (err) {
  setError('User-friendly error message');
  console.error('Error:', err);
}
```

### 3. Global Error Boundary
```typescript
// app/global-error.tsx
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <h2>Something went wrong!</h2>
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  );
}
```

---

## Naming Conventions

### Files and Directories
- **Components**: PascalCase (e.g., `StartupCard.tsx`, `UserProfile.tsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useNotifications.ts`, `useBadges.ts`)
- **Utilities**: camelCase (e.g., `utils.ts`, `validation.ts`)
- **API Routes**: lowercase with hyphens (e.g., `route.ts` in `/api/feature-name/`)
- **Pages**: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`

### Code
- **Components**: PascalCase
- **Functions**: camelCase
- **Constants**: UPPER_SNAKE_CASE
- **Types/Interfaces**: PascalCase
- **Props Interfaces**: `ComponentNameProps`

### CSS Classes
- Use Tailwind utility classes primarily
- Custom classes: kebab-case (e.g., `section_container`, `card_grid`)
- Component-specific: prefix with component name (e.g., `startup-card`, `startup-form`)

---

## File Organization

### 1. Feature-Based Organization
Group related files by feature:
```
components/
  chat/
    ChatView.tsx
    ChatModal.tsx
  messages/
    MessagesScreen.tsx
    MessagesSidebar.tsx
```

### 2. Co-location
Keep related files together:
- Component and its types in the same directory
- API routes grouped by feature
- Hooks grouped by domain

### 3. Import Organization
Order imports:
1. React/Next.js imports
2. Third-party libraries
3. Internal utilities
4. Components
5. Types
6. Styles

Example:
```typescript
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ComponentProps } from './types';
```

---

## Best Practices Summary

### 1. Type Safety
- ✅ Use TypeScript strictly
- ✅ Define interfaces for all props
- ✅ Use type inference where appropriate
- ✅ Export reusable types

### 2. Performance
- ✅ Use Server Components by default
- ✅ Minimize client-side JavaScript
- ✅ Use `useCallback` and `useMemo` appropriately
- ✅ Lazy load heavy components

### 3. Code Quality
- ✅ Consistent error handling
- ✅ Meaningful variable names
- ✅ Small, focused functions
- ✅ DRY (Don't Repeat Yourself)

### 4. User Experience
- ✅ Loading states
- ✅ Error states
- ✅ Optimistic updates where appropriate
- ✅ Accessible components

### 5. Security
- ✅ Server-side authentication checks
- ✅ Input validation
- ✅ Sanitize user input
- ✅ Use environment variables for secrets

### 6. Maintainability
- ✅ Clear file structure
- ✅ Comprehensive documentation
- ✅ Consistent patterns
- ✅ Separation of concerns

---

## Configuration Files

### package.json Scripts
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "predev": "npm run typegen",
    "prebuild": "npm run typegen",
    "typegen": "sanity schema extract --path=./sanity/extract.json && sanity typegen generate --schema-path=./sanity/extract.json"
  }
}
```

### next.config.ts
- TypeScript configuration
- Image optimization settings
- Experimental features
- Sentry integration

### tailwind.config.ts
- Custom theme configuration
- Custom utilities
- Plugin configuration

### components.json (shadcn/ui)
- Component library configuration
- Path aliases
- Style preferences

---

## Additional Patterns

### 1. Metadata Pattern
```typescript
// app/layout.tsx or page.tsx
export const metadata: Metadata = {
  title: "Page Title",
  description: "Page description",
  // ... other metadata
};

export const viewport: Viewport = {
  themeColor: "#5409DA",
  width: "device-width",
  initialScale: 1,
};
```

### 2. Font Loading
```typescript
import localFont from "next/font/local";

const customFont = localFont({
  src: [
    { path: './fonts/Font-Regular.ttf', weight: "400" },
    // ... more weights
  ],
  variable: "--font-custom",
});
```

### 3. Environment Variables
- Use `.env.local` for local development
- Never commit secrets
- Use `NEXT_PUBLIC_` prefix for client-side variables
- Validate environment variables on startup

---

## Conclusion

This project follows modern Next.js best practices with:
- Clear separation of concerns
- Type-safe codebase
- Scalable architecture
- Consistent patterns
- Maintainable structure

Apply these patterns to new projects for a solid foundation.

