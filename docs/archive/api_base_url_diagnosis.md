# API Base URL Diagnosis

## Problem
Identify where the frontend configuration sets the API base URL for its requests.

## Findings
The frontend does not define an absolute API base URL in its code or environment files. Instead, it relies on relative paths combined with Vite's proxy mechanism for local development.

1. **API Calls**: The codebase relies on relative endpoint definitions. All frontend `fetch()` calls point to paths starting with `/api` (e.g., `fetch('/api/ul/todays-run')`), as observed in files like `src/api/routeRuns.ts`.
2. **Local Development Proxy**: In `vite.config.ts`, Vite is configured to proxy any path starting with `/api` to the local backend running on port 4000:
   ```ts
   server: {
     proxy: {
       '/api': 'http://localhost:4000'
     }
   }
   ```
3. **Environment Variables**: The `frontend/.env.local` file contains configuration for Azure AD authentication and MapTiler variables but does not contain any API base URL settings.

### Conclusion 
The frontend does not inject a base URL. Instead, it makes relative requests. During local development, Vite proxies these `/api` requests to `http://localhost:4000`. In a deployed environment, this implies that the application expects the backend API to be accessible on the same domain as the frontend, under the `/api` path, which is typically handled by a reverse proxy or load balancer.
