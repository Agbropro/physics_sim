# Deploy the Frontend and Backend to Vercel

This project is deployed as one Vercel project:

- The React/Vite frontend is served from `/`.
- The FastAPI backend is served from `/api`.
- The frontend calls the backend on the same domain, so a second backend domain
  and production CORS configuration are not required.

## Required repository structure

The following files must be committed and pushed:

```text
.
├── .python-version
├── api/
│   ├── __init__.py
│   └── index.py
├── frontend/
│   ├── package-lock.json
│   ├── package.json
│   └── src/
├── requirements.txt
├── src/
│   └── delivery/api.py
└── vercel.json
```

### FastAPI entrypoint

Vercel requires a recognized Python entrypoint. `api/index.py` exports the
existing FastAPI application:

```python
from src.delivery.api import app

__all__ = ["app"]
```

All backend routes in `src/delivery/api.py` retain their `/api` prefix, for
example `/api/health`, `/api/com`, and `/api/simulate`.

### Python version

`.python-version` contains:

```text
3.12
```

Use Python 3.12 for Vercel even if a local virtual environment uses Python
3.10. Vercel currently supports Python 3.12, 3.13, and 3.14; Python 3.10 is not
an available Vercel runtime.

### Python dependencies

Vercel installs backend dependencies from the root `requirements.txt`.
`opencv-python-headless` is used instead of the desktop OpenCV package because
the server does not need GUI support and the headless wheel has fewer cloud
runtime dependencies.

### Frontend API URL

The API client uses an empty base URL by default:

```ts
const API_BASE = import.meta.env.VITE_API_URL || '';
```

Do not define `VITE_API_URL` in Vercel for this combined deployment. Requests
such as `/api/com` will automatically use the same protocol and domain as the
frontend.

### Vercel build configuration

The root `vercel.json` builds the nested Vite application and publishes its
output while keeping the Python API as a Vercel Function:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "npm --prefix frontend ci && npm --prefix frontend run build",
  "outputDirectory": "frontend/dist",
  "functions": {
    "api/index.py": {
      "excludeFiles": "{frontend/**,docs/**,**/__pycache__/**}"
    }
  }
}
```

## First deployment

1. Commit and push all deployment files:

   ```bash
   git add .python-version api deploy_vercel.md frontend/src/api/client.ts requirements.txt vercel.json README.md
   git commit -m "configure full-stack Vercel deployment"
   git push origin main
   ```

2. Import the repository in Vercel, or open the existing Vercel project.

3. Use these project settings:

   ```text
   Application Preset: FastAPI
   Root Directory: ./
   Environment Variables: none required
   ```

4. Click **Deploy**. For an existing Git-connected project, pushing to the
   production branch normally starts the deployment automatically.

5. Test the generated `*.vercel.app` address before attaching a custom domain:

   ```text
   https://YOUR-PROJECT.vercel.app/
   https://YOUR-PROJECT.vercel.app/api/health
   ```

   The health endpoint must return:

   ```json
   {"status":"ok"}
   ```

6. Draw a shape in the application and test both **Calculate COM** and the
   gravity simulation. This verifies the two POST endpoints, not only the static
   frontend.

## Add a custom subdomain

The Vercel project name controls the default `*.vercel.app` address. It does not
need to match the custom domain.

1. Open **Vercel Project → Settings → Domains**.
2. Add the complete desired subdomain, for example:

   ```text
   physicssim.agprbro.my.id
   ```

3. If the parent domain uses Vercel nameservers, Vercel can configure the
   subdomain. If DNS is hosted elsewhere, add the CNAME record shown by Vercel
   at that DNS provider. The record will generally look like:

   ```text
   Type:  CNAME
   Name:  physicssim
   Value: the exact target displayed by Vercel
   ```

4. Wait for Vercel to show **Valid Configuration**. Vercel will provision the
   HTTPS certificate automatically.
5. Verify both the site and `https://YOUR-SUBDOMAIN/api/health`.

Only create a subdomain below a parent domain whose DNS you control. For
example, control of `agprbro.my.id` permits `physicssim.agprbro.my.id`, but it
does not permit `physicssim.agro.my.id` unless `agro.my.id` is also yours.

## Updating the deployment

After the initial setup, normal updates only require a commit and push:

```bash
git add <changed-files>
git commit -m "describe the update"
git push origin main
```

Vercel creates a new production deployment for pushes to the configured
production branch. Changes to `VITE_*` variables require a redeployment because
Vite embeds them during the frontend build.

## Troubleshooting

### `No FastAPI entrypoint found`

Confirm that `api/index.py` was committed and pushed. In the Vercel build log,
check the commit hash and compare it with the latest commit shown by:

```bash
git log -1 --oneline
```

This error commonly means Vercel built an older commit that did not yet contain
the `api/` directory.

### Frontend build failure

Run the same build locally:

```bash
npm --prefix frontend ci
npm --prefix frontend run build
```

Fix TypeScript or Vite errors before pushing again.

### Frontend loads but API returns 404

Check all of the following:

- `api/index.py` exists in the deployed commit.
- The Vercel Root Directory is the repository root, not `frontend`.
- Backend routes include the `/api` prefix.
- `VITE_API_URL` is unset for the combined deployment.

### Deployment works but the custom domain does not

Open **Settings → Domains** and copy the exact DNS record Vercel requests.
Remove conflicting CNAME or A records for the same `physicssim` hostname, then
allow time for DNS propagation.
