# The Stag Open — Tommy's Stag Live App

Mobile-first Vercel app with live scoring, photo evidence, locked challenges, sequential venue unlocks and best-man admin.

## Deploy

1. Upload all files in this folder to your GitHub repository.
2. Import the repository in Vercel.
3. Build command: `npm run build`
4. Output directory: `dist`

## Supabase live scoring

1. Create a free Supabase project.
2. Run `supabase-schema.sql` in the SQL Editor.
3. In Vercel environment variables, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - optional `VITE_ADMIN_PIN`

## Notes

- Photo evidence is stored as base64 in the database for simplicity. Fine for a stag prototype with compressed phone images, but Supabase Storage is better for a large gallery.
- Teams can only unlock the next venue after every challenge on the current venue has a photo and submitted points.
- Submitted challenges are locked.
- The gallery only opens after the best man finishes the round.
