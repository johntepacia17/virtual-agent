# Pixel Office

A retro pixel-art office that shows what Claude Code is doing, live. Claude sits at a desk with a
speech bubble describing the current action. Each subagent gets its own helper character and desk.

```
Claude Code --hook--> hook.js --POST--> server.js --SSE--> browser (canvas)
```

## Run

```bash
node server.js            # http://localhost:4321
node scripts/demo.js      # optional: fake events to preview the scene
node install-hooks.js     # add hooks to ~/.claude/settings.json (backup is written first)
```

Open http://localhost:4321, then restart any running Claude Code sessions so they pick up the hooks.

Remove the hooks any time with `node install-hooks.js --uninstall`.

## Free time

When Claude has been idle for ~5 seconds (and has no helpers), it gets up and does something fun: exercise,
sweeping, playing ball, meditating, reading at the bookshelf, or watering the plant. It walks back to the
desk the moment work arrives. Tweak the list in `ACTIVITIES` in `public/game.js`.

## Permission requests

When Claude asks you for permission, it shows a bobbing bubble with an orange "?" badge and the desk monitor
blinks, for example "Can I run git status?" or "May I edit src/login.php?". It comes from the
`PermissionRequest` hook (and the permission `Notification`), and clears when the tool runs.
After updating, run `node install-hooks.js` again so the new hook is registered.

## Clock and time of day

The wall clock and the header show live **Singapore time (SGT)**, and the windows follow it: dawn (05-07),
morning (07-11), daytime (11-15), afternoon (15-17), sunset (17-19) and night (19-05), with a moving sun,
moon, stars, clouds and a matching tint over the room. Try it without waiting:

Every desk has a lamp that follows the same clock: off from 07:00 to 17:00, fading on from 17:00 to 18:30,
glowing warmly all night, and fading off again between 05:30 and 07:00.

- `http://localhost:4321/?hour=19.5` previews a time of day (the clock keeps running from there)
- `http://localhost:4321/?tz=Asia/Tokyo` uses another time zone

## The cats

Three cats live in the office, each with a personality and their own random day:

| Cat | Colour | Personality |
|---|---|---|
| **Bosch** | creamy orange | greedy boss: eats, begs for food, shoves others off the bowl, purrs and rolls over when petted |
| **Ingca** | turquoise | zoomie goblin: sprints, plays, starts play-fights, more zoomies late at night |
| **Makita** | grey | aloof napper: sleeps (in the lamp glow at night, the window sun by day), grooms, gets huffy if petted too much |

They sleep, groom, stretch, run, play, watch the window, beg, eat and have the odd harmless play-fight, and
**no two cats do the same thing at the same time** (only one loud thing at once, too).

Interact with them:

- **Click a cat** to pet it (hearts and a reaction that fits its personality). Hover for a name tag.
- **FEED** then click the floor to put down a bowl; **TOY** then click the floor to toss a ball.
- Claude does it too during his free time: petting a cat, waving a feather wand, or serving dinner,
  especially when a cat is hungry or begging.

The side panel shows each cat's current activity and its energy, tummy and love bars. All of this is in
`public/cats.js`; no server changes are needed.

## Notes

- Claude Code only. claude.ai chat has no hooks, so it can't be shown here.
- `hook.js` never prints and always exits 0, so Claude Code is unaffected when the server is off.
- The server listens on 127.0.0.1 only; prompt text is shortened and kept in memory.
- `DEBUG=1 node server.js` logs raw hook payloads to `events.log` (useful to check field names).
- Change the port with `PIXEL_OFFICE_PORT` (set it for both the server and Claude Code's environment).
