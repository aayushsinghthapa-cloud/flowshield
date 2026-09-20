# FlowShield, explained simply

Written for: anyone picking this project up — teammates, judges, or a curious visitor. No maths background needed.

## The problem in one paragraph

Bengaluru was built around hundreds of man-made lakes called *keres* or tanks. They were designed as a **chain**: when one fills up, it spills through a channel (a *rajakaluve*) into the next one downhill. Over the years many of those channels were built over, narrowed or filled with rubbish. When a heavy storm arrives, water that should have moved down the chain has nowhere to go, so it sits in streets and houses instead. That is why the same neighbourhoods — Bellandur, Ejipura, HSR Layout, the Outer Ring Road — flood again and again.

## What FlowShield does

You describe a storm. FlowShield simulates that rain falling on the **real** south-east Bengaluru landscape and answers three questions:

1. **Which wards flood?**
2. **How long until each one floods?** (so people can be moved first)
3. **How many people are standing in that water?**

It then writes a ready-to-send warning: an action list for officials, and a public alert in English and Kannada.

## How the simulation works, step by step

Think of the city as a giant sheet of graph paper laid over the map. Each square is 100 m across — about two cricket pitches.

**Every square knows four things** (all from free public data, not invented):
- how high it is above sea level (satellite elevation data)
- what covers it: buildings, trees, grass, water (satellite land-cover data)
- whether a storm drain or lake sits on it (OpenStreetMap)
- how many people live there (Census 2011, spread across the ward by how built-up each square is)

**Then we repeat five steps, every few seconds of simulated time:**

1. **Rain falls.** Concrete sheds about 90% of the rain as runoff; parks and trees soak up most of theirs. If the ground is already soaked from earlier rain, even the parks shed water.
2. **Drains take some away.** Each street square sends water to its nearest mapped drain or lake — up to a limit. If you slide "drains blocked" to 40%, that limit drops by 40%. Blocked water does not vanish: it stays on the street.
3. **Water flows downhill.** Each square compares its water surface with its four neighbours and water moves toward the lower one. It speeds up on smooth roads and slows through trees. This is the physics part: the *shallow-water equations*.
4. **Lakes fill and spill.** A lake holds water until it reaches the weir at its rim; after that, the extra spills onward — exactly like the historic chain. Start the lakes at 90% full and the chain overflows much sooner.
5. **We measure the depth.** 15 cm of moving water is hard to stand in; 30 cm can float a car. When 5% of a ward's land passes 30 cm, that ward is **Critical**.

### Why you can trust the numbers

Water cannot appear or disappear in this model. After every run we check:

> rain that fell = water still on the ground + water that flowed off the map + water that soaked in

The mismatch is about **0.00000000000001%**. That is the computer's rounding limit, not a modelling shortcut. Twelve automatic tests also check things like "a still lake must stay still" and "blocking drains must never reduce flooding".

## What each part of the website does

| Where | What it is for |
|---|---|
| **Left: Ask in plain English** | Type "130 mm in 3 hours, lakes already full". Google Gemini turns it into simulator settings. **It shows you what it understood, and you press Run.** |
| **Left: Live forecast** | The real Open-Meteo forecast for this catchment. "Simulate 24 h" runs the model on tonight's actual rain. "Chance of flooding" runs 31 different forecasts and reports how many of them flood each ward. |
| **Left: Scenario** | Four presets, then sliders: rainfall, blocked drains, how full the lakes are, how wet the ground is. "Block a drain" lets you click a real drain on the map and choke it. |
| **Centre: Map** | *Risk* colours each ward green/amber/red as time passes. *Depth* shows the water itself. *Chance* shows the ensemble probabilities. Press play to watch the flood spread. |
| **Right: Verdict** | The headline answer: how many wards flood, which one is first, how soon, how many people. |
| **Right: People affected over time** | The rain bars and the number of people in water, so you can see the lag between the downpour and the peak. |
| **Right: Wards** | Every ward, sorted by who floods first, with time-to-flood and people at risk. Click one for its depth curve. |
| **Right: Lake cascade** | Live tank levels. Watch Madiwala fill, spill into Agara, then Bellandur, then Varthur. |
| **Right: Early-warning bulletin** | Gemini writes the advisory and the public alert in English and ಕನ್ನಡ. Every number is checked against the simulation before it is shown. |
| **Compare tab** | Save up to four runs and compare them: who floods sooner, how many more people, how much bigger the flooded area. |
| **Model tab** | The equations, the water budget, the error, the assumptions and the limits. |

## The AI, and why it is honest

Two features use Google Gemini, live, on every request:

- **Understanding your words** → simulator settings. The values are clamped to sensible ranges, place names are matched to real drains, and **you confirm before anything runs**.
- **Writing the bulletin.** The model only receives this run's numbers and is told to copy them exactly. Afterwards, code pulls every number out of the text and checks it against the simulation. The green "numbers verified" badge means that check passed.

If Gemini is unavailable, the app shows an error. It never shows a saved or fake answer.

## What this cannot do

- The elevation data averages buildings and trees into 100 m squares, so it cannot see a flooded underpass.
- Nobody publishes Bengaluru's actual drain capacities, so that setting is an assumption you can change.
- Population is from Census 2011, so counts are best used for comparison, not as today's exact figure.
- Forecast rain is averaged over 9–25 km, which flattens cloudbursts. The "thunderstorm peak factor" exists for that reason.
- It has not been calibrated against measured flood depths, so it is decision support, not an official forecast.
