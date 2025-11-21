# Sentry Error Tracking Setup Guide

This guide will help you set up Sentry error tracking for the Center Sports Science application.

## What is Sentry?

Sentry is an error tracking and performance monitoring platform that helps you identify, debug, and resolve issues in your application in real-time.

## Prerequisites

1. A Sentry account (sign up at [sentry.io](https://sentry.io) if you don't have one)
2. A Sentry project created for this Next.js application

## Setup Steps

### 1. Create a Sentry Project

1. Log in to your [Sentry account](https://sentry.io)
2. Create a new project or select an existing one
3. Choose **Next.js** as your platform
4. Note down your **DSN** (Data Source Name) - you'll need this in the next step

### 2. Get Your Sentry Credentials

You'll need the following from your Sentry project:

- **DSN**: Found in Project Settings → Client Keys (DSN)
- **Organization Slug**: Found in Organization Settings → General
- **Project Slug**: Found in Project Settings → General
- **Auth Token**: Create one at Settings → Auth Tokens (needs `project:releases` scope for source maps)

### 3. Configure Environment Variables

Add the following to your `.env.local` file:

```env
# Sentry Error Tracking
# Server-side DSN (kept private)
SENTRY_DSN=https://your-dsn@sentry.io/your-project-id
# Client-side DSN (only needed if you want browser reporting)
NEXT_PUBLIC_SENTRY_DSN=https://your-dsn@sentry.io/your-project-id

# Optional: only needed when uploading source maps
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=your-project-slug
SENTRY_AUTH_TOKEN=your-auth-token

# Opt-in to Sentry while running `npm run dev`
ENABLE_SENTRY_IN_DEV=true
# (Client override; useful if you prefer to scope to browser only)
NEXT_PUBLIC_ENABLE_SENTRY=true
```

**Important Notes:**
- `SENTRY_DSN` is read by all server and edge runtimes (including background jobs)
- `NEXT_PUBLIC_SENTRY_DSN` is required only if you plan to capture browser errors
- Sentry is automatically disabled during local development unless you set
  `ENABLE_SENTRY_IN_DEV=true` (or the client-specific `NEXT_PUBLIC_ENABLE_SENTRY=true`)
- The auth token is only needed for uploading source maps during builds
- Never commit your `.env.local` file to version control

### 4. Install Dependencies

If you haven't already, install the Sentry Next.js SDK:

```bash
npm install @sentry/nextjs
```

### 5. Verify Installation

1. Restart your development server:
   ```bash
   npm run dev
   ```

2. Test error tracking by triggering a test error (you can add this temporarily to a page):
   ```typescript
   // Test error - remove after testing
   throw new Error("Test Sentry integration");
   ```

3. Check your Sentry dashboard - you should see the error appear within a few seconds

## Configuration Files

The Sentry integration includes the following configuration files:

- **`sentry.client.config.ts`**: Client-side error tracking configuration
- **`sentry.server.config.ts`**: Server-side error tracking configuration
- **`sentry.edge.config.ts`**: Edge runtime error tracking configuration
- **`instrumentation.ts`**: Server-side initialization
- **`next.config.ts`**: Webpack plugin configuration for source maps

## Features Enabled

- ✅ Automatic error tracking for client and server
- ✅ Session Replay (10% of sessions, 100% of errors)
- ✅ Performance monitoring
- ✅ Source map uploads (for better stack traces)
- ✅ Tunnel route to bypass ad-blockers (`/monitoring`)
- ✅ Automatic Vercel Cron Monitor integration
- ✅ User Feedback Widget (automatically available on all pages)

## Customization

### Adjusting Sample Rates

You can adjust the sample rates in the configuration files:

- **`tracesSampleRate`**: Controls performance monitoring (0.0 to 1.0)
- **`replaysSessionSampleRate`**: Controls session replay sampling (0.0 to 1.0)
- **`replaysOnErrorSampleRate`**: Controls session replay on errors (0.0 to 1.0)

For production, consider:
- `tracesSampleRate: 0.1` (10% of transactions)
- `replaysSessionSampleRate: 0.1` (10% of sessions)
- `replaysOnErrorSampleRate: 1.0` (100% of error sessions)

### Enabling/Disabling Sentry in Development

Sentry is now **disabled by default** when you run `npm run dev` to avoid noisy
network errors in restricted environments. Opt in by setting either
`ENABLE_SENTRY_IN_DEV=true` (covers server/edge) or
`NEXT_PUBLIC_ENABLE_SENTRY=true` (client-only). Leaving these unset keeps
local development traffic from being sent to Sentry while production remains
fully instrumented.

## Troubleshooting

### Feedback Widget Not Visible in Production

The feedback widget may not appear if:

1. **Missing Environment Variable**: Ensure `NEXT_PUBLIC_SENTRY_DSN` is set in your production environment variables (Vercel, Netlify, etc.)
   - Go to your deployment platform's environment variables settings
   - Add `NEXT_PUBLIC_SENTRY_DSN` with your Sentry DSN
   - Redeploy your application

2. **Check Browser Console**: Open browser DevTools (F12) → Console tab
   - Look for Sentry initialization errors
   - Check if `window.Sentry` exists (type `window.Sentry` in console)
   - Look for feedback integration errors

3. **Content Security Policy (CSP)**: Your production CSP might be blocking Sentry scripts
   - Add Sentry domains to your CSP allowlist
   - Common Sentry domains: `*.sentry.io`, `*.ingest.sentry.io`

4. **Ad Blockers**: Browser extensions might block Sentry
   - Test in incognito/private mode
   - Check if any ad-blocker extensions are active

5. **Verify Sentry is Initialized**: 
   - Open browser console and type: `window.__SENTRY__`
   - If undefined, Sentry isn't initialized
   - Check if DSN is available: Look in Network tab for requests to `sentry.io`

6. **Force Refresh**: Clear browser cache and hard refresh (Ctrl+Shift+R / Cmd+Shift+R)

### Errors not appearing in Sentry

1. Check that `NEXT_PUBLIC_SENTRY_DSN` is set correctly
2. Verify your Sentry project is active
3. Check browser console for Sentry initialization errors
4. Ensure you're not blocking Sentry with ad-blockers (the tunnel route should help)

### Source maps not working

1. Verify `SENTRY_AUTH_TOKEN` has the correct permissions
2. Check that `SENTRY_ORG` and `SENTRY_PROJECT` are correct
3. Ensure you're running a production build (`npm run build`)

### Build errors

If you encounter build errors related to Sentry:
1. Make sure `@sentry/nextjs` is installed
2. Check that all configuration files are present
3. Verify `next.config.ts` exports the wrapped config correctly

## User Feedback Widget

The User Feedback Widget has been configured and is automatically available on all pages. Sentry's `feedbackIntegration` automatically injects a feedback button in the bottom-right corner of all pages. Users can submit feedback directly through Sentry, which will be associated with their session and any errors they may have encountered.

This is configured in `sentry.client.config.ts` and `instrumentation-client.ts`. The feedback widget will appear automatically when Sentry is enabled with a valid DSN.

## Additional Resources

- [Sentry Next.js Documentation](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Sentry User Feedback Documentation](https://docs.sentry.io/platforms/javascript/user-feedback/)
- [Sentry Dashboard](https://sentry.io)
- [Sentry Best Practices](https://docs.sentry.io/product/best-practices/)

