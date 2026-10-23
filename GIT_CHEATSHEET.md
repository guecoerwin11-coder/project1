# Git Cheat Sheet

A practical guide from your first `git init` to the commands senior developers use in production.
For GitHub CLI (`gh`) commands, see [GH_CLI_CHEATSHEET.md](GH_CLI_CHEATSHEET.md).

---

## 0. The mental model

| Word | Think of it as |
|---|---|
| **Repository (repo)** | The project folder that Git watches |
| **Commit** | A save point in a video game |
| **Branch** | A separate save slot where you try things safely |
| **main** | The save slot that must always work |
| **Staging (`git add`)** | The "ready to save" box |
| **Remote / origin** | Your copy on GitHub, the cloud backup |
| **Push** | Upload your commits to GitHub |
| **Pull** | Download and apply new commits from GitHub |
| **Merge** | Bring one branch's commits into another |
| **Pull Request (PR)** | A request to merge, with a page for review |

The golden rule: **never delete a branch until you have seen its commits on main.**

---

## 1. One-time setup on a new computer

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git config --global init.defaultBranch main
git config --global core.autocrlf true      # Windows: handles line endings
git config --global pull.rebase false       # pull = fetch + merge (beginner friendly)
git config --list                           # check your settings
```

Install the GitHub CLI once: see [GH_CLI_CHEATSHEET.md](GH_CLI_CHEATSHEET.md), section 1.

---

## 2. Flow A: New project, from `git init` to GitHub

### Step 1. Start Git in your project folder
```bash
cd path/to/project
git init
```

### Step 2. Create a `.gitignore` BEFORE the first commit
Things that must never be committed:
```
node_modules
.env
logs/
/generated
```

### Step 3. Make the first commit
```bash
git status                 # check what will be saved, no .env or node_modules!
git add .
git commit -m "Initial commit"
```

### Step 4. Make sure the branch is called main
```bash
git branch -M main
```

### Step 5. Create the repo on GitHub and connect it

**Option 1: GitHub website**
1. Go to github.com, click **New repository**.
2. Do NOT add a README or .gitignore there (your folder already has files).
3. Copy the URL, then:
```bash
git remote add origin https://github.com/USERNAME/REPO.git
git remote -v              # check the link
```

**Option 2: GitHub CLI** (creates and connects in one step)
```bash
gh repo create REPO --private --source . --remote origin
```

### Step 6. First push
```bash
git push -u origin main
```
`-u` links your local main to GitHub's main. After this, plain `git push` and `git pull` work.

### Joining an existing project instead
```bash
git clone https://github.com/USERNAME/REPO.git
cd REPO
npm install                # install dependencies
cp .env.example .env       # create your own secrets file
```

---

## 3. Flow B: The feature branch cycle

Repeat this cycle for every feature or fix.

### Phase 1: Start
```bash
git switch main
git pull                                   # always start from the newest main
git switch -c feature/product-ownership    # create + move to new branch
git status                                 # must say: On branch feature/...
```

Branch name prefixes:

| Prefix | Use for |
|---|---|
| `feature/` | Something new |
| `fix/` | A bug fix |
| `hotfix/` | An urgent fix for production |
| `refactor/` | Cleaning code without changing behavior |
| `docs/` | Documentation only |
| `test/` | Adding or fixing tests only |
| `chore/` | Dependencies, configs, tooling |

### Phase 2: Build and save, in small steps
```bash
# ...write one small piece of code...
npm test                                   # tests must pass
git status                                 # what changed?
git diff                                   # exact lines changed
git add .                                  # or: git add path/to/file
git commit -m "Add owner relation to Product"
# ...repeat for each piece...
```

### Phase 3: Upload the branch
```bash
git push -u origin feature/product-ownership   # first time
git push                                       # every time after
```

### Phase 4: Merge into main

**Way A: Pull Request (professional way)**
```bash
gh pr create --base main --title "Add product ownership" --body "What and why"
gh pr view --web          # review "Files changed" in the browser
gh pr merge --merge       # or --squash to combine commits into one
```
Or click **Compare & pull request** on the GitHub website.

**Way B: Plain Git (solo practice only)**
```bash
git switch main
git pull
git merge --no-ff feature/product-ownership
npm test
git push
```

### Phase 5: CHECK before cleaning up
```bash
git switch main
git pull
git log --oneline -5      # your commits or a "Merge" commit MUST be here
npm test
```
If your work is not on main: **STOP. Do not delete anything.**

### Phase 6: Clean up
```bash
git branch -d feature/product-ownership              # local
git push origin --delete feature/product-ownership   # GitHub (skip if PR already deleted it)
```
If Git says **"not fully merged"**, STOP. Your work is not on main yet. Go back to Phase 4.
Never force it with `-D` unless you really want to throw the work away.

### Phase 7: Next feature
```bash
git switch main
git pull
git switch -c feature/next-thing
```

### The cycle at a glance

```
 main ──●────────────────────●── (merge) ──●──
         \                  /
 feature  ●──●──●──●──●──●─
          create  commits  push → PR → merge → check → delete
```

---

## 4. Flow C: Database (Prisma) changes on a branch

```bash
# 1. edit prisma/schema.prisma
npx prisma migrate dev --name add_orders --config prisma7.config.js
# 2. commit the schema AND the migration together
git add prisma/schema.prisma prisma/migrations
git commit -m "Add Order model and migration"
```

Rules:
- Never change the schema directly on main.
- Never edit an old migration that is already merged. Create a new one.
- **Switching branches does NOT switch your database.** If you abandon a branch with a migration, reset your LOCAL database:
  ```bash
  npx prisma migrate reset --config prisma7.config.js   # DELETES ALL LOCAL DATA
  ```
- In production, use `npx prisma migrate deploy` (applies migrations, never creates or resets).

---

## 5. Writing good commit messages

Say **what** changed, in the present tense, like a command.

| Bad | Good |
|---|---|
| `update` | `Add create product endpoint` |
| `fix stuff` | `Fix login reading userName instead of email` |
| `asdf` | `Reject requests with expired tokens` |

Many teams use **Conventional Commits**:

```
feat: add product ownership
fix: reject expired tokens in auth middleware
docs: document 403 response for products
test: add role-based access tests
refactor: extract product validation
chore: upgrade prisma to 7.11
```

Need more detail? Add a blank line and a body:
```bash
git commit -m "fix: reject invalid tokens" -m "The catch block called next() without the error, so any token passed."
```

---

## 6. Commands senior developers use in production

### 6.1 Looking around (safe, changes nothing)

```bash
git status                          # where am I, what changed?
git log --oneline                   # short history
git log --oneline --graph --all     # history with branch lines
git log main..HEAD                  # commits on my branch not yet on main
git log -p path/to/file             # every change ever made to a file
git log --author="name"             # commits by one person
git log --since="2 weeks ago"       # recent commits
git show <commit>                   # what one commit changed
git show --stat <commit>            # which files one commit changed
git diff                            # unstaged changes
git diff --staged                   # staged changes (what will be committed)
git diff main..feature/x            # difference between two branches
git blame path/to/file              # who last changed each line, and when
git branch -vv                      # branches + their GitHub link + last commit
git branch -a                       # local and GitHub branches
git remote -v                       # GitHub address
```

### 6.2 Staying in sync

```bash
git fetch                           # download news, change nothing
git fetch --prune                   # also forget branches deleted on GitHub
git pull                            # fetch + merge into current branch
git pull --rebase                   # fetch + put your commits on top (cleaner history)
```

**Update your feature branch with new commits from main:**
```bash
git switch feature/x
git fetch
git merge origin/main               # safe, adds a merge commit
# or
git rebase origin/main              # cleaner history, rewrites YOUR branch commits
git push --force-with-lease         # needed after rebase if branch was already pushed
```
`--force-with-lease` refuses to overwrite if someone else pushed in the meantime.
**Never** use plain `--force`, and **never** force push to main.

### 6.3 Merge conflicts

A conflict happens when two branches changed the same lines.

```bash
git merge feature/x                 # Git says: CONFLICT in file.js
git status                          # lists conflicted files
```

Inside the file you will see:
```
<<<<<<< HEAD
code on your current branch
=======
code from the other branch
>>>>>>> feature/x
```

1. Edit the file: keep the right code, delete the `<<<<<<<`, `=======`, `>>>>>>>` lines.
2. Then:
```bash
npm test
git add file.js
git commit                          # finishes the merge
```
Want to give up? `git merge --abort` puts everything back.
(During a rebase: `git rebase --continue` or `git rebase --abort`.)

### 6.4 Undoing things

| Situation | Command | Safe? |
|---|---|---|
| Throw away changes in a file (not staged) | `git restore file.js` | Loses those edits |
| Unstage a file (keep the edits) | `git restore --staged file.js` | Safe |
| Fix the last commit message (not pushed yet) | `git commit --amend -m "New message"` | Safe if not pushed |
| Add a forgotten file to the last commit (not pushed yet) | `git add file.js` then `git commit --amend --no-edit` | Safe if not pushed |
| Undo the last commit, keep the changes | `git reset --soft HEAD~1` | Safe if not pushed |
| Undo a commit that is ALREADY pushed | `git revert <commit>` | **Safest**, creates an "undo" commit |
| Delete the last commit AND its changes | `git reset --hard HEAD~1` | **Dangerous** |
| Delete untracked files | `git clean -n` (preview) then `git clean -fd` | **Dangerous** |

Rule: **pushed commits are shared history. Use `revert`, never `reset`, on them.**

### 6.5 Stash: the drawer for unfinished work

```bash
git stash push -m "half-done orders"   # put changes in the drawer
git stash -u                           # also include new untracked files
git stash list                         # see the drawer
git stash pop                          # take the newest back out
git stash apply stash@{1}              # take a specific one, keep it in drawer
git stash drop stash@{0}               # throw one away
```
Use it when you must switch branches but are not ready to commit.

### 6.6 Rescue: getting "lost" work back

```bash
git reflog                             # every place HEAD has been, even deleted branches
git branch rescue-branch <commit>      # bring a lost commit back as a branch
git switch -c rescue-branch            # if you are in "detached HEAD"
```
Deleting a branch only deletes its NAME. Commits stay in Git for about 30+ days.
**Files that were never committed cannot be rescued by Git.** Commit early.

### 6.7 Cherry-pick: copy one commit to another branch

```bash
git switch main
git cherry-pick <commit>               # copy one specific commit here
```
Used for: "that one fix on feature/x is needed in production NOW".

### 6.8 Tags and releases

```bash
git tag -a v1.0.0 -m "First release"   # mark this commit as a version
git push origin v1.0.0                 # upload the tag
git tag                                # list tags
```
Versioning (SemVer): `MAJOR.MINOR.PATCH`
- `PATCH` (1.0.1): bug fix
- `MINOR` (1.1.0): new feature, nothing breaks
- `MAJOR` (2.0.0): breaking change

To make a GitHub release page from a tag, see [GH_CLI_CHEATSHEET.md](GH_CLI_CHEATSHEET.md), section 7.

### 6.9 Hotfix flow: production is broken right now

```bash
git switch main
git pull
git switch -c hotfix/login-crash
# fix + add a test that proves the bug is gone
npm test
git commit -am "fix: prevent crash when email is missing"
git push -u origin hotfix/login-crash
gh pr create --base main --title "Hotfix: login crash" --body "..."
# after merge:
git switch main && git pull
git tag -a v1.0.1 -m "Hotfix login crash" && git push origin v1.0.1
```

### 6.10 Bisect: find which commit broke something

```bash
git bisect start
git bisect bad                         # current version is broken
git bisect good v1.0.0                 # this old version worked
# Git checks out a middle commit. Test it, then say:
git bisect good                        # or: git bisect bad
# ...repeat until Git names the guilty commit...
git bisect reset                       # go back to normal
```

### 6.11 GitHub CLI

All `gh` commands (pull requests, reviews, CI, issues, releases) are in
[GH_CLI_CHEATSHEET.md](GH_CLI_CHEATSHEET.md).

---

## 7. How it works at a real company

```
1. Ticket/issue assigned to you
2. git switch main && git pull
3. git switch -c feature/ticket-123-short-name
4. Code + tests, small commits
5. git push -u origin feature/...
6. Open Pull Request
7. CI robot runs tests automatically (GitHub Actions)
   ✗ fail → fix, push again
   ✓ pass → continue
8. Teammate reviews code → asks for changes or approves
9. Merge (usually "Squash and merge")
10. main auto-deploys to STAGING → QA tests it
11. Tag a release → deploy to PRODUCTION
12. Monitor logs; if broken → hotfix flow or git revert
```

Protections teams turn on for `main` (GitHub → Settings → Branches):
- Require a pull request before merging (no direct pushes to main)
- Require at least 1 approval
- Require CI tests to pass
- Block force pushes

---

## 8. Danger zone

| Command | Why it is dangerous | Safer choice |
|---|---|---|
| `git push --force` | Can erase teammates' work | `git push --force-with-lease` |
| `git reset --hard` | Deletes uncommitted work forever | `git stash` first |
| `git branch -D` | Deletes an unmerged branch | `git branch -d` (refuses if unmerged) |
| `git clean -fd` | Deletes untracked files forever | `git clean -n` to preview first |
| `git rebase` on main | Rewrites shared history | Only rebase YOUR feature branch |
| Committing `.env` | Leaks passwords and secrets | Add `.env` to `.gitignore` before first commit |
| `prisma migrate reset` | Deletes all database data | Only on your local dev database |

**Leaked a secret?** Removing the file in a new commit is NOT enough, it is still in history.
Change the password/key immediately, then clean the history.

---

## 9. Troubleshooting

| Message / problem | Meaning | Fix |
|---|---|---|
| `HEAD detached` / `(no branch)` | You are not on any branch | `git switch -c new-branch-name` to keep your work |
| `not fully merged` | The branch has work that is not on main | Merge it first, do not force delete |
| `rejected ... fetch first` | GitHub has commits you don't have | `git pull`, then push again |
| `CONFLICT` | Two branches changed the same lines | See section 6.3 |
| `LF will be replaced by CRLF` | Windows line ending notice | Harmless, ignore it |
| Committed on the wrong branch (not pushed) | | `git reset --soft HEAD~1`, `git stash`, switch branch, `git stash pop`, commit |
| Files disappeared after `git switch` | They belong to the other branch | Switch back to that branch, or merge it |
| Deleted a branch by mistake | | `git reflog`, then `git branch name <commit>` |
| A new file vanished and Git can't find it | It was never committed | Recreate it, then commit right away |
| `package.json` not found (`backend\backend`) | Wrong terminal folder | Check the folder in your prompt; use `cd` |
| `gh` is not recognized | GitHub CLI not installed or terminal not restarted | See [GH_CLI_CHEATSHEET.md](GH_CLI_CHEATSHEET.md), section 1 |

---

## 10. The daily ten

```bash
git status                          # where am I?
git switch main                     # go to main
git pull                            # get the latest
git switch -c feature/name          # start a branch
git add .                           # stage
git commit -m "What changed"        # save point
git push -u origin feature/name     # first upload
git push                            # later uploads
git log --oneline                   # history
git stash / git stash pop           # put work aside / bring it back
```
