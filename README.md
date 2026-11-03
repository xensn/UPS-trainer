# GXT5 Fault Trainer

Scenario-based training for serviceability checks on the **Vertiv Liebert GXT5 6 kVA UPS**
(Lesson 15: Uninterruptible Power Supply). Trainees operate a simulated front panel and a
test bench, rather than reading slides.

It is a plain static website: HTML, CSS and JavaScript only. There is no server, no database,
no login and no outside libraries. It works offline.

---

## Learning objectives covered

**Enabling objective:** Perform serviceability checks on UPS.

| Objective | Where in the trainer |
|---|---|
| a. Describe the procedure for UPS maintenance | **Maintenance** page |
| b. Perform status checks | **Status Check** |
| c. Perform UPS endurance check | **Endurance Check** |
| d. Perform UPS load utilisation check | **Load Utilisation** |
| e. Perform UPS bypass | **Bypass** |
| f. Perform UPS reset (power on/off) | **UPS Reset** |
| Applying it under pressure | **Mains Failure Test**, **UPS Failure Test** (timed, no instructions) |
| Knowledge check | **Quiz** (unlocks after everything else; 8/10 to pass) |

---

## How to run it

- **Offline / on a single computer:** keep the folder together and double-click `index.html`.
  Any modern browser works (Edge, Chrome, Firefox). No internet is needed.
- **Hosted (e.g. GitHub Pages):** upload the whole folder to a repository and turn on Pages
  (Settings → Pages → Deploy from a branch → `main`, folder `/ (root)`). The site address
  is shown there once it is live.

Progress (which segments are done, quiz result) is kept in the trainee's own browser only.
It is never sent anywhere. Clearing the browser's site data resets it.

---

## Folder layout

```
gxt5-fault-trainer/
├── index.html            Page skeleton: header, segment list, front panel, task column
├── css/
│   └── styles.css        All styling, in numbered sections (colours, layout, panel, display, ...)
├── js/                   Loaded in this order:
│   ├── engine.js         UPS simulation: modes, what each button does, the test bench
│   ├── content.js        Training content: checks, scenario tests, quiz, Maintenance text
│   ├── display.js        Draws the UPS display screen and power-path diagram
│   ├── audio.js          Alarm buzzer sound (generated, no sound files)
│   └── app.js            Page controller: navigation, progress, task cards, tests, quiz
├── assets/
│   └── favicon.svg       Browser tab icon
├── tests/                Automated browser tests (see "Testing" below)
├── package.json          Only used to run the tests
├── README.md             This file
└── SECURITY.md           Security measures and known limitations
```

Every JavaScript and CSS file starts with a short description and is split into labelled
sections (`/* ===== 1. SECTION NAME ===== */`). Each function has a comment saying what it does.

---

## Where to change things

| To change... | Edit | Look for |
|---|---|---|
| Step instructions, read-out text, situations | `js/content.js` | `2. CHECKS` |
| Scenario test brief, time limit, hints, pass/fail rules | `js/content.js` | `3. TESTS` |
| Quiz questions, answers, pass mark | `js/content.js` | `4. QUIZ` and `QUIZ_PASS_MARK` |
| Maintenance page text | `js/content.js` | `5. MAINTENANCE` |
| Order or names of segments in the list | `js/content.js` | `1. SEGMENTS` |
| How the UPS behaves (modes, menus, overload limit) | `js/engine.js` | section headings |
| What the display screen shows | `js/display.js` | `SCREENS` |
| Colours, sizes, layout | `css/styles.css` | numbered sections |

**Step notation** used in `content.js`:

- `"Press [ENTER] > Control > Clear faults"` shows the ENTER keycap, then arrows to the menu items.
- `"Bench: Mains breaker > [CLOSED]"` shows a BENCH tag and a switch chip.

**Quiz questions:** `type: "mcq"` (multiple choice, `answer` is the option number starting
from 0) or `type: "tf"` (true/false, `answer: 0` = True, `1` = False). `review` lists the
segments suggested if a trainee gets the question wrong.

---

## How the scenario tests work

Both tests start the same way: an alarm sounds and the UPS is on battery. The trainee has to
work out what has happened and respond, with no step-by-step instructions.

| | Mains Failure Test | UPS Failure Test |
|---|---|---|
| What happened | Supply breaker tripped; mains gone | Internal UPS fault; mains still present |
| Time limit | 45 s of battery | 20 s of battery |
| Correct response | Check the backup time (Status → Battery), then restore the supply (close the breaker) | Transfer the load to bypass (POWER → Turn ON to bypass) |
| Fails immediately if | The UPS is switched off, or the supply is restored before checking the backup time | The UPS is switched off |

Per the GXT5 manual, the POWER menu does not offer bypass while mains is absent. That is why the
two situations need opposite responses.

Help after failed attempts: 1st fail shows what went wrong; 2nd adds a tip and links to
the checks to revisit; 3rd onwards adds the exact steps. Both tests must be passed before
the quiz unlocks.

---

## Testing

The `tests/` folder holds automated tests. They open the trainer in a hidden browser and
press its buttons like a trainee. They cover the five checks, both scenario tests (every way
to pass and fail), the quiz, the alarm sounds, the security measures, and that every page fits
one screen on common computer sizes (1280×720 laptops up to 2560×1440 monitors).

To run them (needs [Node.js](https://nodejs.org) 18 or later):

```
npm install
npx playwright install chromium
npm test
```

Run one group only with, for example, `node tests/run-all.js sound`.
Groups: `walkthrough`, `scenarios`, `quiz`, `sound`, `security`, `fit`.

---

## Notes

- Behaviour follows the *Vertiv Liebert GXT5 Installer/User Guide*, simplified for training.
  It is a practice tool, not a replacement for the manual or supervised training on the unit.
- No logos are used.
- Sound starts after the trainee's first click or tap (a browser rule). On iPhones the silent
  switch also mutes web pages.
