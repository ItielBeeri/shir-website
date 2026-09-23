#!/bin/sh
# Vercel's Ignored Build Step for both projects: exit 0 skips the build, exit 1
# builds, and any other code fails the deployment. Every path out of here is
# therefore an explicit 0 or 1, and 0 only when nothing listed in "$@" changed.
#
# Only production is ever skipped. A preview is found by its commit (the
# editor's `status` action), so a skipped preview leaves that commit with no
# deployment and the preview screen waiting for one that never comes.
#
# VERCEL_GIT_PREVIOUS_SHA can name a commit the clone does not have: the clone
# is shallow, and the editor force-moves its branches, which orphans commits.
# `git diff` then exits 128 - and since the previous sha only advances on a
# successful deployment, every later build fails the same way. Fetching the
# commit by id usually recovers it; when it cannot, build.

[ "${VERCEL_ENV:-}" = production ] || exit 1

prev=${VERCEL_GIT_PREVIOUS_SHA:-}
[ -n "$prev" ] || exit 1

if ! git cat-file -e "$prev^{commit}" 2>/dev/null; then
  git fetch --quiet --depth=1 origin "$prev" 2>/dev/null || exit 1
fi

git diff --quiet "$prev" HEAD -- "$@" && exit 0
exit 1
