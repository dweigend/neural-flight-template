# 🤝 Collaboration on the Same Branch

> Use this guide when two people want to work together on one shared Git branch.

📋 **Prerequisites:** Both partners have cloned the project, installed dependencies, and can push to the GitHub repository.

---

## ⚠️ Before You Start

Working on the same branch is possible, but it requires discipline:

- Talk before editing the same files.
- Pull before you start working.
- Commit small changes often.
- Push when your work is in a working state.
- Tell your partner after you push.

If both people edit the same lines at the same time, Git may create a **merge conflict** that must be fixed manually.

---

## 🧭 Shared Branch Workflow

```
Partner A creates branch → pushes it → Partner B checks it out
Both partners: pull → edit → commit → pull again → push
```

---

## 1. Decide on a Branch Name

Pick one branch name for the shared work.

Good examples:

```bash
shared-underwater-experience
team-crystal-world
pair-flight-ui
```

Avoid vague names like:

```bash
test
update
new-stuff
```

---

## 2. Partner A Creates the Branch

Partner A starts from the latest `main`:

```bash
git checkout main
git pull
git checkout -b shared-underwater-experience
```

Then Partner A pushes the branch to GitHub:

```bash
git push -u origin shared-underwater-experience
```

✅ The shared branch now exists on GitHub.

---

## 3. Partner B Downloads the Branch

Partner B gets the new branch from GitHub:

```bash
git fetch
git checkout shared-underwater-experience
```

If that does not work, use:

```bash
git checkout -b shared-underwater-experience origin/shared-underwater-experience
```

✅ Both partners are now on the same branch.

Verify with:

```bash
git branch
```

The active branch has a `*` next to it:

```bash
  main
* shared-underwater-experience
```

---

## 4. Daily Work Routine

Each time you start working, pull the latest version:

```bash
git pull
```

Then make your changes.

Before committing, check what changed:

```bash
git status
```

Stage and commit your work:

```bash
git add .
git commit -m "feat: add coral terrain"
```

Before pushing, pull again in case your partner pushed while you were working:

```bash
git pull
```

Then push:

```bash
git push
```

✅ Tell your partner when you push so they know to pull.

---

## 5. Avoid Editing the Same Files

The easiest way to avoid conflicts is to split responsibilities.

Example:

| Partner | Owns |
|---------|------|
| Partner A | `src/lib/experiences/underwater/scene.ts` |
| Partner B | `src/lib/experiences/underwater/materials.ts` |

If you both need to edit the same file, talk first and take turns.

---

## 6. If Git Says Your Push Was Rejected

This usually means your partner pushed first.

Run:

```bash
git pull
```

If Git merges cleanly, push again:

```bash
git push
```

If Git reports a conflict, continue to the next section.

---

## 7. Fixing a Merge Conflict

A conflict looks like this inside a file:

```text
<<<<<<< HEAD
your version
=======
your partner's version
>>>>>>> shared-underwater-experience
```

To fix it:

1. Open the conflicted file.
2. Decide which code to keep.
3. Delete the conflict markers:

```text
<<<<<<< HEAD
=======
>>>>>>>
```

4. Save the file.
5. Stage and commit the fix:

```bash
git add .
git commit -m "fix: resolve merge conflict"
git push
```

✅ After this, your partner should run:

```bash
git pull
```

---

## 8. Create One Pull Request for the Shared Branch

When the shared branch is ready, create a Pull Request from the shared branch into `main`.

Using GitHub CLI:

```bash
gh pr create --title "feat: add underwater experience" --body "Shared work by both partners."
```

Or on GitHub:

1. Go to the repository page.
2. Click **Compare & pull request**.
3. Make sure the branch is `shared-underwater-experience`.
4. Add both partners in the description.
5. Click **Create pull request**.

---

## ✅ Quick Command Summary

Partner A creates the branch:

```bash
git checkout main
git pull
git checkout -b shared-underwater-experience
git push -u origin shared-underwater-experience
```

Partner B joins the branch:

```bash
git fetch
git checkout shared-underwater-experience
```

Both partners use this routine:

```bash
git pull
git status
git add .
git commit -m "describe your change"
git pull
git push
```

---

## 🧠 Rule of Thumb

Pull before you work. Commit small. Pull before you push. Communicate when you push.
