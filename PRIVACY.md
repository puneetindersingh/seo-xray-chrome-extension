# Privacy Policy, SEO Side Panel

**Last updated: 17 September 2026**

SEO Side Panel does not collect, store, transmit or sell any personal data. There is
no account, no API key, no analytics and no server belonging to this project.

## What happens when you open the panel

The extension reads the page in the tab you are on and builds a snapshot of it in
memory. That snapshot never leaves your browser. It is replaced the moment you
navigate, and discarded when you close the panel.

## What happens when you press Run site checks

This and Check status, below, are the only actions that request anything over
the network, and neither fires on its own. Run site checks requests from the site
you are already visiting:

- the page's raw HTML, as the server sends it
- `/robots.txt`
- `/llms.txt` and `/llms-full.txt`
- the XML sitemap named in robots.txt, to check whether the current URL is listed

If you tick the crawler probe checkbox, it repeats the page request two or three
more times with GPTBot, ClaudeBot and PerplexityBot user agent strings, to show
whether the site treats those crawlers differently.

Every one of those requests goes to the site you are on. None goes to any third
party, and none goes to the developer.

## What happens when you press Check status on the Links tab

The panel sends a HEAD request (or a GET that is cut off once the headers arrive,
if the server refuses HEAD) to each unique link on the page, up to 300 of them.
That includes links to other websites, because a link to another site can be
broken too. The requests carry no cookies. Only the status code and the final URL
are read, they are shown in the panel, and they are discarded when you navigate.

The panel does not load images from the page, so opening the Images or Social tab
requests nothing.

## What is stored

One value in `chrome.storage` and browser local storage: which tab of the panel
you had open, and whether the crawler probe checkbox was ticked. That is all, and
it stays on your machine.

## Permissions

The extension is installed with access to no website. `activeTab` lets it read
the tab you opened the panel on. Anything beyond that is optional host access you
grant yourself, either for one site or for every site, from a card in the panel,
and it can be withdrawn at `chrome://extensions`. Access is what lets the panel
read the tab you are on, fetch that site's robots.txt, and check the links on it
when you ask. It is not used to watch your browsing. The extension has no
background network activity and no remote code.

## Your data

Because nothing is collected, there is nothing to request, export or delete.
Removing the extension clears its stored settings.

Questions: open an issue on the project repository.
