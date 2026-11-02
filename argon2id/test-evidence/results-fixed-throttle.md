# Argon2id lab test matrix: fixed-throttle

Page: `file:///home/mike/Desktop/cssp-visual-labs/argon2id/index.html`  
Chrome: Chrome/153.0.8010.47  
Run: 2026-11-02 22:37:35

| Config | CSS viewport | reduced motion | stacked | checks | hangs | console errors | auto-play dwell (s) | result |
|---|---|---|---|---|---|---|---|---|
| chrome-1920x1080-motion-cpu4x | 1920×1080 @1 | False | False | 69/69 | 0 | 0 | [4.7, 4.3, 10.1, 4.7, 6.0, 6.0] | PASS |
| chrome-1366x768-reduce-cpu4x | 1366×768 @1 | True | False | 69/69 | 0 | 0 | [4.7, 4.6, 4.3, 4.7, 4.6, 4.4] | PASS |

## chrome-1920x1080-motion-cpu4x
- note: Present (F): fullscreenElement=True button='Exit'

## chrome-1366x768-reduce-cpu4x
- note: Present (F): fullscreenElement=True button='Exit'

## Every check, per config

### chrome-1920x1080-motion-cpu4x
- ok   page loads at step 1 (Step 1 of 7)
- ok   reduced-motion emulation applied (False)
- ok   Next -> step 2 (A fresh random salt) completes (1.1s)
- ok   step 2: no spinner left on screen (browserSpinner=False engSpinner=False)
- ok   Next -> step 3 (Argon2id fills memory) completes (8.4s)
- ok   step 3: no spinner left on screen (browserSpinner=False engSpinner=False)
- ok   Next -> step 4 (Only the verifier is stored) completes (0.0s)
- ok   step 4: no spinner left on screen (browserSpinner=False engSpinner=False)
- ok   Next -> step 5 (Login: derive and compare) completes (4.5s)
- ok   step 5: no spinner left on screen (browserSpinner=False engSpinner=False)
- ok   Next -> step 6 (Wrong password, different tag) completes (4.5s)
- ok   step 6: no spinner left on screen (browserSpinner=False engSpinner=False)
- ok   Next -> step 7 (Why Argon2id) completes (6.7s)
- ok   step 7: no spinner left on screen (browserSpinner=False engSpinner=False)
- ok   Next disabled on the last step
- ok   Reset returns to step 1 (Step 1 of 7)
- ok   three Nexts reach step 4 (Step 4 of 7)
- ok   Back returns to step 3 (tag shown, no spinner) (Step 3 of 7 engSpinner=False)
- ok   Back returns to step 2 (Step 2 of 7)
- ok   in-page button to step 2 is offered (after 0.0s buttons=['1'])
- ok   in-page button -> step 2 completes (1.1s)
- ok   in-page button to step 3 is offered (after 0.0s buttons=['2'])
- ok   in-page button -> step 3 completes (8.4s)
- ok   in-page button to step 4 is offered (after 0.0s buttons=['3'])
- ok   in-page button -> step 4 completes (0.0s)
- ok   in-page button to step 5 is offered (after 0.0s buttons=['4'])
- ok   in-page button -> step 5 completes (4.3s)
- ok   in-page button to step 6 is offered (after 0.0s buttons=['5'])
- ok   in-page button -> step 6 completes (4.5s)
- ok   in-page button to step 7 is offered (after 0.0s buttons=['6'])
- ok   in-page button -> step 7 completes (6.6s)
- ok   Start over returns to step 1 (Step 1 of 7)
- ok   key 4: derivation replays and completes at m = 256 MiB (14.4s cells=256/256 total=262,144 × 1 KiB · 4 lanes × 64 MiB)
- ok   key 4: grid has every cell filled (256/256)
- ok   key 4: KiB total matches (262,144 × 1 KiB · 4 lanes × 64 MiB)
- ok   key 1: derivation replays and completes at m = 19 MiB (4.0s cells=19/19 total=19,456 × 1 KiB · 1 lane × 19 MiB)
- ok   key 1: grid has every cell filled (19/19)
- ok   key 1: KiB total matches (19,456 × 1 KiB · 1 lane × 19 MiB)
- ok   key 3: derivation replays and completes at m = 128 MiB (11.4s cells=128/128 total=131,072 × 1 KiB · 4 lanes × 32 MiB)
- ok   key 3: grid has every cell filled (128/128)
- ok   key 3: KiB total matches (131,072 × 1 KiB · 4 lanes × 32 MiB)
- ok   key 2: derivation replays and completes at m = 64 MiB (8.4s cells=64/64 total=65,536 × 1 KiB · 4 lanes × 16 MiB)
- ok   key 2: grid has every cell filled (64/64)
- ok   key 2: KiB total matches (65,536 × 1 KiB · 4 lanes × 16 MiB)
- ok   step 5 completes before profile switch (4.5s)
- ok   profile button light at step 5 keeps the comparison complete (0.0s verdict=match ok)
- ok   profile button heavy at step 5 keeps the comparison complete (0.0s verdict=match ok)
- ok   profile button balanced at step 5 keeps the comparison complete (0.0s verdict=match ok)
- ok   auto-play reaches step 7 and stops (42.3s, dwell per step [4.7, 4.3, 10.1, 4.7, 6.0, 6.0])
- ok   auto-play gives at least 3 s on every step (dwell [4.7, 4.3, 10.1, 4.7, 6.0, 6.0])
- ok   Run the rig: click restarts the rig (btn=Pause rig ❚❚ hot=48)
- ok   Run the rig: pause stops the counter (btn=Run the rig ▸ hot=0 count 83,335 -> 83,335)
- ok   Run the rig: restart runs to 1,000,000 (6.1s Run again ▸ note=1,000,000 guesses = 16m 40s of GPU time. A 5-word passphrase)
- ok   rig time table: 1 million at 64 MiB = 16m 40s (16m 40s)
- ok   rig passphrase row shows ~450 million years at 64 MiB (~450 million years)
- ok   R resets (Step 1 of 7)
- ok   ArrowRight advances (Step 2 of 7)
- ok   ArrowLeft goes back (Step 1 of 7)
- ok   key 3 at step 1 switches the profile (m = 128 MiB)
- ok   space starts Play (Pause)
- ok   space pauses Play (Play)
- ok   F again exits fullscreen (False)
- ok   page still responsive after Present
- ok   enlarge panel opens (True)
- ok   Esc restores the panel (False)
- ok   derivation survives a resize across the breakpoint (6.2s)
- ok   login verify survives a resize across the breakpoint (3.0s)
- ok   no console errors or warnings
- ok   no network requests beyond the page itself
- requests seen: file:///home/mike/Desktop/cssp-visual-labs/argon2id/index.html

### chrome-1366x768-reduce-cpu4x
- ok   page loads at step 1 (Step 1 of 7)
- ok   reduced-motion emulation applied (True)
- ok   Next -> step 2 (A fresh random salt) completes (0.0s)
- ok   step 2: no spinner left on screen (browserSpinner=False engSpinner=False)
- ok   Next -> step 3 (Argon2id fills memory) completes (0.5s)
- ok   step 3: no spinner left on screen (browserSpinner=False engSpinner=False)
- ok   Next -> step 4 (Only the verifier is stored) completes (0.0s)
- ok   step 4: no spinner left on screen (browserSpinner=False engSpinner=False)
- ok   Next -> step 5 (Login: derive and compare) completes (0.5s)
- ok   step 5: no spinner left on screen (browserSpinner=False engSpinner=False)
- ok   Next -> step 6 (Wrong password, different tag) completes (0.5s)
- ok   step 6: no spinner left on screen (browserSpinner=False engSpinner=False)
- ok   Next -> step 7 (Why Argon2id) completes (6.6s)
- ok   step 7: no spinner left on screen (browserSpinner=False engSpinner=False)
- ok   Next disabled on the last step
- ok   Reset returns to step 1 (Step 1 of 7)
- ok   three Nexts reach step 4 (Step 4 of 7)
- ok   Back returns to step 3 (tag shown, no spinner) (Step 3 of 7 engSpinner=False)
- ok   Back returns to step 2 (Step 2 of 7)
- ok   in-page button to step 2 is offered (after 0.0s buttons=['1'])
- ok   in-page button -> step 2 completes (0.0s)
- ok   in-page button to step 3 is offered (after 0.0s buttons=['2'])
- ok   in-page button -> step 3 completes (0.5s)
- ok   in-page button to step 4 is offered (after 0.0s buttons=['3'])
- ok   in-page button -> step 4 completes (0.0s)
- ok   in-page button to step 5 is offered (after 0.0s buttons=['4'])
- ok   in-page button -> step 5 completes (0.5s)
- ok   in-page button to step 6 is offered (after 0.0s buttons=['5'])
- ok   in-page button -> step 6 completes (0.6s)
- ok   in-page button to step 7 is offered (after 0.0s buttons=['6'])
- ok   in-page button -> step 7 completes (6.6s)
- ok   Start over returns to step 1 (Step 1 of 7)
- ok   key 4: derivation replays and completes at m = 256 MiB (2.3s cells=256/256 total=262,144 × 1 KiB · 4 lanes × 64 MiB)
- ok   key 4: grid has every cell filled (256/256)
- ok   key 4: KiB total matches (262,144 × 1 KiB · 4 lanes × 64 MiB)
- ok   key 1: derivation replays and completes at m = 19 MiB (0.4s cells=19/19 total=19,456 × 1 KiB · 1 lane × 19 MiB)
- ok   key 1: grid has every cell filled (19/19)
- ok   key 1: KiB total matches (19,456 × 1 KiB · 1 lane × 19 MiB)
- ok   key 3: derivation replays and completes at m = 128 MiB (1.2s cells=128/128 total=131,072 × 1 KiB · 4 lanes × 32 MiB)
- ok   key 3: grid has every cell filled (128/128)
- ok   key 3: KiB total matches (131,072 × 1 KiB · 4 lanes × 32 MiB)
- ok   key 2: derivation replays and completes at m = 64 MiB (0.5s cells=64/64 total=65,536 × 1 KiB · 4 lanes × 16 MiB)
- ok   key 2: grid has every cell filled (64/64)
- ok   key 2: KiB total matches (65,536 × 1 KiB · 4 lanes × 16 MiB)
- ok   step 5 completes before profile switch (0.7s)
- ok   profile button light at step 5 keeps the comparison complete (0.0s verdict=match ok)
- ok   profile button heavy at step 5 keeps the comparison complete (0.0s verdict=match ok)
- ok   profile button balanced at step 5 keeps the comparison complete (0.0s verdict=match ok)
- ok   auto-play reaches step 7 and stops (33.9s, dwell per step [4.7, 4.6, 4.3, 4.7, 4.6, 4.4])
- ok   auto-play gives at least 3 s on every step (dwell [4.7, 4.6, 4.3, 4.7, 4.6, 4.4])
- ok   Run the rig: click restarts the rig (btn=Pause rig ❚❚ hot=48)
- ok   Run the rig: pause stops the counter (btn=Run the rig ▸ hot=0 count 83,335 -> 83,335)
- ok   Run the rig: restart runs to 1,000,000 (6.0s Run again ▸ note=1,000,000 guesses = 16m 40s of GPU time. A 5-word passphrase)
- ok   rig time table: 1 million at 64 MiB = 16m 40s (16m 40s)
- ok   rig passphrase row shows ~450 million years at 64 MiB (~450 million years)
- ok   R resets (Step 1 of 7)
- ok   ArrowRight advances (Step 2 of 7)
- ok   ArrowLeft goes back (Step 1 of 7)
- ok   key 3 at step 1 switches the profile (m = 128 MiB)
- ok   space starts Play (Pause)
- ok   space pauses Play (Play)
- ok   F again exits fullscreen (False)
- ok   page still responsive after Present
- ok   enlarge panel opens (True)
- ok   Esc restores the panel (False)
- ok   derivation survives a resize across the breakpoint (0.0s)
- ok   login verify survives a resize across the breakpoint (0.0s)
- ok   no console errors or warnings
- ok   no network requests beyond the page itself
- requests seen: file:///home/mike/Desktop/cssp-visual-labs/argon2id/index.html
