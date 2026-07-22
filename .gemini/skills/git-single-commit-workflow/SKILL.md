---
name: git-single-commit-workflow
description: Enforces phased refactoring with working tree checkpoints and a single final release commit.
---

# Git Single Commit Workflow for Phased Rollouts

When performing code reviews, multi-phase refactorings, or feature rollouts:

1. **Working Tree Checkpoints**:
   - Checkpoint progress after each phase in the working tree (`git status` shows uncommitted changes).
   - Do NOT create intermediate git commits per phase.
2. **Phase Gate Approvals**:
   - Pause and request explicit user confirmation before advancing to the next phase.
3. **Single Final Release Commit**:
   - Stage all phase modifications (`git add .`) alongside `CHANGELOG.md` updates.
   - Create one single consolidated commit upon final phase completion:
     `git commit -m "fix(vX.Y.Z): summary of rollout changes"`
