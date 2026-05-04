/**
 * Article bodies for prerender.mjs.
 *
 * These HTML strings mirror the visible prose in the InsightXxx.jsx components.
 * They are injected into the static HTML so Googlebot and AI crawlers see the
 * full article body without running JS. At runtime React replaces #root with
 * the live interactive version (scatter charts, collapsibles, etc.) -
 * visible-to-humans content is unchanged.
 *
 * IMPORTANT: Do NOT edit article content here without also updating the
 * corresponding InsightXxx.jsx. These strings are a static mirror of the
 * React content, not a separate source of truth. Charts, collapsibles, and
 * interactive UI are intentionally omitted - only the textual content that
 * crawlers need to understand the article is included.
 */

// Climbing-gear base URL (placeholder $BASE is replaced at build time)
const L = (href, text) => `<a href="$BASE${href}">${text}</a>`;

const climbingShoeGuide = `
<p><strong>How We Score 331 Climbing Shoes - and How to Pick Yours.</strong> Our guided search scores every shoe across 7 performance axes. Here's what the algorithm actually measures, how shoe specs translate to real-world performance, and what your foot shape means for fit.</p>

<ul>
  <li><strong>Database:</strong> 331 shoes from 25+ brands</li>
  <li><strong>Price gap:</strong> €47 (flat avg €109 to aggressive €156)</li>
  <li><strong>Performance axes:</strong> 7 (edging, smearing, pockets, hooks, comfort, sensitivity, support)</li>
</ul>

<h2>The Price-Downturn Connection</h2>
<p>Across the 312 shoes with price data, the pattern is clear: more aggressive shapes cost more. Flat-lasted shoes average €109, moderate-downturn shoes €139, and aggressive shoes €156. That €47 gap from flat to aggressive isn't random - it reflects the precision construction, asymmetric lasts, and premium rubber compounds that high-performance shoes demand. But an expensive shoe isn't automatically the right shoe. A beginner in an aggressive €160 shoe will be less comfortable and less effective than in a flat €90 shoe that matches their skill level.</p>
<p><strong>The best value lives in the €80-120 range.</strong> This band holds 83 shoes - more than any other bracket - including most flat-lasted all-rounders and entry-level moderate shoes. You don't need to spend €160+ to get a capable climbing shoe. What you're paying for at the top end is specialisation, not raw quality.</p>

<h2>How Our Guided Search Scores Every Shoe</h2>
<p>Our ${L('/find', 'Shoe Finder')} walks you through six questions - discipline, environment, experience, preference, foot shape, and body weight - then scores all 331 shoes out of 100 points. The scoring isn't a black box: it maps your answers to concrete specs, then rewards shoes whose construction matches what you need.</p>
<p>The 100 points break down into eight categories. <strong>Discipline</strong> carries the most weight, matching your climbing style to ideal closure types - bouldering favours slippers and velcro for quick on/off, sport climbing suits velcro and lace, and trad climbing rewards lace-ups for all-day precision. <strong>Downturn</strong> and <strong>asymmetry</strong> use a five-tier system that combines your experience level and comfort preference into a single target profile - beginners who want comfort land at the flat/symmetric end, while advanced climbers chasing performance are pushed toward aggressive/asymmetric shapes. <strong>Midsole stiffness</strong> is tuned by both discipline and body weight: heavier climbers need more support, and trad routes demand stiffer platforms than bouldering. The remaining points go to <strong>environment</strong>, <strong>closure</strong>, <strong>rubber thickness</strong>, and <strong>foot shape</strong>.</p>
<p><strong>The five-tier system is the core of our scoring.</strong> Your experience level (beginner to advanced) sets a base number. Your preference (comfort to performance) adds to it. The sum maps to one of five tiers - from flat/symmetric to ultra-aggressive/strong-asymmetric. This prevents beginners from being matched with painful aggressive shoes, while giving advanced climbers the full performance range.</p>

<h2>How Specs Actually Affect Performance</h2>
<p>Beyond the Finder's scoring, we compute seven performance axes for every shoe based purely on its physical specs. These are the spider-chart values you see on each shoe's detail page. Here's what drives each one - and why certain trade-offs are unavoidable.</p>

<h3>Edging - standing on tiny holds</h3>
<p>Edging is about transferring your weight through a small contact point. The score uses a geometric mean of rigidity and shape - you need both for a top score. Rigidity blends structural stiffness (midsole, rand tension, closure) with perceived stiffness from the shoe's feel. Shape rewards moderate-to-aggressive downturn and strong asymmetry. Hard rubber and lace closure each add smaller bonuses. The top edgers in our database all combine stiff construction with aggressive, strongly asymmetric profiles. A flat shoe can have great stiffness but still score low because it lacks the shape component; conversely, a soft aggressive shoe has shape but not rigidity.</p>

<h3>Smearing - friction on flat rock</h3>
<p>Smearing is the opposite story. Conformability dominates - an equal blend of rubber softness and structural flexibility (low stiffness), because the foot needs to deform around the rock surface. Rubber thickness is the next biggest factor, especially when the rubber is soft, because more material can mould to the surface. Flat shape with no asymmetry adds a small bonus. The ideal smearer: soft rubber, soft feel, no midsole, flat profile. Top scorers are all soft, minimal shoes with no midsole. Stiffer shoes score poorly here despite a flat profile, because a full midsole and stiff-moderate feel kill conformability.</p>

<h3>Pockets - hooking toes into holes</h3>
<p>Pocket performance needs a curled, stiff toe that can hook into small openings. Downturn and asymmetry are the biggest drivers, followed by toe patch coverage, perceived stiffness, closure, and rubber hardness. Aggressive, asymmetric shoes with a full toe patch dominate - but interestingly, slippers score higher for closure here than lace-ups, because the flexible upper lets the toe curl more naturally into pockets.</p>

<h3>Hooks and heel/toe performance</h3>
<p>Hooking requires rubber coverage more than anything else. Heel rubber and toe patch are weighted equally and together dominate the score - which matters more depends on the route. Downturn is deliberately excluded: it helps heel hooks (aggressive shapes dig in) but hurts toe hooks (a flatter toe sits better against the rock), so the net effect is roughly neutral. Sensitivity rewards soft-feeling shoes that transmit feedback, helping you feel whether a hook is secure. Closure contributes a smaller share directly, but its real influence is indirect: it constrains how much rubber can cover the upper. Single-velcro shoes tend to have the largest toe patches because the strap sits out of the way - making them the most versatile hookable shoes, especially for bouldering. Slippers need a flexible upper to get your foot in and out, which limits how much rubber can wrap the shoe. Lace-ups only gain an advantage when laces extend to the front, but that same front coverage blocks a full toe patch. In practice, velcro hits the sweet spot between closure security and maximum rubber real estate.</p>

<h3>Sensitivity - feeling the rock through your shoe</h3>
<p>Sensitivity measures rock feedback reaching your foot. It's driven by structural flexibility, thin rubber, rubber softness, minimal midsole, and light weight. Notice the tension with edging: the specs that maximise sensitivity (thin, soft, no midsole) are exactly the ones that minimise stiffness. This is the fundamental climbing shoe trade-off - you can't have maximum edging <em>and</em> maximum sensitivity in the same shoe.</p>

<h3>Comfort and Support - the other side of the coin</h3>
<p>Comfort blends soft feel, flat downturn, gentle asymmetry, upper material (leather scores highest), closure convenience, light weight, midsole cushioning, and rubber thickness. <strong>Support</strong> is essentially the inverse of sensitivity: stiff feel, hard rubber, thick soles, full midsole, and lace closure all maximise it. For multi-pitch trad routes, support prevents foot fatigue over hours of climbing. For bouldering sessions, comfort matters more for the time between attempts than during the climb itself.</p>

<p><strong>The central trade-off in every climbing shoe:</strong> sensitivity vs. support, and smearing vs. edging. A shoe that scores 90th percentile on edging will typically sit below 30th on smearing. A shoe built for maximum sensitivity sacrifices support. Understanding this trade-off is more important than chasing the "best" shoe - because the best shoe is the one that matches <em>your</em> climbing style.</p>

<h2>Why Foot Shape Matters More Than You Think</h2>
<p>Of our 331 adult shoes, the majority have an Egyptian last - longest big toe, tapering down. About a third use a Roman (square) last with the first 2-3 toes roughly equal. Only a handful target a Greek (Morton's) foot where the second toe is longest. If you have Greek toes, your options are genuinely limited, and choosing a mismatched last will cause hot spots and pain regardless of how well the shoe scores on performance.</p>
<p>Width and volume matter just as much. Most shoes have a medium heel volume, while roughly a third are narrow. If you have wide heels, only a small fraction of shoes in our database will fit comfortably - and no amount of break-in will fix a heel cup that's fundamentally too narrow. For heel specifically, ${L('/insights/heel-fit', 'width and depth are two independent dimensions')} - we have a full write-up on which shoes fit narrow vs. shallow heels. Similarly, most shoes target a standard forefoot volume, with far fewer options for low-volume or high-volume forefeet. Our Finder rewards foot shape matches, but the more important role of foot data is <em>filtering out</em> shoes that will never fit.</p>
<p><strong>Know your foot before you shop.</strong> Stand on a piece of paper, trace your foot, and identify your toe form (Egyptian, Roman, or Greek). Try on shoes at a local shop to learn your width and volume. Or skip the guesswork and use our ${L('/scan', 'free foot scanner')} - two phone photos, and it measures everything for you. Then use these parameters in our ${L('/find', 'Shoe Finder')} - they'll eliminate mismatches before you ever look at performance scores.</p>

<h2>Explore the Full Shoe Database</h2>
<p>Our interactive scatter chart maps all 331 shoes across six annotated zones. Green dots are beginner-to-intermediate shoes, orange dots are advanced-to-elite. Each zone corresponds to a distinct shoe archetype. Switch metrics, change the colour mode, and click any dot to see the full spec sheet on our ${L('/shoes', 'shoes comparison page')}.</p>
<p>${L('/find', 'Try the Shoe Finder - 6 questions, personalised results.')}</p>
`;

const inflatableCrashpads = `
<p><strong>Inflatable Crashpads: Game-Changer or Gimmick?</strong> They shatter the weight curve, fit inside your main pad, and double as a mattress. But would you trust one on sharp rock?</p>

<ul>
  <li><strong>Avg kg/m² (inflatable):</strong> 2.6 (vs 4.8 for foam pads)</li>
  <li><strong>Weight saving:</strong> 46% at the same thickness</li>
  <li><strong>Packed volume:</strong> ~5 L - fits inside any taco pad</li>
</ul>

<h2>Breaking the Trendline</h2>
<p>Among the pads in our database with 10-16cm thickness, the inflatables sit dramatically below the weight trendline. At 3.5-5.0 kg for 1.8-2.0 m² of landing area, they weigh roughly half of what foam pads deliver for the same coverage. That's not a marginal improvement - it's a category break.</p>
<p><strong>The weight advantage is real.</strong> A Snap Air Shock 1 delivers 1.8m² of 15cm-thick landing zone at just 5kg. A comparable foam pad (e.g. Snap Wrap Original: 1.5m², 15cm, 10kg) weighs twice as much for less area. That deflated Air Shock rolls up to roughly sleeping-bag size - meaning you can carry two full-size pads to the crag for barely more than the weight of one traditional pad.</p>

<h2>Cost per Area: Surprisingly Competitive</h2>
<p>You might expect air-chamber technology to come at a steep premium - but the data tells a different story. When you plot area vs price for the same 10-16cm thickness range, the inflatables are competitive with foam pads of comparable landing area. You're not paying a premium for lighter weight.</p>
<p><strong>Better value by every metric.</strong> Inflatables deliver roughly half the weight at a below-average €/m². In other words, the air-chamber technology doesn't just save weight - it saves money per square meter of landing zone too. That's genuinely rare in climbing gear.</p>

<h2>Packed Size: Where It Gets Ridiculous</h2>
<p>When deflated, an inflatable crashpad rolls down to roughly the size of a sleeping bag - about 5 liters of volume. Compare that to a foam pad of similar landing area, which stays the same massive rectangle whether you're climbing on it or carrying it to the crag.</p>
<p>The practical implication is huge: an inflatable fits inside most taco-fold or hinge-fold pads. You're not strapping a second bulky pad to the outside of your first one, Tetris-ing gear on your back, or making a second trip. Just roll it up, tuck it in, and hike normally. For long approaches this alone can be the deciding factor.</p>
<p><strong>Stacking made easy:</strong> Carry two full-size pads for the weight and bulk of roughly 1.5 traditional pads. Or three full-size pads at the weight of two - you can easily fit 2 inflatable pads into one conventional taco pad.</p>

<h2>Inflation: Easier Than You'd Think</h2>
<p>Initially our biggest concern: "I don't want to sit there pumping up a pad for 10 minutes." Fair - but some boulderers already carry a battery-powered blower to clean holds. That same blower inflates an entire crashpad in about 60 seconds.</p>
<p>And once it's inflated, you get something foam pads can't offer: adjustable firmness. Pump in more air for a firmer, more responsive landing surface on higher problems. Let some air out for a softer cushion on sit-starts or traverses.</p>

<h2>Where Inflatables Shine</h2>
<p>Inflatables are at their best on flat, even terrain with relatively low problems. Think sandy bouldering areas, forest clearings with soft ground, or gym-style outdoor walls. They're also unbeatable for van-life and traveling boulderers - a deflated pad takes up barely any space in your vehicle compared to a foam pad that dominates the entire cargo area.</p>
<p>The comfort factor shouldn't be underestimated either. Inflatables make surprisingly decent sleeping mats - they're thick and adjustable.</p>

<h2>The Honest Downsides</h2>
<p>Now for the part that matters most: where inflatables fall short. There are real limitations that every buyer should understand before dropping €200-300 on an air-filled pad.</p>
<p><strong>Puncture risk is real.</strong> Sharp rock edges, thorny vegetation, or even a stray piece of metal can puncture an air chamber. Unlike a foam pad that still works with a tear, a punctured inflatable loses its primary function. On sharp limestone or granite, we'd rather trust a good old foam pad.</p>
<p>The surface can feel slippery compared to textured foam pads, especially when wet or dusty. On uneven terrain - slopes, roots, small rocks - the pad tends to shift and wobble. Air also behaves differently from foam during impact: foam absorbs energy progressively, giving you gradual deceleration, while air compresses all at once, creating a bouncier, less predictable landing.</p>
<p><strong>No built-in storage.</strong> Foam pads typically have shoe pockets, chalk bag loops, and gear compartments. Inflatables have none of that. Your options are to carry the deflated pad inside your main foam pad or bring a separate bag.</p>

<h2>The Verdict</h2>
<p>Game-changer or gimmick? Neither - and both. Inflatable crashpads aren't here to replace your foam pad. They're here to complement it. The ideal setup for many boulderers is a traditional foam pad as the primary landing zone, with an inflatable tucked inside for extra coverage.</p>
<p><strong>Our recommendation:</strong> If you boulder on flat terrain, travel often, or do long approaches - an inflatable pad is genuinely transformative. As a second pad, it's arguably the best value-for-weight investment in bouldering gear. But if you only own one pad and climb on rough, rocky terrain, stick with proven multi-layer foam. The peace of mind is worth the extra kilos.</p>

<h2>Bonus: The Best Pool Float Money Can Buy</h2>
<p>An inflatable crashpad is, fundamentally, a quite large, very durable air mattress. Take it to the lake, the river, or the pool after a session and you've got the most luxurious float at the beach. It's 1.5-1.8m² of lounging surface - big and stable enough to actually lie on comfortably. Is this a legitimate purchase justification? Probably not. Does it bring joy? Absolutely.</p>

<p>${L('/crashpads', 'Browse all crashpads')}</p>
`;

const ropeCostVsSafety = `
<p><strong>Does Spending More Buy a Safer Climbing Rope?</strong> We crunched cost-per-gram, UIAA falls, and weight across single-certified climbing ropes in our database. The data challenges some common assumptions - and exposes what specs can't tell you.</p>

<ul>
  <li><strong>Correlation (price vs UIAA falls):</strong> weak and slightly negative - cost up does not buy more falls</li>
  <li><strong>Dry-treatment premium:</strong> roughly +25-30% on price per meter</li>
  <li><strong>Sweet-spot band:</strong> 9.5-9.8 mm - fiercest competition and the largest model count</li>
</ul>

<h2>Price vs Safety: A Weak Link</h2>
<p>Here's the uncomfortable truth: across our single-certified ropes, spending more per metre of rope does <em>not</em> buy you more UIAA fall ratings. The correlation is weak and actually negative. Thin, expensive alpine ropes at 8.9mm or below average around 5-6 UIAA falls at roughly €2.50/m, while budget-friendly 10mm+ ropes deliver 9-12 falls at about €1.50-€1.80/m. So where does the money go?</p>
<p><strong>You're paying for lightweight engineering, not durability.</strong> The premium on thin ropes funds R&amp;D in sheath construction, dry treatments, and weight-optimized cores. A 70m rope at ~52 g/m (≤8.9mm) weighs around 3.6 kg - versus 4.5+ kg at 64 g/m (≥11 mm). On a long alpine route, that weight difference is real. But on a fall rating chart, the thick rope wins by a mile.</p>

<h2>What the UIAA Fall Test Actually Tests</h2>
<p>This creates a genuine dilemma. The UIAA fall test is the one standardized, repeatable metric we have for rope durability. Every rope must survive at least 5 falls for certification - and most exceed that comfortably. But the test uses an 80kg mass, a 5.5m fall on 2.8m of rope (factor 1.78), and a sharp 10mm edge. It's a worst-case lab scenario, not a real-world climbing fall.</p>
<p><strong>The 9.5-9.8mm sweet spot is real - and it's driven by competition, not physics.</strong> This band holds more models than any other. More models means fiercer price wars and more choice. Moderate average falls, moderate weight, moderate pricing. Below 9.5mm you're in high-performance and eventually specialist alpine territory; above 9.8mm, weight climbs faster than durability.</p>

<h2>Falls per Gram: Efficiency Story</h2>
<p>Switch to a "Falls/Weight vs €/m" view and you'll see durability <em>efficiency</em>: how many UIAA falls you get per gram of rope weight, plotted against cost per metre. This normalizes for the obvious "thicker = more falls" effect and reveals which ropes actually punch above their weight class. But even here, the trend is essentially flat: paying more doesn't systematically buy better efficiency.</p>
<p><strong>What the data currently can't show you - and why it matters.</strong> UIAA falls measure one very specific thing: resistance to repeated, severe edge falls. What they don't capture is abrasion resistance - how your sheath holds up over months of threading through quickdraws, rubbing over rock, and eating grit at the gym. Sheath durability, handling characteristics, and knot-ability are arguably as relevant for day-to-day longevity as the number on the fall test - calling for standardised tests across manufacturers.</p>

<h2>The Dry-Treatment Story</h2>
<p>The dry treatment pattern tells its own story. Most ropes below 9.0 mm ship with dry treatment - these are mountain tools built for ice, mixed routes, and alpine weather where a wet rope can lose up to 40% of its dynamic strength. By 9.6-9.8mm the dry-treatment rate drops sharply; above 10mm it's a coin flip. Dry treatment adds a meaningful cost premium that's justified if you climb in wet conditions, but potentially wasted money if your rope lives mostly at the sport crag.</p>

<h2>Our Honest Take</h2>
<p>Pick your rope by how you climb. Alpine multi-pitch? Go thin, dry, and accept the lower fall count. Single-pitch sport? A 9.5-9.8mm untreated rope gives you the best combination of price, weight, and durability - thinner ropes will wear faster whilst treatments add unnecessary cost. Gym only? Grab a thick 10mm+ workhorse - you'll get maximum falls-per-euro and you won't care about the extra weight. Use our ${L('/ropes?view=chart', 'rope comparison')} to filter by diameter, weight, and price.</p>
`;

const footScanner = `
<p><strong>How our Foot Scanner Works.</strong> Two photos, seven measurements, 400+ shoes ranked over 30 attributes. Here's what actually happens when you scan your foot.</p>

<h2>What you need</h2>
<p>A phone with a camera. That's it. No app, no account, no special paper. Open the ${L('/scan', 'scanner')} in your mobile browser, take a photo of the sole of your foot and one from the side. The whole thing takes about 60 seconds.</p>
<ul>
  <li><strong>Photos needed:</strong> 2 (sole + side view)</li>
  <li><strong>Measurements:</strong> 7 extracted automatically</li>
  <li><strong>Shoes compared:</strong> 400+ across 30 attributes</li>
</ul>

<h2>How to get a good scan</h2>
<p>Photo quality is the single biggest factor in scan accuracy. Straight camera angle and good lighting matters more than camera resolution. Stand on a flat, contrasting surface (light floor works best). For the sole photo, point the camera straight down at your foot. For the side photo, place the camera on the floor, level with your foot so your full profile is visible from heel to toes.</p>
<p>The scanner will guide you through each step with an overlay outline. Try to fill the outline with your foot. After each photo, you'll see a review screen with a checklist: does the outline match? Is the full foot visible? Is the image sharp? If not, retake it. A retake costs 10 seconds; a bad scan wastes the whole result.</p>
<p><strong>Tip:</strong> Avoid backlighting (no window behind your foot). The scanner needs contrast between your foot and the background to isolate the outline.</p>

<h2>What gets measured</h2>
<p>From the sole photo, the scanner extracts five measurements: forefoot width, heel width, arch length, toe shape (Egyptian, Greek, or Roman), and hallux valgus tendency. From the side photo, it measures instep height and heel depth. These seven values are expressed as ratios relative to your foot length, so the actual size of the photo doesn't matter.</p>
<p>Each measurement is classified into a range (narrow, medium, wide for width; low, medium, high for instep) and combined into an overall foot profile. This profile is what gets matched against the shoe database.</p>

<h2>What you tell it</h2>
<p>After the photos, the scanner asks a few questions: your street shoe size and your current climbing shoe (brand, model, size, and how it fits in three zones: toes, forefoot, and heel). This fit feedback is critical because it tells the system what works and what doesn't in a shoe you already know. If your heel feels empty but the forefoot is perfect, the scanner considers this on top to the measurements to find shoes with a fitting heel cup but keep the forefoot geometry.</p>
<p>Related reading: ${L('/insights/heel-fit', 'Climbing shoe heel fit: narrow vs. shallow heels')} - why the same "empty heel" complaint has two completely different causes.</p>

<h2>What you get back</h2>
<p>The result page has two parts. First, three interpretation sections that explain your foot shape in plain language, what your current shoe fit tells us, and what to look for in your next shoe. Second, 12 shoe recommendations split into four tiers of three shoes each: baseline (matching your current shoe's stiffness), softer, stiffer, and budget options.</p>
<p>Each recommended shoe comes with a description of why it was selected for your foot and any tradeoffs to consider. Recommendations include a suggested size based on your street size, brand-specific sizing patterns, and the downsize of your current shoe.</p>

<h2>A real scan, start to finish</h2>
<p>Here's what a real scan looks like. The foot belongs to a male climber, street size EU 44.5, currently wearing La Sportiva Solutions in EU 43 with squeezed toes but empty heels.</p>
<p>The scanner detected an Egyptian toe shape, narrow forefoot (width ratio 0.343), narrow heel (0.213), low instep (0.242), and long arch. The foot has a consistently slim profile front to back, pointing toward low-volume shoes.</p>
<p>The fit feedback from the Solutions was key: the squeezed toes despite generous sizing (only 1.5 sizes down vs the typical 2.5 for La Sportiva) flagged a toe box shape mismatch, not a width problem. The empty heel confirmed the narrow, shallow heel profile from the scan. The scanner adjusted its targets accordingly: medium-width shoes (one step wider than the raw scan suggests) to avoid repeating the toe squeeze, while looking for a narrow heel volume to fix the empty heel.</p>
<p>Top recommendations included the Drone 2.1 HV, Unparallel Souped Up, and Red Chili Voltage Lace in the baseline tier, with the La Sportiva Mantra and Evolv Zenist as softer alternatives. Budget picks included the Black Diamond Shadow and Boreal Ninja.</p>
<p><strong>The fit feedback loop:</strong> Every scan with shoe fit data makes the system smarter. The more climbers scan their feet and rate how their current shoes fit, the better the recommendations become for everyone. If you scan, tell it about your shoes.</p>

<h2>What it can't do (yet)</h2>
<p>The scanner is good at matching foot geometry to shoe geometry and selecting models from our database. But for now the database relies mostly on manufacturer inputs and selected reviews which are often not accurate and not based on an underlying foot geometry - however, this will improve with every scan and fit input.</p>
<p>Processing is sequential right now. If many people scan at the same time, you'll wait in a short queue. It won't break, but it might take a minute instead of ten seconds.</p>
<p>And nothing replaces trying shoes on. If you have access to a shop with good stock, go try shoes. This tool is built for the many climbers who order online and want to narrow down the options before committing.</p>

<p><strong>Ready to find your shoe?</strong> 60 seconds, no account, free. ${L('/scan', 'Start Scanning')}.</p>
`;

const heelFit = `
<p><strong>Climbing Shoe Heel Fit: Why "Narrow Heel" Isn't Enough.</strong> Narrow heel or shallow heel? The same "empty heel" may have two completely different causes - and different shoes fix each one.</p>

<h2>Why heel fit is hard to predict</h2>
<p>Heel fit is key to climbing shoe performance, especially for hard boulders where a better fit, and hence less slip on aggressive heel hooks, makes a big difference. Yet, it's incredibly hard to pick the right heel from today's available online descriptions. Climbing shoes get often described with single words like "narrow" or "low-volume" on both the forefoot and the heel side, and this is simply insufficient. Two climbers with the same heel width can have a very different fit in the same shoe. This article breaks down heel width and heel depth using data from our first 200 foot scans.</p>

<h2>Heel width vs. heel depth: two independent dimensions</h2>
<p>Sizing guides often treat the heel as a single dimension: narrow, normal, or wide. That's simply not enough. Our scanner explicitly captures two photos, sole and side, to measure two independent heel dimensions.</p>
<p><strong>Heel width ratio</strong> captures how wide your heel is relative to your foot length. Our scans range from 0.20 (very narrow) to 0.28 (wide). The average sits around 0.24.</p>
<p><strong>Heel depth ratio</strong> captures the vertical profile of your heel, essentially how much it projects backward from your ankle. This ranges from 0.01 to 0.12, with the average around 0.035. A shallow heel (under 0.03) and a deep heel (over 0.05) need fundamentally different cup shapes.</p>
<p>These two numbers are surprisingly independent. You can have a narrow heel with deep projection, or a wide heel that's shallow. They produce very different fit problems, and shoes respond to them differently.</p>

<h2>A sample to showcase narrow heel vs. shallow heel</h2>
<p>Here are two real scans from our dataset. Both climbers reported an empty heel in at least one popular shoe. The underlying mismatch is the opposite in each case.</p>

<h3>Scan A - Narrow heel width with average depth</h3>
<p>Egyptian toes, street size EU 45.5. Heel width ratio 0.216, heel depth ratio 0.047. Reported fits: ${L('/shoe/scarpa-drago', 'Scarpa Drago')} EU 44 empty, ${L('/shoe/scarpa-instinct-vsr-mens', 'Scarpa Instinct VSR')} EU 44 empty, ${L('/shoe/la-sportiva-ondra-comp', 'La Sportiva Ondra Comp')} EU 43 empty, ${L('/shoe/scarpa-instinct-vsr-lv', 'Scarpa Instinct VSR LV')} EU 44 perfect, ${L('/shoe/mad-rock-d2-one-hv', 'Mad Rock D2.ONE HV')} EU 46 perfect.</p>
<p>Heel width is well below the population average whilst depth is slightly above average. The three empty heels are all shoes whose cups are too wide for this climber. The low-volume Instinct VSR LV and the high-volume D2.ONE HV with its rather narrow heel cup both grip, the standard-fit heels don't. The problem here is clearly width, not depth.</p>

<h3>Scan B - Shallow heel depth with average width</h3>
<p>Egyptian toes, street size EU 42.5. Heel width ratio 0.251, heel depth ratio 0.024. Reported fits: ${L('/shoe/la-sportiva-skwama', 'La Sportiva Skwama')} EU 39.5 empty, ${L('/shoe/la-sportiva-tc-pro', 'La Sportiva TC Pro')} EU 41 empty, ${L('/shoe/evolv-shaman', 'Evolv Shaman')} EU 42.5 empty, ${L('/shoe/tenaya-mastia', 'Tenaya Mastia')} EU 39.5 perfect.</p>
<p>Heel width is around the population average (climber 0.251 vs population 0.238), while heel depth is clearly below (0.024 vs 0.034). Three shoes report empty heels and only the Tenaya Mastia, which uses a pre-shaped and rather firm heel cup, locks in. Going narrower on width wouldn't help any of the empty-heel shoes; this is a depth problem. A narrower heel would likely even worsen the situation, resulting in empty space at the back AND bottom of the heel as the foot wouldn't fit into the narrow profile.</p>

<p>Same written complaint, "empty heel", but two different mechanisms. If you treated both climbers as "narrow-heeled" and pointed them at low-volume lasts, you'd help Scan A and make Scan B worse.</p>
<p>There is a wrinkle on the Scan B side. The one shoe that gripped was the Tenaya Mastia, whose heel cup is pre-shaped from a firm, thermo-molded rubber shell, meaning the cup holds its own form. The ${L('/shoe/la-sportiva-solution-mens', 'La Sportiva Solution')} uses the same idea: a firm, bulbous molded cup reinforced by P3 randing. Both of our other shallow-heel scans who wear the Solution (heel depth 0.021 and 0.024) also report perfect heel fit. Three out of three shallow heels in firm pre-formed cups landing on "perfect" is a small sample, but it is a consistent one, we'll keep watching it.</p>

<ul>
  <li><strong>Foot scans:</strong> 201 (as of 2026-04-13)</li>
  <li><strong>Fit observations:</strong> 280 across 97 shoes</li>
  <li><strong>Shoes with ≥10 reports:</strong> 4 - first patterns visible</li>
</ul>

<h2>Which climbing shoes fit which heel shapes? (Data from 280 reports)</h2>
<p>When someone scans their feet, they also tell us what shoes they currently climb in and how those shoes fit: toes, forefoot, and heel, each rated as squeezed/tight, perfect, or loose/empty. That lets us match real fit outcomes against measured foot geometry. Patterns for every shoe in the dataset with more than 10 fit reports:</p>

<table>
  <thead>
    <tr><th>Shoe</th><th>Reports</th><th>Perfect heel</th><th>Dominant fit issues</th><th>Fits best</th></tr>
  </thead>
  <tbody>
    <tr><td>${L('/shoe/scarpa-instinct-vsr-mens', 'Scarpa Instinct VSR')}</td><td>13</td><td>23%</td><td>Narrow + shallow heels fail</td><td>Wider, deeper heels</td></tr>
    <tr><td>${L('/shoe/la-sportiva-skwama', 'La Sportiva Skwama')}</td><td>10</td><td>10%</td><td>Shallow heels fail (soft 3D cup)</td><td>Deeper heels, any width</td></tr>
    <tr><td>${L('/shoe/scarpa-drago', 'Scarpa Drago')}</td><td>11</td><td>55%</td><td>Narrow heels fail; depth-tolerant</td><td>Wider heels, any depth</td></tr>
    <tr><td>${L('/shoe/evolv-shaman', 'Evolv Shaman')}</td><td>10</td><td>50%</td><td>Shallow heels fail; width-tolerant</td><td>Deep-projecting heels</td></tr>
  </tbody>
</table>

<h3>Scarpa Instinct VSR (13 reports)</h3>
<p>77% empty heels. Empty-heel users average heel width 0.231 (narrow) with normal depth (0.036). The two users reporting a perfect heel have slightly wider heels (0.239) <em>and</em> notably deeper projection (0.053). Both dimensions seem to matter.</p>

<h3>La Sportiva Skwama (10 reports)</h3>
<p>90% empty heels. Eight of the nine empty-heel users have normal-to-wide heel width (avg 0.245), they're not narrow-heeled. What unites them is shallow depth (avg 0.027). Worth noting: the Skwama also uses a 3D molded heel cup, but a notably softer one than the Mastia or Solution. Its reinforcement (La Sportiva's "S-Heel") is a stiffener on the sides of the cup, not a firm backwards shell. So "3D molded" alone doesn't guarantee a shallow heel will grip - cup firmness likely matters too.</p>

<h3>Scarpa Drago (11 reports)</h3>
<p>55% perfect, 36% empty. Empty-heel users average heel width 0.225, perfect-heel users 0.251 with quite mixed heel depth. Apparently forgiving on depth, but not a good fit for narrow heels.</p>

<h3>Evolv Shaman (10 reports)</h3>
<p>A textbook depth split. Heel width is nearly identical between perfect-fit (0.245) and empty-fit (0.246) users. Depth tells the whole story: perfect users average 0.072, empty users 0.031. A 2.3× difference. If your heel projects deeply, the Shaman's aggressive rand tension grips it. If it doesn't, you float.</p>

<h2>A new shape emerging? Mad Rock D2.ONE HV</h2>
<p>An interesting counterpoint is emerging in the ${L('/shoe/mad-rock-d2-one-hv', 'Mad Rock D2.ONE HV')} (8 reports so far): 7 perfect heels, 1 tight, zero empty. It's marketed as a high-volume shoe yet has a rather narrow heel cup. The first shoe in our dataset where "empty heel" essentially doesn't show up. We'll watch it closely as the sample grows.</p>

<h2>Recommendations for narrow heels</h2>
<p>You can mostly rely on the manufacturer data: shoes advertised with a narrow overall and/or narrow heel fit should work well. If you have a wider forefoot but a rather narrow heel, we'd recommend looking into the Mad Rock Drone series HV models (the ${L('/shoe/mad-rock-drone-2-hv', 'Drone 2.0 HV')}, the ${L('/shoe/mad-rock-d2-one-hv', 'D2.ONE HV')}, and the ${L('/shoe/mad-rock-drone-cs-hv', 'Drone CS HV')}) and some Evolv models such as the ${L('/shoe/evolv-v6', 'V6')} and ${L('/shoe/evolv-zenist-pro', 'Zenist Pro')}.</p>

<h2>Recommendations for shallow heels</h2>
<p>This is where it gets trickier. In most online sources, including manufacturer data, heel depth is not clearly distinguished from heel width. From the current scan data, one viable path might be a firm, molded cup that potentially leaves some dead space but preserves its shape even when not fully filled by the heel, such as the ${L('/shoe/la-sportiva-solution-mens', 'La Sportiva Solution')} and the ${L('/shoe/tenaya-mastia', 'Tenaya Mastia')}. Alternatively you can visually inspect the shoe's construction and heel form: is it a rather flat back, or does it bulge significantly below the tensioning rand? We will update this article as soon as we have more data.</p>

<h2>How we implement two-dimensional heel scoring</h2>
<p>This is what makes heel fit hard. The same "empty heel" complaint has completely different causes depending on the shoe and foot, but standard manufacturer descriptions often rely on a single generic fit aspect. Treating "heel" as one variable misses the mechanism.</p>
<p>Hence, our scorer uses two dimensions. When it evaluates whether a shoe's heel cup will work for you, it weights heel width and heel depth separately, calibrated by what we've learned from each shoe's fit pattern. We're also starting to tag shoes by heel-cup construction - firm pre-formed cups (Solution, Mastia) versus soft/thin cups with side reinforcement (Skwama) - because the same shallow-heel foot gets opposite outcomes depending on which type it meets. Moving forward we also want to introduce a proper 3D modelled heel to identify additional patterns and improve the quality of our recommendations.</p>

<h2>Still early, getting sharper</h2>
<p>We have performed 200 scans so far, enough to see first patterns for the four most popular models, but for many shoes we still only have too few data points. Incoming scans are growing rapidly and every scan that includes a current shoe fit adds to our recommendation engine. The model doesn't guess: it uses deterministic scoring and gets more precise as the dataset grows.</p>
<p>The goal isn't to replace trying shoes on. It's to narrow the field from 400+ shoes to the dozen that match your geometry, before you spend money on shipping or drive to a shop that might not stock what you need.</p>

<h2>Frequently Asked Questions</h2>

<h3>Why does my climbing shoe heel feel empty?</h3>
<p>An empty heel almost always comes down to one of two independent mismatches between your foot and the shoe's heel cup: heel width (how wide your heel is relative to your foot length) or heel depth (how far your heel projects backward from your ankle). A single adjective like "narrow heel" hides which one is actually wrong. In the climbing-gear.com foot-scan dataset (April 2026), the Scarpa Instinct VSR, La Sportiva Skwama, Scarpa Drago and Evolv Shaman each fail for different reasons.</p>

<h3>Which climbing shoes fit narrow heels?</h3>
<p>Based on climbing-gear.com foot-scan data, the best bets for narrow heels (heel width ratio under ~0.23) are the Scarpa Instinct VSR LV and the Mad Rock D2.ONE HV. The Instinct VSR LV is specifically narrowed through the heel; the D2.ONE HV is unusual in pairing a high-volume last with a rather narrow heel cup. Standard-width cups from Scarpa Drago, Scarpa Instinct VSR, and La Sportiva Ondra Comp often leave narrow heels empty.</p>

<h3>Which climbing shoes fit shallow heels?</h3>
<p>Shoes with firm, pre-shaped heel cups work best for shallow heels (heel depth ratio under ~0.03). In our dataset, the Tenaya Mastia and La Sportiva Solution both lock shallow heels in because their molded rubber shells hold their own form, rather than relying on rand tension to pull flat rubber tight. Shoes that consistently fail on shallow heels include the La Sportiva Skwama (90% empty), Evolv Shaman, and La Sportiva TC Pro.</p>

<h3>Does the Scarpa Instinct VSR fit narrow heels?</h3>
<p>Not reliably. Across 13 reports, the Scarpa Instinct VSR produced empty heels in 77% of cases, concentrated on climbers with heel width below 0.23 and normal-to-shallow depth. The low-volume Scarpa Instinct VSR LV is a much better choice for narrow heels.</p>

<h3>Does the La Sportiva Skwama fit shallow heels?</h3>
<p>No. Across 10 reports, the Skwama produced empty heels in 90% of cases, and the pattern is clearly shallow depth rather than narrow width. The Skwama's "S-Heel" reinforcement is a side stiffener, not a firm rear shell, so a shallow heel can't generate enough rearward pressure to fill the cup.</p>

<h3>What's the difference between a narrow heel and a shallow heel?</h3>
<p>Heel width is how wide your heel is relative to foot length (population average ~0.24). Heel depth is how far your heel projects backward from your ankle (population average ~0.034). They're largely independent: you can have a narrow heel with deep projection, or a wide heel that's shallow. Each needs a different cup shape, which is why single-adjective descriptions like "narrow heel" aren't enough.</p>

<p><strong>Try it yourself:</strong> ${L('/scan', 'climbing-gear.com/scan')}.</p>
`;

const scarpaBlackbird = `
<p><strong>Scarpa Blackbird Review: I Tested the Most Expensive Shoe on Sandstone Edges.</strong> First-person review of Scarpa's first carbon-enhanced midsole shoe. Tested on the vertical micro-edges of a sandstone quarry in Edenkoben. What works, what does not, and how it compares to seven established edging shoes.</p>

<ul>
  <li><strong>Midsole:</strong> Carbon-enhanced, 3D-molded, very stiff platform extending through ~3/4 of the shoe</li>
  <li><strong>Rubber:</strong> 3.5 mm XS Grip 2 (soft)</li>
  <li><strong>Downturn:</strong> Moderate - <strong>Asymmetry:</strong> Strong</li>
  <li><strong>Last:</strong> Narrow to medium forefoot, slightly wider heel</li>
  <li><strong>Tested at:</strong> EU 44.5 (street size 45.5, usual Scarpa 44)</li>
</ul>

<h2>TL;DR</h2>
<p>Interesting shoe, but for me not worth the money. Shoes like the ${L('/shoe/la-sportiva-otaki-mens', 'La Sportiva Otaki')} or ${L('/shoe/scarpa-vapor-v-mens', 'Scarpa Vapor V')} deliver comparable edging performance at roughly half the price. The thin XS Grip 2 rubber will likely not last long, so you end up paying a huge premium for a shoe that needs a resole rather quickly. Only worth recommending if you genuinely need that last bit of performance and price is no object. The standout positive: comfy from day 1, literally zero break-in period.</p>

<h2>What is new about the Blackbird</h2>
<p>The headline feature is Scarpa's first carbon-enhanced 3D molded midsole. It is a deliberately polarising design choice: a very stiff carbon platform combined with thin and relatively soft XS Grip 2 rubber. The idea is that the carbon does the structural work (edging power, support) while the thin rubber retains sensitivity and friction.</p>
<p>For my home crag - a sandstone quarry where vertical climbing on micro-smears and small edges is the name of the game - that combination sounded promising. A stiff platform that still lets you feel the rock and smear on blank parts of the wall would be ideal for that style of climbing.</p>

<h2>Fit</h2>
<p>The last is strongly asymmetric with a moderate downturn. The forefoot is narrow to medium, while the heel is a touch wider than I would have expected given Scarpa advertises the shoe as a narrow fit (unfortunate for me).</p>
<p>I am a street size 45.5 and I usually wear Scarpa in 44. Following Scarpa's own recommendation to size up by 0.5 from your usual Scarpa size, I went with 44.5, which worked well overall. The shoe felt surprisingly comfortable out of the box - unlike most other stiff edging shoes.</p>

<h3>How it actually fits my foot</h3>
<p>The forefoot and toes fit my low to mid volume foot very well; the front of the shoe is genuinely precise out of the box - supportive yet sensitive. The heel is a different story for me: it feels loose and I am not entirely sure what the intent of this new construction is.</p>
<p>These measurements were taken with the climbing-gear.com ${L('/scan', 'free Foot Scanner')} - feel free to run it for a direct comparison to my foot shape.</p>

<h2>Performance</h2>
<p>The midsole is indeed extremely stiff and seems to extend through roughly three quarters of the shoe. Under the toes the forefoot is heavily concaved, more so than the typical Scarpa, and closer in feel to the ${L('/shoe/la-sportiva-otaki-mens', 'La Sportiva Otaki')} or the 3D-molded Mad Rock shoes.</p>
<p>The toe is genuinely very precise and, despite the stiffness, the shoe does not climb like a rigid board: there is real sensitivity at the very tip. On micro-edges that combination is impressive.</p>
<p>The catch: while my toe stayed firmly planted on the edge, the midfoot flexed surprisingly a lot. When I pushed maximum pressure onto the front of the shoe, it almost felt like my foot was slipping out of the back. I suspect this is a direct consequence of the loose heel rather than a construction issue, but the effect on the wall is the same: not enough stability on small edges when I have to load them with full body weight and then move upwards.</p>

<h3>Rubber and durability expectation</h3>
<p>XS Grip 2 is excellent rubber for friction on small features, which is exactly what you want on sandstone, but it obviously wears faster than stiff compounds. Combined with how aggressively you load the front of the shoe on micro-edges, my expectation is that the toe tip will wear through faster than on a typical edging shoe with thicker XS Edge rubber or similar. So you are paying a premium price for a shoe that will likely need a resole sooner than its peers.</p>

<h2>Verdict</h2>
<p>"Interesting shoe, and the carbon-enhanced platform delivers on precise edging. But for me, the loose heel undermines the very thing the carbon is supposed to enable, and the thin + soft rubber means you will resole it sooner. At this price point, only buy the Blackbird if you truly need that last 5% of performance and it fits your entire foot. Otherwise the alternatives below give you comparable performance for half the money."</p>

<h2>Alternatives worth considering</h2>
<p>Each of these tackles the same problem of precise edging on vertical to slightly overhanging terrain.</p>
<ul>
  <li><strong>${L('/shoe/la-sportiva-otaki-mens', 'La Sportiva Otaki')}:</strong> Moderately aggressive shoe with a concave forefoot, XS Grip 2 rubber and a stiff midsole tuned for small edges. The most direct comparison. Not as extreme as carbon, but at roughly half the price the value proposition is hard to beat. Also a pretty similar fit.</li>
  <li><strong>${L('/shoe/la-sportiva-katana-lace-mens', 'La Sportiva Katana Lace')}:</strong> Long-standing vertical edging benchmark. Comparable edging precision but less good for "pulling" on foot holds. Slightly wider forefoot but tighter heel cup.</li>
  <li><strong>${L('/shoe/scarpa-vapor-v-mens', 'Scarpa Vapor V')}:</strong> Versatile all-rounder from Scarpa with a similar last philosophy but less aggressive. A workhorse if you want a Scarpa edging shoe without committing to a carbon midsole.</li>
  <li><strong>${L('/shoe/scarpa-boostic', 'Scarpa Boostic')}:</strong> More downturned, more aggressive Scarpa with a similar focus on precise toeing in. Far less sensitive but better suited if your projects also include steeper terrain.</li>
  <li><strong>${L('/shoe/eb-strange', 'EB Strange')}:</strong> Quirky outsider option with an unusual shape and construction, surprisingly capable on small edges and often overlooked.</li>
  <li><strong>${L('/shoe/unparallel-up-beat', 'Unparallel Up Beat')}:</strong> Unparallel's latest edging-focused shoe. A strong alternative for Greek or Roman toe profiles with a less pointy toe box and less asymmetry. Far more versatile and forgiving for non-Egyptian toe forms.</li>
  <li><strong>${L('/shoe/evolv-geshido', 'Evolv Geshido')}:</strong> Stiff edging shoe using Evolv's TRAX rubber, aimed at precise small-edge performance. Worth a direct comparison if you are into Evolv.</li>
</ul>

<h2>Who should actually buy the Blackbird?</h2>
<p>If you seek maximum performance on the smallest edges but want to keep sensitivity and comfort, the price is not a blocker, and your foot has a wider heel than mine, the Blackbird might be a real step ahead. For everyone else, including me, the ${L('/shoe/la-sportiva-otaki-mens', 'Otaki')}, ${L('/shoe/unparallel-up-beat', 'Up Beat')} or ${L('/shoe/scarpa-vapor-v-mens', 'Vapor V')} will get you most of the way there at a fraction of the cost.</p>

<p>${L('/insights', 'Read more climbing-gear.com insights')} or ${L('/scan', 'compare your own foot to mine using the free Foot Scanner')}.</p>
`;

export const ARTICLE_BODIES = {
  '/insights/climbing-shoe-guide': climbingShoeGuide,
  '/insights/inflatable-crashpads': inflatableCrashpads,
  '/insights/rope-cost-vs-safety': ropeCostVsSafety,
  '/insights/foot-scanner': footScanner,
  '/insights/heel-fit': heelFit,
  '/insights/scarpa-blackbird': scarpaBlackbird,
};
