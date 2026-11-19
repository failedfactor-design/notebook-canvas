# Notebook Canvas

A calm personal workspace combining a flowing notebook editor and a freeform canvas for images and files.

## Product principles

- **Write like a notebook:** text flows naturally in a document. No manually positioned text boxes.
- **Arrange media freely:** images and documents are independent objects that can be moved and resized on a canvas.
- **Private by default:** authenticated accounts, row-level security, and a private Storage bucket.
- **Quiet UI:** graphite/gray is the default appearance. Accent themes are optional.

## Stack

- Vanilla JavaScript ES modules and CSS (no build step)
- TipTap rich-text editor
- Supabase Auth, Postgres, and private Storage

## Supabase project

- Name: `notebook-canvas`
- Region: Singapore (`ap-southeast-1`)
- URL: `https://tafotvohbwpuatgfeoqb.supabase.co`

The browser uses a Supabase **publishable** key. This key is intended for client-side use. All exposed database tables and the Storage bucket are protected by RLS. Never put a Supabase secret or service-role key in this repository.

### Storage

Private bucket: `notebook-assets`  
Maximum file size: 50 MB  
Path convention: `<auth-user-id>/<notebook-id>/<random-id>-<filename>`

### Database

- `profiles`
- `folders`
- `notebooks`
- `notebook_pages` — TipTap JSON is stored in `content`
- `canvas_items` — coordinates, dimensions, rotation, z-order, and file reference

Migrations are in `supabase/migrations/`. All application tables have RLS enabled with owner-based policies. The private asset bucket uses user-id-prefixed paths and Storage RLS policies.

## Run locally

Serve the repository through a local web server (do not open it as a `file://` URL).

```bash
python -m http.server 5173
```

Open http://localhost:5173.

## Current features

- Email/password sign up, sign in, and sign out
- Notebook and page creation
- Continuous rich-text writing with headings, lists, quotes, and code blocks
- Autosave to Supabase Postgres
- Multi-file upload to private Storage
- Image previews with signed URLs
- Freely movable, resizable, rotatable canvas assets
- Layer ordering and asset deletion
- Theme preference stored in the user's profile

## Deployment

The app is static and can be hosted on GitHub Pages or another static host. Configure the production and local authentication redirect URLs in Supabase Auth before using magic-link or password recovery flows. For GitHub Pages, use **Settings → Pages → Deploy from a branch → main → /(root)**.

## Future work

Collaboration, revision history, drag-and-drop page ordering, mobile pinch gestures, offline support, export to PDF, and richer file previews are not part of this first foundation yet.
