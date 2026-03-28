# Review vs DB Audit

## Process
1. For each shoe: fetch DB entry + all reviews from Supabase
2. Compare review claims against DB specs (downturn, asymmetry, closure, feel, volume, width, best_foothold_types, best_wall_angles, skill_level, sizing, rubber, weight, vegan, etc.)
3. Flag contradictions between reviews and DB
4. For flagged contradictions: run online research (manufacturer page, retailers) to determine correct value
5. Present numbered list of recommended DB fixes for Roman's approval
6. Apply approved fixes to Supabase, regenerate seed, commit + push

## Batch 1 (completed): Mad Rock (5 shoes)
- Drone CS HV: removed smear from best_foothold_types
- Drone CS LV: removed smear, added greek to toe_form
- Phoenix: removed smear, asymmetry none->slight
- Rover: downturn flat->slight, wall angles to vertical/overhang, updated description
- D2.ONE LV: no changes needed

## Batch 2 (completed): BD + Boreal (10 shoes)
- Andrea Boldrini Tiger: no changes (review was negative fit complaint only)
- Andrea Boldrini Tiger Evo: no changes (same)
- BD Aspect: no changes (specs confirmed)
- BD Focus: fixed sizing text to match stretch_expectation
- BD Method: added trad_multipitch to use_cases; reassigned misplaced MountainReview to Method S
- BD Method S: added slab, removed roof from wall_angles
- BD Momentum: fixed sizing text (runs small)
- BD Shadow: downturn aggressive->moderate, weight 520->440g, removed smear from footholds
- BD Zone: fixed sizing text (runs extremely small)
- Boreal Alpha: wall_angles overhang/roof->slab/vertical

## Batch 3 (completed): Boreal + Butora (10 shoes)
- Ballet Gold: removed smear from best_foothold_types
- Beta: no changes needed
- Dharma: stretch none->minimal
- Mutant: feel moderate->moderate-soft, stretch minimal->half_size, heel medium->narrow
- Ninja: heel medium->narrow
- Ninja Junior: no changes needed
- Acro Comp: feel stiff-moderate->moderate-soft
- Brava: kids_friendly false->true, feel stiff->soft
- Endeavor: fixed sizing text
- Gomi: removed edge from best_foothold_types

## Batch 4 (completed): Butora + Climb X + EB (10 shoes)
- Butora Komet: vegan true->false, upper_material synthetic->microfiber (Italian microfibre suede + leather footbed), weight_g 500->680
- Butora Sensa: no changes needed
- Climb X Apex: no changes needed
- Climb X Kinder: no changes needed
- Climb X Rave Strap: vegan true->false (leather upper), sizing text updated (runs small)
- Climb X Rave X Strap: vegan true->false (leather upper), sizing text updated (runs extremely small)
- Climb X Rock-It NLV: major overhaul — downturn flat->aggressive, asymmetry none->strong, feel stiff->moderate, skill_level beginner->intermediate/advanced, wall_angles slab/vertical->vertical/overhang/roof, footholds smear->edge/pocket, weight_g 490->822, sizing text updated
- EB Guardian 3.0: weight_g 860->430 (was incorrectly doubled)
- EB Red: no changes needed
- EB Strange: no changes needed

## Batch 5 (completed): Evolv (10 shoes)
- Ashima: upper_material synthetic->leather, vegan true->false, kids_friendly false->true
- Defy: feel stiff-moderate->moderate-soft, sizing text updated (runs large)
- Elektra: skill_level hobby/intermediate->beginner/hobby, heel_volume narrow->medium (reviews say baggy heel)
- Kira: sizing text updated (runs very small, size 2+ up)
- Kronos: removed overhang from best_wall_angles
- Nighthawk: vegan true->false, upper_material synthetic->leather/synthetic
- Oracle: downturn moderate->aggressive, wall_angles removed slab added roof, skill_level intermediate/advanced->advanced/elite
- Phantom: removed smear from best_foothold_types
- Rave: closure velcro->slipper, vegan true->false, stretch none->full_size, sizing text updated
- Royale: stretch_expectation none->half_size
