# 🐙 GitHub Basics — Team Workflow 1×1

> GitHub is where your team shares code, reviews changes, and collaborates. This guide explains the concepts and commands you'll use daily.

📋 **Prerequisites:** Git and GitHub CLI (`gh`) installed and authenticated (see your [OS setup guide](README.md))

---

## 🧠 Key Concepts

### What is GitHub?

Think of it like this:
- **Git** = save system on your computer (local)
- **GitHub** = cloud storage where the team shares saves (remote)

```
💻 Your Computer ── git push ──► 🐙 GitHub ◄── git push ── 💻 Teammate
                 ◄── git pull ──           ── git pull ──►
```

### Branches — Parallel Universes

A **branch** is like a parallel universe of the code. You work on your own branch without affecting others, then merge your changes when you're done.

```
main:        ●───────────────────●  (merge!)
              \                 /
my-feature:    ●── add terrain ──● add clouds
```

| Term | Analogy | Meaning |
|------|---------|---------|
| `main` | The "official" version | Default branch, always working |
| Branch | Parallel universe | Your isolated workspace |
| Commit | Save point | Snapshot of your changes |
| Push | Upload | Send your saves to GitHub |
| Pull | Download | Get the team's latest saves |
| Pull Request (PR) | "Please review my work" | Ask the team to merge your branch |
| Merge | Combine universes | Add your changes to `main` |

---

## 🎓 Your First Pull Request — Walkthrough

This is the exact workflow you'll follow in class. You clone the project, make changes, and send a Pull Request to David for review.

```
📂 Clone → 🌿 Branch → ✏️ Edit → 💾 Commit → 🚀 Push → 📝 PR → 👀 Review → ✅ Merged!
```

### 1. 📂 Clone the project (one time only)

```bash
# Download the project from GitHub
git clone https://github.com/dweigend/neural-flight-template.git
cd neural-flight-template

# Install dependencies
bun install
```

You now have a copy of the project on your computer. You only do this once!

### 2. 🌿 Create your own branch

**Important:** Never work directly on `main`! Always create your own branch first.

**In Zed:**
`Cmd + Shift + P` → type `git branch` → Enter → name it, e.g.:
```
add-my-experience
```

**Or in terminal:**
```bash
git checkout -b add-my-experience
```

**✅ Verify:** The bottom-left of Zed's Git Panel now shows `neural-flight-template / add-my-experience` instead of `main`.

### 3. ✏️ Make your changes

Edit files, create your experience, modify shaders — whatever your task is.

> ⚠️ **This is the critical step!** If you skip this and push an empty branch, your PR will have no changes and GitHub will say _"There isn't anything to compare"_. You **must** change or add at least one file.

### 4. 💾 Commit your changes

**In Zed (Git Panel):**
1. Open Git Panel: `Cmd + Shift + G`
2. You'll see your changed files listed
3. Click **"Stage All"** (top right) — or check individual files
4. Type a commit message in the text field at the bottom:
   ```
   feat: ✨ add underwater experience with coral reef
   ```
5. Press `Cmd + Enter` to commit

**Or in terminal:**
```bash
# See what you changed
git status

# Stage all changes
git add .

# Commit with a message
git commit -m "feat: ✨ add underwater experience with coral reef"
```

**✅ Verify:** The Git Panel shows your commit at the bottom (with an "Uncommit" button).

> ⚠️ **"Nothing to commit"?** You haven't changed any files yet. Go back to step 3 and make some changes first!

### 5. 🚀 Push to GitHub

**In Zed:**
Click the **"Publish"** dropdown (bottom of Git Panel) → **Push**

Or: `Ctrl + G` → `↑` (arrow up)

**Or in terminal:**
```bash
git push -u origin add-my-experience
```

**✅ Verify:** No errors. Your branch is now on GitHub!

> ⚠️ **Push rejected?** If GitHub says you do not have permission to push to `dweigend/neural-flight-template`, stop here and follow [No Push Access? Use a Fork](#-no-push-access-use-a-fork).

### 6. 📝 Create the Pull Request

**In Zed:**
`Cmd + Shift + P` → type `git create pull request` → Enter
→ GitHub opens in your browser with a pre-filled PR form

**Or in terminal:**
```bash
gh pr create --title "feat: ✨ add underwater experience" --body "My first VR experience with a coral reef and fish."
```

**Or on GitHub:**
1. Go to [github.com/dweigend/neural-flight-template](https://github.com/dweigend/neural-flight-template)
2. You'll see a yellow banner: _"add-my-experience had recent pushes"_
3. Click **"Compare & pull request"**
4. Write a title and description → Click **"Create pull request"**

**✅ Done!** David gets notified and will review your code. 🎉

### 7. 👀 Wait for review

David will look at your PR and either:
- ✅ **Approve & Merge** — your code is now in `main`!
- 💬 **Comment** — asks a question or suggests a change
- 🔄 **Request changes** — you need to fix something

**If you need to make changes after the PR:**
```bash
# Make your edits, then:
git add .
git commit -m "fix: 🐛 address review feedback"
git push
```
The PR updates automatically — no need to create a new one!

### 8. 🧹 After your PR is merged

```bash
# Go back to main and get the latest code
git checkout main
git pull

# Delete your old branch (it's merged, you don't need it)
git branch -d add-my-experience
```

Now start again from **Step 2** for your next task!

---

## 🍴 No Push Access? Use a Fork

If you are **not** listed as a contributor on `dweigend/neural-flight-template`, GitHub may reject this command:

```bash
git push -u origin add-my-experience
```

In that case, the workaround is:

```text
original repo → fork to your GitHub account → push to your fork → open PR back to dweigend/neural-flight-template
```

You only need to set up the fork once per computer.

### Option A — Command Line Version

Use this if you want to stay in the terminal and already have `gh` logged in.

#### 1. Create your fork on GitHub

```bash
gh repo fork dweigend/neural-flight-template --clone=false
```

This creates:
- upstream repo: `dweigend/neural-flight-template`
- your fork: `YOUR_GITHUB_USERNAME/neural-flight-template`

#### 2. Rename the original remote to `upstream`

Right now your local repo probably uses `origin` for David's repo. For fork-based work, it is clearer to keep:
- `upstream` = the original class repo
- `origin` = your personal fork

```bash
git remote rename origin upstream
```

#### 3. Add your fork as the new `origin`

Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username.

```bash
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/neural-flight-template.git
```

Check that both remotes exist:

```bash
git remote -v
```

You should see something like:

```text
origin   https://github.com/YOUR_GITHUB_USERNAME/neural-flight-template.git
upstream https://github.com/dweigend/neural-flight-template.git
```

#### 4. Push your branch to your fork

If you already created your branch and commit earlier in this tutorial, push that same branch now:

```bash
git push -u origin add-my-experience
```

From now on, additional updates on the same branch are just:

```bash
git push
```

#### 5. Open a Pull Request from your fork back to the class repo

```bash
gh pr create --repo dweigend/neural-flight-template --base main --head YOUR_GITHUB_USERNAME:add-my-experience --title "feat: ✨ add underwater experience" --body "My first VR experience with a coral reef and fish."
```

This creates a PR with:
- base repo: `dweigend/neural-flight-template`
- base branch: `main`
- head repo: `YOUR_GITHUB_USERNAME/neural-flight-template`
- head branch: `add-my-experience`

#### 6. Keep your fork in sync later

Before your next task, update from the original repo:

```bash
git checkout main
git pull upstream main
git push origin main
```

Then create your next feature branch from updated `main`.

### Option B — GitHub Web UI Version

Use this if you prefer to create the fork in the browser.

#### 1. Create the fork in GitHub

1. Open [github.com/dweigend/neural-flight-template](https://github.com/dweigend/neural-flight-template)
2. Click **Fork** in the top-right
3. Create a new fork under **your own GitHub account**
4. Wait until GitHub creates `YOUR_GITHUB_USERNAME/neural-flight-template`

#### 2. Connect your local repo to both GitHub repos

You already cloned the original repo earlier in this tutorial, so now update the remotes:

```bash
git remote rename origin upstream
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/neural-flight-template.git
git remote -v
```

After this:
- `upstream` points to `dweigend/neural-flight-template`
- `origin` points to your fork

#### 3. Push your branch to your fork

```bash
git push -u origin add-my-experience
```

#### 4. Open the Pull Request in GitHub

1. Open your fork: `https://github.com/YOUR_GITHUB_USERNAME/neural-flight-template`
2. GitHub usually shows a yellow banner for your branch
3. Click **Contribute** → **Open pull request**
4. Make sure the PR compares:
   - base repository: `dweigend/neural-flight-template`
   - base: `main`
   - head repository: `YOUR_GITHUB_USERNAME/neural-flight-template`
   - compare: `add-my-experience`
5. Write the PR title and description
6. Click **Create pull request**

#### 5. Continue updating the same PR

If David asks for changes:

```bash
git add .
git commit -m "fix: 🐛 address review feedback"
git push
```

Because your branch tracks your fork, the existing PR updates automatically.

---

> ### ⚠️ The #1 Mistake: Push without Commit
>
> ```
> ❌ Branch → Push → PR    (PR is empty — "nothing to compare!")
> ✅ Branch → Edit → Commit → Push → PR    (PR shows your changes)
> ```
>
> A Pull Request compares your branch to `main`. If you haven't committed any changes, your branch is identical to `main` and GitHub has nothing to show. **Always commit before you push!**

---

## 🔄 The Daily Workflow (Summary)

Here's what a typical work session looks like:

```
🔄 Pull → 🌿 Branch → ✏️ Code → 💾 Commit → 🚀 Push → 📝 PR → 👀 Review → ✅ Merge
```

### 1. 🔄 Pull the latest changes

Always start by getting the team's latest code:

```bash
# Make sure you're on the main branch
git checkout main

# Download the latest changes
git pull
```

**What you should see:**
```
Already up to date.
```
Or a list of updated files if someone else pushed changes.

### 2. 🌿 Create a new branch

Never work directly on `main`! Create a branch for your feature:

```bash
# Create and switch to a new branch
git checkout -b my-terrain-feature
```

**Naming tips:**
- `add-ocean-experience` ✅ (describes what you're doing)
- `fix-clouds-not-rendering` ✅ (describes the problem)
- `update` ❌ (too vague)
- `test123` ❌ (meaningless)

**✅ Verify:**
```bash
# See which branch you're on
git branch
```

The active branch has a `*` next to it:
```
  main
* my-terrain-feature
```

### 3. ✏️ Write your code

This is where you do your actual work — edit files, create new experiences, modify shaders, etc.

### 4. 💾 Commit your changes

After making changes, save them as a commit:

```bash
# See what you changed
git status
```

You'll see something like:
```
Changes not staged for commit:
  modified:   src/lib/experiences/my-world/scene.ts
  modified:   src/lib/experiences/my-world/manifest.ts

Untracked files:
  src/lib/experiences/my-world/player.ts
```

```bash
# Stage the files you want to commit
git add src/lib/experiences/my-world/

# Create a commit with a descriptive message
git commit -m "feat: ✨ add terrain and clouds to my-world experience"
```

**Commit message format:**

```
type: emoji description

Examples:
feat: ✨ add ocean waves to underwater experience
fix: 🐛 fix clouds not rendering on Quest
refactor: ♻️ simplify player movement logic
docs: 📝 update experience README
style: 🎨 adjust sky gradient colors
```

| Type | Emoji | When to use |
|------|-------|-------------|
| `feat` | ✨ | New feature or functionality |
| `fix` | 🐛 | Bug fix |
| `refactor` | ♻️ | Code restructuring (no new features) |
| `docs` | 📝 | Documentation changes |
| `style` | 🎨 | Visual/style changes |

### 5. 🚀 Push to GitHub

Upload your branch to GitHub:

```bash
# First push of a new branch (sets up tracking)
git push -u origin my-terrain-feature
```

For subsequent pushes on the same branch:

```bash
git push
```

**✅ Verify:** Your branch is now visible on GitHub!

### 6. 📝 Create a Pull Request

A Pull Request (PR) says: _"Hey team, I finished this feature — please review and merge it."_

```bash
# Create a pull request using GitHub CLI
gh pr create --title "feat: ✨ add terrain to my-world" --body "Added procedural terrain and clouds to the my-world experience."
```

The CLI will show you a link to the PR on GitHub.

**Or do it on GitHub:**
1. Go to the repository on [github.com](https://github.com)
2. You'll see a yellow banner: _"my-terrain-feature had recent pushes"_
3. Click **"Compare & pull request"**
4. Add a title and description
5. Click **"Create pull request"**

### 7. 👀 Get a review

Your teammates (or David) will review your code:
- ✅ **Approved** — ready to merge!
- 💬 **Comment** — questions or suggestions
- ❌ **Changes requested** — fix something first

You can check the status:

```bash
# See your open pull requests
gh pr list
```

### 8. ✅ Merge to main

Once approved, merge your PR:

```bash
# Merge via CLI
gh pr merge
```

Or click **"Merge pull request"** on GitHub.

After merging, clean up:

```bash
# Switch back to main
git checkout main

# Get the merged changes
git pull

# Delete the old branch (optional)
git branch -d my-terrain-feature
```
---

## 🍴 No Push Access? Use a Fork

If you are **not** listed as a contributor on `dweigend/neural-flight-template`, GitHub may reject this command:

```bash
git push -u origin add-my-experience
```

In that case, the workaround is:

```text
original repo → fork to your GitHub account → push to your fork → open PR back to dweigend/neural-flight-template
```

You only need to set up the fork once per computer.

### Option A — Command Line Version

Use this if you want to stay in the terminal and already have `gh` logged in.

#### 1. Create your fork on GitHub

```bash
gh repo fork dweigend/neural-flight-template --clone=false
```

This creates:
- upstream repo: `dweigend/neural-flight-template`
- your fork: `YOUR_GITHUB_USERNAME/neural-flight-template`

#### 2. Rename the original remote to `upstream`

Right now your local repo probably uses `origin` for David's repo. For fork-based work, it is clearer to keep:
- `upstream` = the original class repo
- `origin` = your personal fork

```bash
git remote rename origin upstream
```

#### 3. Add your fork as the new `origin`

Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username.

```bash
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/neural-flight-template.git
```

Check that both remotes exist:

```bash
git remote -v
```

You should see something like:

```text
origin   https://github.com/YOUR_GITHUB_USERNAME/neural-flight-template.git
upstream https://github.com/dweigend/neural-flight-template.git
```

#### 4. Push your branch to your fork

If you already created your branch and commit earlier in this tutorial, push that same branch now:

```bash
git push -u origin add-my-experience
```

From now on, additional updates on the same branch are just:

```bash
git push
```

#### 5. Open a Pull Request from your fork back to the class repo

```bash
gh pr create --repo dweigend/neural-flight-template --base main --head YOUR_GITHUB_USERNAME:add-my-experience --title "feat: ✨ add underwater experience" --body "My first VR experience with a coral reef and fish."
```

This creates a PR with:
- base repo: `dweigend/neural-flight-template`
- base branch: `main`
- head repo: `YOUR_GITHUB_USERNAME/neural-flight-template`
- head branch: `add-my-experience`

#### 6. Keep your fork in sync later

Before your next task, update from the original repo:

```bash
git checkout main
git pull upstream main
git push origin main
```

Then create your next feature branch from updated `main`.

### Option B — GitHub Web UI Version

Use this if you prefer to create the fork in the browser.

#### 1. Create the fork in GitHub

1. Open [github.com/dweigend/neural-flight-template](https://github.com/dweigend/neural-flight-template)
2. Click **Fork** in the top-right
3. Create a new fork under **your own GitHub account**
4. Wait until GitHub creates `YOUR_GITHUB_USERNAME/neural-flight-template`

#### 2. Connect your local repo to both GitHub repos

You already cloned the original repo earlier in this tutorial, so now update the remotes:

```bash
git remote rename origin upstream
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/neural-flight-template.git
git remote -v
```

After this:
- `upstream` points to `dweigend/neural-flight-template`
- `origin` points to your fork

#### 3. Push your branch to your fork

```bash
git push -u origin add-my-experience
```

#### 4. Open the Pull Request in GitHub

1. Open your fork: `https://github.com/YOUR_GITHUB_USERNAME/neural-flight-template`
2. GitHub usually shows a yellow banner for your branch
3. Click **Contribute** → **Open pull request**
4. Make sure the PR compares:
   - base repository: `dweigend/neural-flight-template`
   - base: `main`
   - head repository: `YOUR_GITHUB_USERNAME/neural-flight-template`
   - compare: `add-my-experience`
5. Write the PR title and description
6. Click **Create pull request**

#### 5. Continue updating the same PR

If David asks for changes:

```bash
git add .
git commit -m "fix: 🐛 address review feedback"
git push
```

Because your branch tracks your fork, the existing PR updates automatically.
---

## 🆘 Common Situations

### "I made changes on the wrong branch!"

```bash
# Stash (temporarily save) your changes
git stash

# Switch to the correct branch
git checkout correct-branch

# Apply the stashed changes
git stash pop
```

### "I want to undo my last commit"

```bash
# Undo the last commit but keep the changes
git reset --soft HEAD~1
```

### "Someone else changed the same file!"

This is called a **merge conflict**. Git can't automatically combine the changes, so you need to choose.

```bash
# Update your branch with the latest main
git checkout main
git pull
git checkout my-feature
git merge main
```

If there's a conflict, Git marks the file:
```
<<<<<<< HEAD
your version of the code
=======
their version of the code
>>>>>>> main
```

**Fix it by:**
1. Open the file in Zed
2. Choose which version to keep (or combine both)
3. Remove the `<<<<<<<`, `=======`, and `>>>>>>>` markers
4. Save the file
5. `git add .` → `git commit -m "fix: 🐛 resolve merge conflict"`

> 💡 **Don't panic!** Merge conflicts look scary but are normal. Ask for help if you're unsure.

### "I want to see what my teammates are working on"

```bash
# List all open pull requests
gh pr list

# View a specific PR in the terminal
gh pr view 42

# Open a PR in the browser
gh pr view 42 --web
```

---

## 📋 Quick Reference

### Daily Commands

```bash
# Start of session
git checkout main           # go to main branch
git pull                    # get latest changes
git checkout -b my-feature  # create new branch

# While working
git status                  # what changed?
git diff                    # see exact changes
git add .                   # stage all changes
git commit -m "feat: ✨ ..."  # save changes
git push                    # upload to GitHub

# When done
gh pr create                # create pull request
gh pr list                  # see open PRs
gh pr merge                 # merge after approval
```

### Useful `gh` Commands

```bash
gh pr list                  # list open pull requests
gh pr create                # create a new PR
gh pr view 42               # view PR #42
gh pr checkout 42           # switch to PR #42's branch
gh pr merge                 # merge current PR
gh issue list               # list open issues
gh issue create             # create a new issue
gh repo view --web          # open the repo in browser
```

---

## 📌 Cheat Sheet

```
BRANCHES              SAVING                 GITHUB
─────────             ─────────              ─────────
checkout -b = create  add .   = stage        push     = upload
checkout    = switch  commit  = save         pull     = download
branch      = list    status  = what changed gh pr    = pull request
branch -d   = delete  diff    = show changes gh issue = issues

WORKFLOW: pull → branch → code → add → commit → push → PR → merge
```

---

## 📺 Video Resources

Want to see this in action? These videos explain Git & GitHub visually:

| Video | Duration | What you'll learn |
|-------|----------|-------------------|
| [Git and GitHub Course For Beginners](https://www.youtube.com/watch?v=bFHwtm6FQ4c) | 30 min | ⭐ Best quick start — setup to Pull Requests |
| [Visualized Git Course](https://www.youtube.com/watch?v=S7XpTAnSDL4) | 1h 12min | Branches + PRs shown as visual diagrams |
| [Git & GitHub Crash Course](https://www.youtube.com/watch?v=l2yrJtwoC_E) | ~1h | CLI + GitHub UI, includes rebase |
| [Git Tutorial for Beginners](https://www.youtube.com/watch?v=5bVCXWGOJhM) | 40 min | Practical project + stash + PRs |

---

## 🔙 Back to tutorials

← [Setup Tutorials Overview](README.md) · [Terminal Basics](terminal-basics.md)
