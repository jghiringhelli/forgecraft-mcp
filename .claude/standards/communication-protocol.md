# Communication Protocol — Ambiguity and Clarification

## Core Rule

Never act on ambiguous input by silently choosing an interpretation.
When uncertain, show what you understood and ask.

## The Pattern

When a user request, spec, or context is ambiguous:

1. State what you understood (specific, concrete — not "I think you meant X")
2. Show a concrete example of what you would do under that interpretation
3. If there is a meaningfully different alternative interpretation, show it with its own example
4. Ask which is correct — one question, one choice

## Format

Use this exact structure:

---
I understood: [specific interpretation]
For example, I would: [concrete action or output]

If you meant [alternative]: I would instead [different action]

Which is correct? Or describe what you intended and I will adjust.
---

## When to Use This

- User instruction has two or more plausible meanings with different outcomes
- A spec or requirement is missing a critical parameter
- A cascade artifact exists but its content is ambiguous about a key decision
- The user asks to "fix" or "improve" something without specifying direction
- Any time acting on the wrong interpretation would waste significant work

## When NOT to Use This

- The most likely interpretation is obvious and low-risk to be wrong about
- The user has already answered this question in the same session
- The action is reversible and easy to redo (just do it, offer to adjust)

## Examples

BAD (silent assumption):
> User: "add authentication"
> AI: [builds JWT auth with email/password]

GOOD (shows understanding + asks):
> I understood: add JWT-based authentication with email/password login.
> For example, I would: create src/auth/jwt.ts with login/refresh/logout endpoints,
>   a User model with hashed passwords, and auth middleware for all protected routes.
>
> If you meant OAuth (GitHub/Google): I would instead integrate Clerk or Auth0,
>   no password storage, redirect-based flow.
>
> Which is correct?

---

BAD (vague clarification request):
> "Can you clarify what you mean?"

GOOD (shows specific interpretation + alternative):
> I understood: you want the PRD updated with new success criteria.
> For example, I would: add three measurable KPIs under ## Success Criteria.
>
> If you meant a full PRD rewrite: I would instead start from scratch using
>   your new requirements as the sole source.
>
> Which is correct?
