# Demo video script (2 min 30 s)

Target 2:30, hard maximum 3:00. Follow the brochure's required order:
**Rainfall & terrain input → Water-level simulation → Flood progression → Risk classification → Early-warning output.**

Record at 1600×1000 in a clean browser window (no bookmarks bar, no notifications). Run everything on the
**Detailed 100 m** grid for the numbers you say out loud. Do one dry run first so the Vercel instance is warm.

---

**0:00–0:20 · The problem (screen: map, zoomed on the lake chain)**

> "Bengaluru's lakes were built as a chain. Each tank spills into the next through storm-water drains. Encroach on
> those drains and the chain breaks, which is why Bellandur and Ejipura flood every monsoon. FlowShield is a flood
> simulator built on the real terrain, the real lakes and the real drains of this valley."

**0:20–0:40 · Inputs (screen: left panel, then the map layers)**

> "The city is cut into 100-metre squares. Each one carries satellite elevation, satellite land cover, 1,031
> OpenStreetMap drains, 116 lakes, and 72 real BBMP wards with Census population. Pick a storm — or type one in
> plain English."

Click **Heavy storm**. Point at the drain lines and the lakes.

**0:40–1:15 · Simulation and progression (screen: press play)**

> "Press play. Rain falls, concrete sheds it, drains carry what they can, and the rest flows downhill through the
> shallow-water equations. Watch the tanks fill — Madiwala, Agara, Bellandur — and spill into each other."

Let the animation run. Point at the lake cascade bars filling.

**1:15–1:35 · Risk classification (screen: right panel)**

> "Fifteen centimetres is hard to walk through; thirty can float a car. FlowShield turns depth into a verdict:
> five wards go critical, Bharathi Nagar first, two hours after the rain starts, with twenty-three thousand people
> in deep water."

**1:35–1:55 · The what-if (screen: block a drain, then Compare)**

> "Now block one real drain near Ejipura and run it again."

Click **Block a drain**, click the drain, **Run**, open **Compare**.

> "Ejipura goes from safe to critical in two hours twelve, and three times as many people are affected. That is the
> cost of one encroached channel, quantified."

**1:55–2:15 · Live forecast and early warning (screen: live panel, then bulletin)**

> "It also runs on the real forecast. Thirty-one forecast members give each ward a probability of flooding tonight.
> And Gemini turns the result into an advisory for officials and a public alert in English and Kannada — every
> number checked against the simulation before it is shown."

Show the ✓ verified badge and switch to the ಕನ್ನಡ tab.

**2:15–2:30 · The maths and the close (screen: Model tab)**

> "Under the hood: the local-inertial shallow-water equations, an adaptive time step, and a water budget that
> closes to one part in ten-to-the-fourteen. Twelve tests keep it honest. FlowShield: predict the flood, protect
> the future."

---

## Checklist before recording
- [ ] Detailed 100 m grid selected
- [ ] Live URL warm (open it once, run one simulation)
- [ ] Gemini key working (generate one bulletin as a test)
- [ ] Kannada text reviewed by a Kannada reader
- [ ] Browser zoom 100%, window 1600×1000
- [ ] Video is 2:00–3:00, link works in an incognito window
