# Reddit Private Karma & Tags (Opera extension)

A local-only Reddit helper that adds:
- private upvote/downvote tracking per user, per comment
- total karma display next to usernames
- tag chips next to usernames
- tag management and vote history in the options page

## How it works

- It only activates on Reddit comment threads.
- Votes are stored locally in your browser, not on Reddit.
- Each vote stores a comment link in history.
- The options page lets you edit user tags, remove users, rename/delete tags, and export/import data.

## Install 

1. Clone this repository to a folder
2. Open the extensions manager
3. Enable Developer mode
4. Click `Load unpacked`
5. Select this folder

Tested in Chrome and Opera.

## Notes

If you install it, refresh Reddit and nothing happens, it may be due to:

- DOM hydration
- Several other extensions are still loading

Give it a minute and refresh the page again.
