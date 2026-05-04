# Founder Stack

Founder Stack is a lightweight MVP for a three-founder team that wants:

- Daily updates from CEO, COO, and CFO
- A history of every push to the update stack
- Team-code based separation between rooms
- An email-plus-team-code sign-in flow

## Run it locally

Use any simple static file server. For example:

```bash
python3 -m http.server 4173
```

Then open `http://127.0.0.1:4173`.

For the live server-backed version, add these Vercel environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET`

## What this prototype includes

- Local browser storage for sessions and team data
- Team creation on first sign-in to a new team code
- Founder-role assignment from the Supabase membership roster
- Append-only push log with timestamps and push IDs
- JSON export for a team's history
- Vercel deployment with lightweight `/api` serverless routes

## Production version I would build next

For a real internal product, the clean upgrade path would be:

1. Frontend in Next.js or Remix
2. Real email magic-link auth with Supabase or Clerk
3. Postgres tables for teams, members, and updates
4. Invite-only team membership instead of open team-code creation
5. Optional daily reminder emails or Slack nudges
6. Search, filters, and weekly digest views

## Suggested data model

- `teams`: `id`, `name`, `team_code`, `created_at`
- `members`: `id`, `team_id`, `email`, `role`, `created_at`
- `updates`: `id`, `team_id`, `member_id`, `headline`, `wins`, `blockers`, `next_move`, `created_at`
