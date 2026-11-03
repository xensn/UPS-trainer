# Security

This trainer is a static website: plain HTML, CSS and JavaScript files with no server, no
database, no user accounts and no data sent anywhere. That keeps the attack surface small.
This file lists what is in place, what was fixed in the security review, and the limits to be
aware of.

## Measures in place

| Measure | What it does | Where |
|---|---|---|
| **Content Security Policy** | The browser only runs scripts and styles from this site's own files. Injected scripts, inline event handlers (`onclick=`, `onerror=`), outside scripts, outside connections, forms, plugins and frames are all refused. | `index.html` (`<meta http-equiv="Content-Security-Policy">`) |
| **No inline code** | All JavaScript and CSS are in separate files, and no markup (in `index.html` or built by the scripts) uses `style=` or `on...=` attributes. This is what allows the strict policy above. | `css/`, `js/` |
| **No outside dependencies** | No CDNs, fonts, analytics or third-party libraries, so there is no supply-chain risk and nothing tracks trainees. Works fully offline. | whole project |
| **No network requests** | `connect-src 'none'`: the page cannot send data anywhere, even if modified in the browser. | CSP |
| **Validated saved progress** | Progress read back from browser storage is checked against the list of known segments; unknown or malformed entries, a quiz pass without a valid score, and impossible scores are discarded. Corrupt storage is ignored and the page still loads. | `js/app.js`, section 2 |
| **No user text on the page** | Everything shown is fixed text from `js/content.js` and `js/display.js`. Nothing a user types is ever inserted into the page, so cross-site scripting has no entry point. | `js/display.js`, `js/app.js` |
| **No referrer leakage** | Links out (none at present) would not reveal the trainer's address. | `index.html` (`referrer: no-referrer`) |
| **Strict mode, no `eval`** | All scripts use `"use strict"`; nothing builds or runs code from text. | `js/*.js` |
| **One global name** | All code lives under `window.GXT5`, so it cannot clash with or be overridden by other scripts by accident. | `js/*.js` |

## Fixed in the security review

1. **Inline scripts and styles removed.** The earlier single-file version had all code and
   styles inline, which rules out a strict Content Security Policy. It is now split into
   files, every `style="..."` attribute was replaced with CSS classes, and a strict policy was
   added.
2. **Saved progress could be tampered with.** The earlier version trusted whatever was in
   browser storage. Editing it could unlock the quiz or inject unexpected keys
   (`__proto__`). It now accepts only known segment IDs and a valid whole-number score, and
   ignores a "quiz done" entry with no passing score behind it.
3. **Old storage key removed.** The previous version's storage entry (`gxt5_done`) is deleted
   on load so stale data cannot linger.

All of the above is checked automatically by `tests/security.test.js`. It confirms the policy
blocks an injected inline script and an injected `onerror` handler, that tampered and corrupt
storage is handled safely, and that the page makes no outside requests.

## Known limitations

- **The quiz is for self-study, not formal assessment.** Answers, scores and progress all
  live in the trainee's browser, and anyone can read the page's code (including quiz
  answers) with the browser's developer tools. If results must be recorded or trusted, the
  quiz needs a server that marks answers and stores results.
- **Public hosting means public access.** On GitHub Pages or similar, anyone with the link
  can open the trainer, and a public repository makes the code visible too. Confirm this is
  acceptable before publishing, or host it on an internal network instead.
- **Framing protection.** Stopping other sites from embedding the page in a frame needs a
  server header (`frame-ancestors` / `X-Frame-Options`), which GitHub Pages does not allow
  setting. The risk is low because the page holds no sensitive actions or data. If hosted on
  a server you control, add:
  `Content-Security-Policy: frame-ancestors 'self'` and `X-Content-Type-Options: nosniff`.
- **Opening from a folder.** When `index.html` is opened directly from disk, browsers apply
  the policy using local-file rules. It was tested in Chromium-based browsers (Edge, Chrome).

## Reporting an issue

Report any security concern to the project owner rather than in a public issue.
