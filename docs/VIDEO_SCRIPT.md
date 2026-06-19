# 3-Minute Walkthrough Video — Script

**Target length:** 3 minutes
**Audience:** School admin (non-IT)
**Goal:** Show them they can install and use this without help

---

## Setup (before recording)

1. Have a fresh `Start.bat` ready, no data yet
2. Have a sample roster Excel file prepared (5-10 students)
3. Use a screen recorder with microphone (OBS, Loom, or built-in)
4. Resolution: 1080p or higher

---

## Script

### [00:00 – 00:15] Hook (15 sec)

> "Tired of fighting with complicated software to track student tardiness?
> This is **Tardiness Check** — a single-folder web app you can set up in 5 minutes
> without any IT help. Let me show you."

*[Show the project folder — one folder, 6 files at root]*

### [00:15 – 00:45] Install (30 sec)

> "First, install Node.js — just go to nodejs.org and grab the LTS version.
> That's a 2-minute, one-time setup."

*[Screen recording: browser → nodejs.org → click LTS → run installer → Next Next Next]*

> "Then double-click `Start.bat`. It installs dependencies on first run, then opens
> your browser to the app."

*[Screen recording: double-click Start.bat → console appears → browser opens]*

### [00:45 – 01:30] First-run wizard (45 sec)

> "The first time you open the app, it walks you through setup. Four screens."

*[Screen recording: wizard.html appears]*

> "School name, then pick the academic year — I'll choose 2025/2026."

*[Type school name → click Next → click "2025/2026" → click Next]*

> "Now create your admin PIN — this protects the student list, settings, and backups.
> I'll use 867530."

*[Type PIN in both boxes → click Next]*

> "And here's your **recovery code**. This is the ONLY way to reset your PIN if you
> forget it, and we'll only show it once. Write it down, print it, keep it somewhere safe."

*[Highlight the recovery code with a circle on screen]*

> "Click finish, and you're done."

### [01:30 – 02:15] Add students via Excel (45 sec)

> "Let's add some students. I'll click Import, then download the Excel template."

*[Screen recording: click Import → click "Download Excel template" → Excel opens]*

> "I already filled this in with my students. Now I'll upload it."

*[Drag the file in → click Preview]*

> "The app checks my file: 12 new students, no errors. I click Apply and they're added."

*[Click Apply → toast appears → close dialog]*

> "The roster page now shows them all, sorted by class. Each row shows their
> late count with a color badge — grey is fine, green is good, amber is a warning,
> red means they need a chat."

### [02:15 – 02:45] Mark a student late (30 sec)

> "Now the day-to-day use. A teacher comes in late — I switch to the Mark Late page,
> type 'alex', tap his name, confirm. Done. 2 seconds."

*[Screen recording: type "alex" → result appears → click → modal → confirm]*

> "It even beeps to confirm. The student gets logged with today's timestamp.
> That's the whole workflow for gate staff — no PIN, no training."

### [02:45 – 03:00] Closing (15 sec)

> "Backups happen automatically every night at 2 AM. The app can restore itself
> from any backup with one click. It even has a 'Get Help' button that copies
> everything your IT person needs to diagnose an issue.
>
> One folder. No cloud. No IT required.
>
> Download from [link], drop the folder on your school PC, double-click Start.bat."

*[Show the closing folder view]*

---

## Recording tips

- **Speak slowly and clearly** — non-IT viewer
- **Use real-looking data** — "Alex Tan, Primary 1A" not "Foo Bar"
- **Highlight cursor** for important elements (recovery code!)
- **Show the URL bar** when accessing from another device
- **Don't worry about mistakes** — small pauses are fine; users can re-watch

## Editing

- If too long: cut the "Install" section, mention "install Node.js LTS first" in on-screen text
- If too short: add a 30-sec section showing the Reports page (stats, today, top offenders)

## Upload

- Title: "Tardiness Check — 3-minute walkthrough"
- Description: Step-by-step setup with timestamps:
  - 0:00 Intro
  - 0:15 Install Node.js
  - 0:45 First-run wizard
  - 1:30 Add students
  - 2:15 Mark a student late
  - 2:45 Closing
- Visibility: Unlisted (only people with the link can see)
