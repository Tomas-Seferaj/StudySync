Homework

A homework tracker that helps students organize assignments, track deadlines, and never miss a due date.
Built with plain HTML, CSS and JavaScript. No frameworks and no build tools: open `index.html` and it runs.
Features

Accounts: sign up and log in, with passwords protected using PBKDF2 hashing

Dashboard: a greeting, your week at a glance, and quick stats (overdue, due today, next 7 days, finished)

Side menu with Dashboard, Upcoming, Calendar and Completed pages

Classes: color-coded, each with its own page and assignment count

Calendar: month view; click a day to add an assignment on that date
Side panel editor: add or edit title, class, due date, notes and an "important" star
ManageBac sync: new assignments from school appear automatically
Search across titles, classes and notes
Light and dark mode
Works on phones, tablets and computers
Keyboard shortcuts: `N` new assignment, `/` search, `Esc` close
How to run it
Download or clone this repository.
Open `index.html` in Chrome, Edge or Firefox.
Create an account and start adding assignments.
Put it online for free (GitHub Pages)
Push this project to a GitHub repository.
Go to Settings → Pages.
Under "Branch", choose `main` and `/ (root)`, then click Save.
After a minute it's live at `https://YOUR-USERNAME.github.io/REPO-NAME/`.
Connect ManageBac
Open Settings in the app and paste your ManageBac calendar link.
Step-by-step instructions, including the free sync server, are in SYNC-SETUP.md.
Project structure
File	What it does
`index.html`	The page structure: log in screen, side menu, top bar, side panel, class popup
`css/style.css`	All the styling, including dark mode and phone layouts
`js/helpers.js`	Small tools: building elements, icons, dates, pop-up messages
`js/auth.js`	Sign up, log in, log out and password hashing
`js/managebac.js`	Reading ManageBac calendar files (.ics)
`js/app.js`	The app itself: pages, classes, assignments, settings and syncing
`worker/worker.js`	A tiny free server that fetches your ManageBac calendar
`SYNC-SETUP.md`	Guide for setting up ManageBac sync
How accounts work (and their limits)
Passwords are never saved. When you sign up, the app creates a random "salt" and
scrambles your password with PBKDF2 (150,000 rounds of SHA-256). Only that scrambled
"hash" is stored. Logging in scrambles what you typed the same way and compares.
Everything is saved in the browser's `localStorage`, which means:
Accounts only exist on the device and browser where they were created.
Several people can share one computer and each have their own assignments.
It is not full security: someone with access to the computer could still read the saved assignments.
For real accounts that work on any device, you'd add a backend service such as
Supabase or Firebase.
That's a great next project, but remember that storing other people's data is a
real responsibility, so learn about privacy and security first.
Ideas for next features
[ ] Real online accounts with Supabase
[ ] Drag assignments between days in the calendar
[ ] Reminders the day before something is due
[ ] A "focus timer" for working on an assignment
[ ] Import a backup file
[ ] Support Google Classroom
License
MIT. See LICENSE.
