# GitHub CLI (`gh`) Cheat Sheet

`git` talks to your **repository**. `gh` talks to the **GitHub website**: pull requests, reviews, CI, issues and releases, all from the terminal.
For plain Git commands, see [GIT_CHEATSHEET.md](GIT_CHEATSHEET.md).

| Tool | Works with | Examples |
|---|---|---|
| `git` | Commits, branches, history (on your computer) | `git commit`, `git push`, `git merge` |
| `gh` | GitHub features (on the website) | `gh pr create`, `gh pr merge`, `gh run watch` |

---

## 1. Install and log in (one time)

### Install on Windows
```powershell
winget install --id GitHub.cli
```
If winget asks to accept source agreements, type `Y`.

### IMPORTANT: restart your terminal
Close VS Code completely and open it again. Otherwise you get:
```
gh : The term 'gh' is not recognized as the name of a cmdlet...
```

### Check it works
```powershell
gh --version
```

### Log in
```powershell
gh auth login
```
Choose: **GitHub.com** → **HTTPS** → **Yes** (authenticate Git) → **Login with a web browser**.
Copy the code it shows, press Enter, paste the code in the browser page.

```powershell
gh auth status       # am I logged in? which account?
gh auth logout       # log out
gh auth refresh      # fix expired or missing permissions
```

### Optional settings
```powershell
gh config set editor "code --wait"   # use VS Code to write PR descriptions
gh config set git_protocol https
```

---

## 2. Repositories

```bash
gh repo create my-api --private --source . --remote origin --push
#   create a GitHub repo from the current folder, connect it, and push

gh repo clone USERNAME/REPO     # download a repo (shorter than git clone)
gh repo view                    # info about the current repo
gh repo view --web              # open the repo in the browser
gh repo list                    # your repos
gh repo fork USERNAME/REPO      # copy someone else's repo to your account
```

---

## 3. Pull requests: the full flow

### Step 1. Create the PR (after `git push -u origin feature/x`)
```bash
gh pr create --base main --title "Add orders feature" --body "Order model, controller, routes, docs and tests"
```

Useful options:

| Option | What it does |
|---|---|
| `--fill` | Use your commit messages as title and body |
| `--draft` | Mark as "not ready yet" (no merge until you say so) |
| `--web` | Finish creating it in the browser |
| `--reviewer USER` | Ask a teammate to review |
| `--assignee @me` | Assign it to yourself |
| `--label bug` | Add a label |
| `--body-file pr.md` | Read the description from a file |

```bash
gh pr create --fill                        # quickest way
gh pr create --draft --fill                # work in progress
gh pr ready                                # draft → ready for review
```

### Step 2. Look at it
```bash
gh pr view                     # the PR for your current branch
gh pr view --web               # open it in the browser ("Files changed" tab)
gh pr diff                     # see the changes in the terminal
gh pr checks                   # did CI tests pass?
gh pr status                   # PRs involving you
gh pr list                     # all open PRs
gh pr list --state merged      # merged PRs
```

### Step 3. Fix things after feedback
Just commit and push to the same branch. The PR updates automatically.
```bash
git add .
git commit -m "fix: handle empty items array"
git push
```

### Step 4. Merge
```bash
gh pr merge --merge --delete-branch     # keep all commits + a merge commit
gh pr merge --squash --delete-branch    # combine all commits into one (most common at companies)
gh pr merge --rebase --delete-branch    # put commits on top of main, no merge commit
gh pr merge --auto --squash             # merge automatically when CI passes
```

| Merge type | History looks like | Use when |
|---|---|---|
| `--merge` | All commits + "Merge pull request #N" | You want full detail |
| `--squash` | One commit per PR | You want a clean main (most teams) |
| `--rebase` | All commits in a straight line | Team prefers linear history |

`--delete-branch` deletes the branch on GitHub AND locally, and switches you to main.

### Step 5. Check (always!)
```bash
git switch main
git pull
git log --oneline -5           # your work must be here
```

### Other PR actions
```bash
gh pr edit --title "New title" --add-label enhancement
gh pr comment --body "Updated, please check again"
gh pr close 12                 # close without merging
gh pr reopen 12
```

---

## 4. Reviewing a teammate's PR

```bash
gh pr list                                  # find the PR number
gh pr checkout 15                           # download PR #15 as a local branch
npm install && npm test                     # try it yourself
gh pr diff 15                               # read the changes
gh pr review 15 --approve -b "Looks good"
gh pr review 15 --request-changes -b "Please add a test for empty items"
gh pr review 15 --comment -b "Question: why 100 as max quantity?"
git switch main                             # go back when done
```

---

## 5. CI: GitHub Actions

```bash
gh run list                    # recent CI runs
gh run watch                   # watch the current run live
gh run view                    # details of the latest run
gh run view --log-failed       # only the logs of failed steps (best for debugging)
gh run rerun --failed          # retry only the failed jobs
gh workflow list               # all workflows in the repo
gh workflow run test.yml       # start a workflow manually
```

---

## 6. Issues (tasks and bugs)

```bash
gh issue create --title "Seller can delete other sellers' products" --body "..." --label bug
gh issue list                  # open issues
gh issue list --assignee @me   # my issues
gh issue view 7
gh issue view 7 --web
gh issue comment 7 --body "Working on it"
gh issue close 7
gh issue develop 7 --checkout  # create a branch linked to issue #7 and switch to it
```

Link a PR to an issue: write `Closes #7` in the PR body. Merging the PR closes the issue automatically.
```bash
gh pr create --fill --body "Closes #7"
```

---

## 7. Releases

```bash
git tag -a v1.0.0 -m "First release"
git push origin v1.0.0
gh release create v1.0.0 --generate-notes        # release page, notes made from merged PRs
gh release create v1.0.1 --title "Hotfix" --notes "Fix login crash"
gh release list
gh release view v1.0.0 --web
```

---

## 8. Handy extras

```bash
gh browse                      # open the repo in the browser
gh browse src/app.js           # open a specific file on GitHub
gh browse 12                   # open issue or PR #12
gh status                      # your PRs, reviews and mentions across all repos
gh secret set JWT_PASS         # add a secret for GitHub Actions (prompts for the value)
gh secret list
gh alias set prc 'pr create --fill'   # shortcut: now "gh prc" = "gh pr create --fill"
gh alias list
gh help                        # all commands
gh pr create --help            # help for one command
```

---

## 9. The full feature cycle with `git` + `gh`

```bash
# 1. start
git switch main
git pull
git switch -c feature/product-ownership

# 2. build, test, commit (repeat)
npm test
git add .
git commit -m "feat: link products to their seller"

# 3. upload + open PR
git push -u origin feature/product-ownership
gh pr create --fill

# 4. check CI and review
gh pr checks
gh pr view --web

# 5. merge
gh pr merge --squash --delete-branch

# 6. CHECK before anything else
git pull
git log --oneline -5

# 7. next feature
git switch -c feature/next-thing
```

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| `gh : The term 'gh' is not recognized` | Install it (section 1), then **restart VS Code** |
| `winget` is not recognized | Install "App Installer" from the Microsoft Store, or download gh from cli.github.com |
| `To get started with GitHub CLI, please run: gh auth login` | Run `gh auth login` |
| `HTTP 401` / `Bad credentials` | `gh auth refresh` or `gh auth login` again |
| `no pull requests found for branch` | Push the branch first: `git push -u origin <branch>` |
| `a pull request for branch already exists` | Use `gh pr view` instead of creating a new one |
| `Pull request is not mergeable` | Conflicts with main. Update your branch: `git merge origin/main`, fix conflicts, push |
| `gh pr merge` says checks are failing | `gh run view --log-failed`, fix the problem, push again |
| `could not determine base repo` | Run inside the project folder, or add `--repo USERNAME/REPO` |
