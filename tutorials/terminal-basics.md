# ⌨️ Terminal Basics — Command 1×1

> The terminal is your command center. Here are the essential commands you'll use every day.

📋 **Note:** Most commands work the same on macOS, Linux, and Windows (PowerShell). Differences are marked with 🍎 🐧 🪟.

---

## 📂 Navigation — Moving around

| Command | What it does | Example |
|---------|-------------|---------|
| `pwd` | **Print Working Directory** — shows where you are | `pwd` → `/Users/you/neural-flight-template` |
| `ls` | **List** files and folders in current directory | `ls` |
| `ls -la` | List **all** files (including hidden) with details | `ls -la` |
| `cd folder` | **Change Directory** — go into a folder | `cd src` |
| `cd ..` | Go **up** one folder | `cd ..` |
| `cd ~` | Go to your **home** folder | `cd ~` |
| `cd -` | Go **back** to the previous folder | `cd -` |

**💡 Tip:** Press `Tab` to auto-complete folder and file names! Type `cd sr` + `Tab` → `cd src/`

### Example: Navigate to the project

```bash
# Where am I?
pwd

# Go to home folder
cd ~

# Go into the project
cd neural-flight-template

# What's in here?
ls

# Go deeper
cd src/lib/experiences

# Go back up two levels
cd ../..
```

---

## 📄 Files — Reading and creating

| Command | What it does | Example |
|---------|-------------|---------|
| `cat file` | Show file contents | `cat package.json` |
| `head file` | Show first 10 lines | `head src/app.css` |
| `tail file` | Show last 10 lines | `tail src/app.css` |
| `touch file` | Create an empty file | `touch notes.txt` |
| `mkdir folder` | Create a new folder | `mkdir my-experience` |
| `mkdir -p a/b/c` | Create nested folders | `mkdir -p src/lib/experiments/test` |
| `cp source dest` | **Copy** a file | `cp template.ts my-file.ts` |
| `mv source dest` | **Move** or rename a file | `mv old-name.ts new-name.ts` |
| `rm file` | **Delete** a file ⚠️ | `rm notes.txt` |
| `rm -r folder` | **Delete** a folder and everything in it ⚠️ | `rm -r old-folder` |

> ⚠️ **Be careful with `rm`!** There's no trash can in the terminal — deleted files are gone forever.

---

## 🔍 Searching — Finding things

| Command | What it does | Example |
|---------|-------------|---------|
| `grep "text" file` | Search for text in a file | `grep "WebSocket" src/lib/ws/protocol.ts` |
| `grep -r "text" folder` | Search in all files recursively | `grep -r "onMount" src/` |
| `grep -rn "text" folder` | Search with **line numbers** | `grep -rn "TODO" src/` |

### 🪟 Windows PowerShell alternatives

| Unix Command | PowerShell Equivalent | Example |
|-------------|----------------------|---------|
| `cat` | `Get-Content` (or `cat` works too) | `cat package.json` |
| `grep` | `Select-String` | `Select-String "WebSocket" src/lib/ws/protocol.ts` |
| `touch` | `New-Item` | `New-Item notes.txt` |
| `rm -r` | `Remove-Item -Recurse` | `Remove-Item -Recurse old-folder` |

> 💡 **Good news:** PowerShell has aliases for most Unix commands (`ls`, `cd`, `cat`, `cp`, `mv`, `rm` all work).

---

## ⚡ Project Commands — What you'll use most

```bash
# Start the dev server (keep this running!)
bun run dev

# Install dependencies after pulling new code
bun install

# Lint and format code
bunx biome check --write .

# Type-check your code
bunx svelte-check --threshold warning

# Connect Quest via USB
adb devices
adb reverse tcp:5173 tcp:5173
```

---

## 🔧 Git Commands — Saving your work

```bash
# See what files you've changed
git status

# See the actual changes (line by line)
git diff

# Stage files for commit (= prepare for save)
git add src/lib/experiences/my-world/scene.ts

# Stage ALL changed files
git add .

# Save your changes with a message
git commit -m "feat: ✨ add terrain to my-world experience"

# Download latest changes from the team
git pull

# Upload your changes
git push
```

### Git workflow (the daily cycle)

```
1. git pull              ← get latest changes
2. (write code)          ← do your work
3. git status            ← see what changed
4. git add .             ← stage changes
5. git commit -m "..."   ← save with a message
6. git push              ← upload to GitHub
```

---

## 🛑 Process Control — Starting and stopping

| Command | What it does |
|---------|-------------|
| `Ctrl + C` | **Stop** the running program (e.g., dev server) |
| `Ctrl + L` | **Clear** the terminal screen |
| `↑` / `↓` | Scroll through **previous commands** |
| `Ctrl + R` | **Search** through command history |
| `clear` | Clear the screen |
| `exit` | Close the terminal tab/window |

---

## 📌 Cheat Sheet

Copy this and pin it somewhere:

```
NAVIGATE          FILES              GIT
─────────         ─────────          ─────────
pwd   = where?    cat   = read       status = what changed?
ls    = what's    touch = create     add .  = stage all
cd x  = go to     mkdir = new dir    commit = save
cd .. = go up     cp    = copy       pull   = download
cd ~  = home      mv    = move/rename push  = upload
Tab   = complete  rm    = delete ⚠️

PROJECT           CONTROL
─────────         ─────────
bun run dev       Ctrl+C = stop
bun install       Ctrl+L = clear
bunx biome check  ↑/↓    = history
```

---

## 📺 Video Resources

Prefer watching? These videos cover terminal basics:

| Video | Duration | What you'll learn |
|-------|----------|-------------------|
| [Terminal Crash Course — For Absolute Beginners](https://www.youtube.com/watch?v=hREnP0HslK8) | 52 min | ⭐ Navigation, files, sudo, pipes, permissions |
| [Command Line Crash Course — Traversy Media](https://www.youtube.com/watch?v=uwAqEzhyjtw) | 45 min | OS-agnostic (Mac/Linux/Windows) |
| [Linux Command Line for Beginners](https://www.youtube.com/watch?v=zl7pIBpLyK8) | 44 min | From basics to shell scripting |

---

## 🔙 Back to tutorials

← [Setup Tutorials Overview](README.md)
