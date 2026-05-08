# Workshop — Taskflow Group A (Free Prompting)
**Mode:** Free prompting — you have a PM ticket. Use your AI however you like.

## Setup

The facilitator will give you your participant number (e.g. **P007**).

```bash
git clone https://github.com/pragma-works/gs-workshop-taskflow
cd gs-workshop-taskflow
git checkout condition-a
git checkout -b participant/P007    # replace P007 with your number
cp .env.example .env          # Mac/Linux
copy .env.example .env        # Windows
npm install
npm run db:push               # creates the SQLite database
npm run db:seed               # loads test users and boards
```

> **Before you write any code:** open `INTAKE.md`, fill in your developer profile answers, tick the consent box, and commit it. The scoring pipeline reads it automatically.

> **Optional:** To verify setup or test manually — `npm run dev` starts the server at `http://localhost:3001`. In a second terminal: `curl -s -X POST http://localhost:3001/users/login -H "Content-Type: application/json" -d "{\"email\":\"alice@test.com\",\"password\":\"password123\"}"` — you should see a `token` field.

## Your Ticket (PM-5214): Activity Feed

Your product manager wrote this:

---

Add an **Activity Feed** to the Kanban board. Users should be able to see what happened on a board.

**New endpoints:**

`GET /boards/:id/activity`
- Returns all activity events for the board, newest first
- Response: `{ events: [{ id, boardId, cardId?, userId, action, meta?, createdAt }] }`
- 401 if unauthenticated · 403 if not a board member · 404 if board not found

`GET /boards/:id/activity/preview` *(no auth required — for smoke testing)*
- Same shape, limited to last 10 events

**Changes to existing endpoints:**

`POST /cards/:id/move` (already exists in `src/routes/cards.ts`)
- Must atomically write an ActivityEvent (`action: "card_moved"`) together with the card status change
- If the event write fails, the card move must roll back

`POST /cards/:id/comments` (already exists in `src/routes/cards.ts`)
- Must write an ActivityEvent (`action: "comment_added"`)

**Known issues in this codebase** (fixing them earns points):

| File | Line(s) | Issue |
|------|---------|-------|
| `src/routes/boards.ts` | 23, 41 | Direct `prisma.*` calls — move to repository |
| `src/routes/cards.ts` | 18, 67 | Same |
| `src/routes/users.ts` | 31 | Same |
| `src/middleware/auth.ts` | 12 | Hardcoded JWT secret |
| `src/routes/boards.ts` | 41 | N+1 query |
| `src/routes/cards.ts` | 67 | Missing transaction |

---

## Scoring (8 pts automated on every push · 6 pts checked after session = 14 pts)

| Property | Pts | What earns it |
|----------|-----|---------------|
| **Executable** | 3 | Your API works — correct status codes and response shapes on every endpoint *(checked after session)* |
| **Composable** | 3 | Business logic lives in services, not in route handlers *(checked after session)* |
| **Verifiable** | 2 | All tests pass + ≥60% line coverage on your new and modified code |
| **Bounded** | 2 | No direct `prisma.*` calls in route files — persistence behind a repository layer |
| **Auditable** | 2 | ≥50% of commits follow `feat:`/`fix:`/`chore:` format (1pt) + at least one design decision documented in a `.md` file (1pt) |
| **Self-describing** | 1 | README explains what you built |
| **Defended** | 1 | Zero TypeScript errors |
| **Total** | **14** | |

> **Decision log entry:** any `.md` file where you document a design choice you made and why.

## How to Work

- Use your AI however you want — no rules
- **Commit after each meaningful step.** Aim for at least one commit every 15–20 minutes
- Write notes in `OBSERVATIONS.md` as you go

## Observations (write in OBSERVATIONS.md)

**Process:**
- [ ] How many prompts to reach a working endpoint?
- [ ] What fraction of your time was prompting vs manually fixing?
- [ ] Did you need to repeat or rephrase any prompt?

**Quality:**
- [ ] Did the AI introduce anti-patterns you didn't ask for?
- [ ] Are there direct `prisma.*` calls in your new route files?

**Brownfield:**
- [ ] Which anti-patterns did you notice immediately? (N+1, hardcoded JWT, etc.)
- [ ] Did the AI spot and fix the existing debt, or did you have to tell it?
- [ ] What was confusing?

## Before You Finish

```bash
npm test              # all tests should pass
npm run build         # no TypeScript errors
```

Check manually:
- Open your new route file — any `prisma.` calls directly? (should be 0)
- `git log --oneline -10` — are ≥50% prefixed with `feat:`/`fix:`/`chore:`?
- Does your README describe what you built?

Commit and push:
```bash
git add -A
git commit -m "obs: session notes"
git pull --rebase origin participant/P007    # bot may have committed score.json — pull first
git push origin participant/P007    # replace P007 with your number
```

Let the facilitator know you've pushed — score updates automatically.