# Project Rules and Standards

## Architecture Rules

### Framework Stack
- **MUST** use Next.js 15 App Router with TypeScript
- **MUST** use React 18 with Server Components as default
- **MUST** use Tailwind CSS for styling
- **MUST** use shadcn/ui for UI components
- **MUST** use NextAuth.js v5 for authentication

### Architectural Decisions
1. **MUST** use Server Components by default
2. **MUST** add `'use client'` directive only when needed (interactivity, hooks, browser APIs)
3. **MUST** use strict TypeScript configuration
4. **MUST** use path aliases (`@/*`) for imports
5. **MUST** organize routes using route groups `(root)` when needed

---

## Directory Structure Rules

### Required Structure
```
app/                    # Next.js App Router
├── api/               # API routes (feature-based)
├── (auth)/            # Route groups for organization
├── layout.tsx         # Root layout
└── globals.css        # Global styles

components/            # React components
├── ui/               # shadcn/ui components
└── Providers.tsx     # Context providers

lib/                  # Utilities & services
hooks/                # Custom React hooks
public/               # Static assets
```

### Organization Rules
- **MUST** use feature-based organization for related files
- **MUST** co-locate related files (components, types, hooks)
- **MUST** use route groups `(root)` to organize without affecting URLs
- **MUST** group API routes by feature in `/api/[feature]/route.ts`

---

## Code Organization Rules

### Path Aliases
- **MUST** use `@/*` for all internal imports
- **MUST** configure in `tsconfig.json`: `"@/*": ["./*"]`
- **MUST NOT** use relative imports (`../../`) beyond one level

### Server vs Client Components
- **MUST** default to Server Components (no directive)
- **MUST** add `'use client'` at the top when using:
  - React hooks (`useState`, `useEffect`, etc.)
  - Browser APIs (`window`, `document`, etc.)
  - Event handlers (`onClick`, `onChange`, etc.)
  - Context providers/consumers
- **MUST** extract interactive parts to separate Client Components

### Providers Pattern
- **MUST** centralize all context providers in `components/Providers.tsx`
- **MUST** wrap root layout with `<Providers>`
- **MUST** mark Providers component with `'use client'`

---

## TypeScript Rules

### Configuration
- **MUST** use strict TypeScript (`"strict": true`)
- **MUST** define interfaces for all component props
- **MUST** export types when reused across files
- **MUST** use PascalCase for types/interfaces
- **MUST** name props interfaces as `ComponentNameProps`

### Type Definitions
- **MUST** use TypeScript interfaces (not `type`) for component props
- **MUST** use optional props (`?`) for non-required props
- **MUST** destructure props in function signature
- **SHOULD** export reusable types from components

---

## Styling Rules

### Tailwind CSS
- **MUST** use Tailwind utility classes primarily
- **MUST** create custom utility classes in `globals.css` for repeated patterns
- **MUST** use `cn()` utility from `@/lib/utils` for conditional classes
- **MUST** accept `className` prop in components for customization
- **MUST** use CSS variables for theming

### Custom Classes
- **MUST** define custom utilities in `@layer utilities` in `globals.css`
- **MUST** use kebab-case for custom class names (e.g., `section_container`)
- **MUST** use `@apply` directive for Tailwind utilities in custom classes

### Component Styling
- **MUST** use `cn("base-classes", className)` pattern
- **MUST** allow className override via props

---

## Component Rules

### Component Structure
1. **MUST** order sections:
   - `'use client'` directive (if needed)
   - Imports (React → Third-party → Internal → Types)
   - Type definitions
   - Component implementation
   - State declarations
   - Effects
   - Handlers
   - Render/return

2. **MUST** use TypeScript interfaces for props
3. **MUST** destructure props in function signature
4. **MUST** use default export for page components
5. **SHOULD** use named exports for reusable components

### Component Composition
- **MUST** break down large components into smaller pieces
- **MUST** extract logic into custom hooks
- **SHOULD** use compound components pattern for complex UI

### Props
- **MUST** define all props with TypeScript interfaces
- **MUST** mark optional props with `?`
- **SHOULD** provide default values where appropriate

---

## API Route Rules

### Route Handler Structure
1. **MUST** use try-catch blocks for all operations
2. **MUST** validate input parameters
3. **MUST** check authentication for protected routes
4. **MUST** return consistent response format
5. **MUST** log errors for debugging
6. **MUST NOT** expose internal errors to clients

### Response Format
- **MUST** use consistent structure:
  ```typescript
  // Success
  { success: true, data: {...} }
  
  // Error
  { success: false, message: "Error message" }
  ```

### Authentication
- **MUST** check session for protected routes:
  ```typescript
  const session = await auth();
  if (!session) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }
  ```

### Error Handling
- **MUST** wrap operations in try-catch
- **MUST** return user-friendly error messages
- **MUST** log detailed errors to console
- **MUST** use appropriate HTTP status codes

---

## Custom Hooks Rules

### Hook Structure
- **MUST** prefix hook names with `use` (e.g., `useNotifications`)
- **MUST** export return type interface
- **MUST** handle loading and error states
- **MUST** use `useCallback` for memoized functions
- **MUST** use `useEffect` for side effects

### Hook Pattern
- **MUST** return object with: `{ data, loading, error, ...functions }`
- **MUST** check session/auth before API calls
- **MUST** handle errors gracefully

---

## Utility Functions Rules

### File Organization
- **MUST** place general utilities in `lib/utils.ts`
- **MUST** create service modules for related functionality:
  - `lib/email.ts` - Email services
  - `lib/validation.ts` - Validation functions
  - `lib/[service].ts` - Other services

### Function Naming
- **MUST** use camelCase for function names
- **MUST** use descriptive names
- **MUST** export all utility functions

---

## Authentication Rules

### Server Components
- **MUST** use `await auth()` from `@/auth`
- **MUST** check session before protected operations

### Client Components
- **MUST** use `useSession()` from `next-auth/react`
- **MUST** handle loading state

### Protected Routes
- **MUST** check authentication in API routes
- **MUST** return 401 status for unauthorized requests

---

## Error Handling Rules

### API Routes
- **MUST** use try-catch blocks
- **MUST** return user-friendly error messages
- **MUST** log errors with `console.error`
- **MUST** use appropriate HTTP status codes

### Components
- **MUST** manage error state with `useState`
- **MUST** display user-friendly error messages
- **MUST** log errors to console

### Global Error Boundary
- **SHOULD** implement `app/global-error.tsx` for global error handling

---

## Naming Conventions

### Files and Directories
- **Components**: PascalCase (e.g., `StartupCard.tsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useNotifications.ts`)
- **Utilities**: camelCase (e.g., `utils.ts`, `validation.ts`)
- **API Routes**: `route.ts` in `/api/[feature-name]/`
- **Pages**: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`

### Code
- **Components**: PascalCase
- **Functions**: camelCase
- **Constants**: UPPER_SNAKE_CASE
- **Types/Interfaces**: PascalCase
- **Props Interfaces**: `ComponentNameProps`

### CSS Classes
- **MUST** use Tailwind utility classes primarily
- **Custom classes**: kebab-case (e.g., `section_container`)
- **Component-specific**: prefix with component name (e.g., `startup-card`)

---

## File Organization Rules

### Feature-Based Organization
- **MUST** group related files by feature/domain
- **MUST** co-locate related files (components, types, hooks)

### Import Organization
- **MUST** order imports:
  1. React/Next.js imports
  2. Third-party libraries
  3. Internal utilities (`@/lib/*`)
  4. Components (`@/components/*`)
  5. Types (`import type ...`)
  6. Styles

---

## Best Practices Checklist

### Type Safety
- ✅ Use TypeScript strictly
- ✅ Define interfaces for all props
- ✅ Export reusable types
- ✅ Use type inference where appropriate

### Performance
- ✅ Use Server Components by default
- ✅ Minimize client-side JavaScript
- ✅ Use `useCallback` and `useMemo` appropriately
- ✅ Lazy load heavy components

### Code Quality
- ✅ Consistent error handling
- ✅ Meaningful variable names
- ✅ Small, focused functions
- ✅ DRY (Don't Repeat Yourself)

### User Experience
- ✅ Loading states
- ✅ Error states
- ✅ Optimistic updates where appropriate
- ✅ Accessible components

### Security
- ✅ Server-side authentication checks
- ✅ Input validation
- ✅ Sanitize user input
- ✅ Use environment variables for secrets

### Maintainability
- ✅ Clear file structure
- ✅ Comprehensive documentation
- ✅ Consistent patterns
- ✅ Separation of concerns

---

## Configuration Rules

### Environment Variables
- **MUST** use `.env.local` for local development
- **MUST NOT** commit secrets to version control
- **MUST** use `NEXT_PUBLIC_` prefix for client-side variables
- **SHOULD** validate environment variables on startup

### Metadata
- **SHOULD** export `metadata` object from pages/layouts
- **SHOULD** export `viewport` object for responsive design

---

## Quick Reference

### Component Template
```typescript
'use client'; // Only if needed

import { useState } from 'react';
import { cn } from "@/lib/utils";

interface ComponentProps {
  prop1: string;
  prop2?: number;
}

export default function Component({ prop1, prop2 }: ComponentProps) {
  const [state, setState] = useState();
  
  return (
    <div className={cn("base-classes")}>
      {/* JSX */}
    </div>
  );
}
```

### API Route Template
```typescript
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    // Validate, process, return
    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { success: false, message: 'Error message' },
      { status: 500 }
    );
  }
}
```

### Hook Template
```typescript
import { useState, useEffect, useCallback } from 'react';

export interface UseFeatureReturn {
  data: DataType[];
  loading: boolean;
  error: string | null;
  fetchData: () => Promise<void>;
}

export function useFeature(): UseFeatureReturn {
  const [data, setData] = useState<DataType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch logic
    } catch (err) {
      setError('Error message');
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  return { data, loading, error, fetchData };
}
```

---

**Remember**: These rules ensure consistency, maintainability, and scalability across the project. When in doubt, follow the patterns established in existing code.
