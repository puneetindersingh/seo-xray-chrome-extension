# Privacy Policy, SEO Xray

**Last updated: 16 September 2026**

SEO Xray does not collect, store, transmit or sell any personal data. There is
no account, no API key, no analytics and no server belonging to this project.

## What happens when you open the panel

The extension reads the page in the tab you are on and builds a snapshot of it in
memory. That snapshot never leaves your browser. It is replaced the moment you
navigate, and discarded when you close the panel.

## What happens when you press Run site checks

This is the only action that requests anything over the network, and it never
fires on its own. It requests from the site you are already visiting:

- the page's raw HTML, as the server sends it
- `/robots.txt`
- `/llms.txt` and `/llms-full.txt`
- the XML sitemap named in robots.txt, to check whether the current URL is listed

If you tick the crawler probe checkbox, it repeats the page request two or three
more times with GPTBot, ClaudeBot and PerplexityBot user agent strings, to show
whether the site treats those crawlers differently.

Every one of those requests goes to the site you are on. None goes to any third
party, and none goes to the developer.

## What is stored

One value in `chrome.storage` and browser local storage: which tab of the panel
you had open, and whether the crawler probe checkbox was ticked. That is all, and
it stays on your machine.

## Permissions

`<all_urls>` host access is what lets the panel read whichever tab you are on and
fetch that site's robots.txt. It is not used to watch your browsing. The
extension has no background network activity and no remote code.

## Your data

Because nothing is collected, there is nothing to request, export or delete.
Removing the extension clears its stored settings.

Questions: open an issue on the project repository.
