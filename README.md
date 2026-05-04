# Founder Stack

Founder Stack is a founder operating dashboard for a three-founder team that wants:

- A weekly goal and visible task board for Alex, Ben, and Zach
- Role-based daily updates from CEO, COO, and CFO
- A shared idea board
- A 3-column founder feed with comments
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

Then run the schema file in Supabase SQL Editor:

- `sql/founder_operating_dashboard.sql`

## What this prototype includes

- Founder-role assignment from the Supabase membership roster
- Weekly goal board for the current operating week
- CEO-editable task columns for Alex, Ben, and Zach
- Shared idea board
- AI-assisted founder update capture
- Side-by-side founder feeds with comments
- JSON export for a team's history
- Vercel deployment with lightweight `/api` serverless routes

## Production version I would build next

For a real internal product, the clean upgrade path would be:

1. Real identity verification instead of email-plus-team-code session creation
2. Richer task editing with drag ordering and due dates
3. Weekly archive views and searchable history
4. Notifications for comments, ideas, and weekly-goal changes
5. Audit trail for task/goal edits
6. Cleaner role-based permissions beyond the CEO edit surface

## Suggested data model

- `teams`: `id`, `name`, `invite_code`, `created_at`
- `memberships`: `id`, `team_id`, `email`, `role`, `user_id`, `created_at`
- `updates`: `id`, `team_id`, `user_id`, `headline`, `wins`, `blockers`, `next_move`, `created_at`
- `comments`: `id`, `update_id`, `team_id`, `author_email`, `author_role`, `body`, `created_at`
- `ideas`: `id`, `team_id`, `author_email`, `author_role`, `body`, `created_at`
- `weekly_goals`: `id`, `team_id`, `week_start`, `goal_text`, `updated_by_email`, `updated_at`
- `tasks`: `id`, `team_id`, `week_start`, `assignee_name`, `title`, `completed`, `sort_order`, `created_at`, `updated_at`
