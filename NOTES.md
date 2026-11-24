# Counselor — project notes

## Run it
Command: `./start.sh`
Then open http://localhost:3000

## What is done (Version 1)
- MVP 1: the user can ask for a list of pros and cons for an idea.
- MVP 2: the user can ask the AI to challenge their assumptions about a plan.
- MVP 3: the user can ask for potential risks related to an idea.
- MVP 4: the AI gives correct, safe answers to real questions.
- All four MVP features were tested with the real AI.
- Each feature has its own numbered button and an example prompt for a short demo video.
- The app starts with three made-up sample ideas; no real people are used.
- The AI connects through getKey(). The key stays on the server and is never sent to the page.
- OpenAI model: gpt-5.6-luna.
- Safety: no medical, legal, or emergency advice. If someone might hurt themselves or someone else, Counselor shows 988 (call or text) and tells them to talk to a trusted adult right now.
- Saves on this computer only for now.
- The sample ideas are made up; no real people are used.
- After each save point, push it to GitHub.

## Maybe Later
- The user can get a second opinion on their ideas from the AI.
- The user can explore alternative solutions suggested by the AI.
- The user can find examples of similar situations to guide their planning.
- The user can save their ideas for later review during the session.
- The user can ask the AI to clarify confusing points about their plan.
- The user can receive reminders for tasks related to their ideas.
- The user can access tips on how to structure their ideas effectively.
- The user can get guidance on breaking down tasks into smaller steps.
- The user can report if they feel unsafe or encounter harmful advice.
- The user can learn about support resources like 988 if needed.
- The user can use the AI without providing any personal information.

## What is next
- Test Counselor with a few classmates and write down what confused them.
- Add a real database so ideas can follow the user to another device.
- Build the competition PDF (up to 10 pages) and the 4-minute demo video.
- Aim to submit a few days before December 23, 2026.
