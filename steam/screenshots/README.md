# Store screenshots

Recaptured 2026-10-22 on the table as it is after the UI pass of
2026-10-17..19 (your cards in front of you, the full-screen showdown, the
"was" face on a rewritten card, the rules on the felt). All five are
gameplay, 1920x1080 PNG, which is what Valve's review asks for (five is its
minimum): upload them in this order.

| File | What it shows | Source |
| --- | --- | --- |
| `01-showdown.png` | A showdown: each row is the five cards that scored, a Mirror copy shows the card it was printed as, a Wild King wears its rainbow | packaged build, `node test/packaged.mjs 200 --shots` |
| `02-mirrored-card.png` | Your turn on a six-card board (The Flood's sixth card) with a Mirror copy that "was 7♥", and a busted seat | packaged build |
| `03-market.png` | The Market: two relics on the shelf (take one), a sigil, a rite, the mana upgrade and the blank page | the same client in a 1920x1080 browser (`npm run responsive`) |
| `04-burned-card.png` | A board with a burned slot (the X stays where the card was) and a big pot | packaged build |
| `05-your-turn.png` | Your turn with a rank struck from the game ("Fives unmade") and a mirrored card on the board | packaged build |
| `06-answer-it.png` | The counterspell moment: Mordent's Nullify on top of Vesper's Unmake, the board and your Three of a Kind inside the panel, and "Answer it?" offering your own Nullify to counter the counter | the same client in a 1920x1080 browser, hints already seen (2026-10-23) |

**The spell-stack shot (06), added 2026-10-23.** The earlier capture
(`raw/03-answer-it-blemished.png`) was not only a bad frame: the "Answer
it?" plate opened on top of the spell it asked about at every size (66px of
it at 1920x1080, half the spell at 1280x800). That was fixed in the panel
itself (two columns from 960px wide; `test/stackfit.mjs`), and 06 is a
capture of the fixed build with the first-run hints marked as seen. Upload
it sixth, or first if the store page leads with the magic.

The packaged harness's off-screen window comes out 1936x1119 on this machine
(display scaling), a little taller than 16:9. Cropping would cut the ante bar
or the action bar, so each was padded at the sides with its own edge pixels to
16:9 and scaled to 1920x1080. The Market shot came from the browser harness
because no packaged run reached a Market inside its 200 seconds; its client
(`dist/`) is the one the package carries.

`raw/` (not committed) holds every capture to choose from. Before a store
update, recapture from the build being shipped: a screenshot is only as true
as the build it came from.
