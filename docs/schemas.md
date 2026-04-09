# Database Schemas (Supabase)

Project URL: `https://wsjsuhvpgupalwgcjatp.supabase.co`

## shoes

Main product table. ~750 rows.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Auto-generated PK |
| brand | text | |
| model | text | |
| slug | text | Unique, used in URLs and image paths |
| image_url | text | DB image URL (overridden by local images) |
| images | jsonb | Additional image URLs |
| forefoot_volume | text | low/medium/high (formerly "volume") |
| width | text | narrow/medium/wide |
| heel_volume | text | low/medium/high (formerly "heel") |
| skill_level | jsonb | Array: beginner/intermediate/advanced/expert |
| use_cases | jsonb | Array: sport, boulder, trad, multi-pitch, crack, gym, etc. |
| best_rock_types | jsonb | Array |
| best_wall_angles | jsonb | Array |
| best_foothold_types | jsonb | Array |
| feel | text | soft/medium-soft/medium/medium-stiff/stiff |
| price_uvp_eur | numeric | Manufacturer retail price |
| current_price_eur | numeric | Best current price |
| discount_pct | numeric | Current discount percentage |
| closure | text | velcro/lace/slipper (see CLAUDE-README for rules) |
| asymmetry | text | none/slight/moderate/strong |
| downturn | text | flat/slight/moderate/aggressive |
| toe_patch | text | |
| heel_rubber_coverage | text | |
| ankle_protection | text | |
| durability | jsonb | Array |
| rubber_type | text | Vibram XS Grip, etc. |
| rubber_hardness | jsonb | Array: soft/medium/hard |
| rubber_thickness_mm | numeric | SOLE rubber only (not rand) |
| midsole | text | |
| midsole_stiffness | text | |
| rand | text | |
| gender | text | |
| kids_friendly | boolean | |
| upper_material | text | |
| weight_g | numeric | PAIR weight (both shoes) - NON-NEGOTIABLE |
| stretch_expectation | text | |
| break_in_period | text | |
| description | text | |
| pros | jsonb | Array |
| cons | jsonb | Array |
| sizing | text | |
| customer_voices | jsonb | |
| vegan | boolean | ALL components must be animal-free |
| resoleable | boolean | |
| toe_form | jsonb | Array: egyptian/greek/roman/celtic/germanic |
| mfr_downsize_min_eu | numeric | Manufacturer recommended downsizing |
| mfr_downsize_max_eu | numeric | |
| mfr_toe_box | text | |
| mfr_heel | text | |
| mfr_volume | text | |
| no_edge | boolean | |
| special_fit_notes | text | |
| computed_stiffness | numeric | Generated column |
| admin_flags | text | Internal only, stripped from public queries |
| data_confidence | text | Internal only, stripped from public queries |
| created_at | timestamptz | |
| updated_at | timestamptz | |

## ropes

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| slug | text | Unique |
| brand | text | |
| model | text | |
| year_released | integer | |
| status | text | |
| image_url | text | |
| product_url | text | |
| rope_type | text | dynamic/static/twin/half |
| triple_rated | boolean | |
| static_type | text | |
| certification | jsonb | Array |
| diameter_mm | numeric | |
| weight_per_meter_g | numeric | |
| sheath_percentage | numeric | |
| sheath_slippage_mm | numeric | |
| knotability_mm | numeric | |
| static_elongation_pct | numeric | |
| dynamic_elongation_pct | numeric | |
| uiaa_falls | integer | |
| impact_force_kn | numeric | |
| breaking_strength_kn | numeric | |
| working_elongation_pct | numeric | |
| falls_en1891 | integer | |
| core_material | text | |
| dry_treatment | text | |
| dry_treatment_name | text | |
| uiaa_water_repellent | boolean | |
| core_construction | text | |
| sheath_technology | text | |
| aramid_protection | boolean | |
| middle_mark | boolean | |
| end_marks | boolean | |
| available_lengths_m | jsonb | Array |
| available_colors | jsonb | Array |
| lap_coiled | boolean | |
| rope_bag_included | boolean | |
| best_use_cases | jsonb | Array |
| skill_level | jsonb | Array |
| handling_feel | text | |
| durability_rating | text | |
| compatible_device_types | jsonb | Array |
| min_compatible_diameter_mm | numeric | |
| max_compatible_diameter_mm | numeric | |
| bluesign | boolean | |
| recycled_materials | boolean | |
| pfc_free | boolean | |
| eco_label | text | |
| price_uvp_per_meter_eur | numeric | |
| price_per_meter_eur_min | numeric | |
| price_per_meter_eur_max | numeric | |
| discount_pct | numeric | |
| available_in | jsonb | Array of retailers |
| description | text | |
| pros | jsonb | |
| cons | jsonb | |
| ai_review | text | |
| rope_color_1 | text | |
| rope_color_2 | text | |

## crashpads

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| brand | text | |
| model | text | |
| slug | text | Unique |
| year_released | integer | |
| image_url | text | |
| images | jsonb | |
| pad_size_category | text | |
| fold_style | text | |
| best_use | jsonb | Array |
| length_open_cm | numeric | |
| width_open_cm | numeric | |
| thickness_cm | numeric | |
| weight_kg | numeric | |
| landing_area_sqm | numeric | Generated |
| volume_l | numeric | Generated |
| impact_protection | text | |
| foam_firmness | text | |
| foam_layers | integer | |
| foam_types | jsonb | Array |
| has_hinge_protection | boolean | |
| durability | text | |
| shell_denier | text | |
| bottom_coating | text | |
| closure_system | text | |
| reconfigurable | boolean | |
| shoulder_straps | text | |
| waist_belt | boolean | |
| chest_strap | boolean | |
| carry_handles | integer | |
| bandolier_strap | boolean | |
| gear_storage | text | |
| shoe_wipe | boolean | |
| couch_mode | boolean | |
| price_uvp_eur | numeric | |
| current_price_eur | numeric | |
| discount_pct | numeric | |
| recycled_materials | boolean | |
| hic_certified | boolean | |
| bluesign | boolean | |
| eur_per_area | numeric | Generated: price / landing area |
| kg_per_area | numeric | Generated: weight / landing area |
| eur_per_liter | numeric | Generated |
| kg_per_liter | numeric | Generated |
| has_gear_pocket | boolean | |
| has_load_flap | boolean | |
| premium_carry_system | boolean | |
| portability_score | numeric | |
| portability_label | text | |

## belay_devices

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| brand | text | |
| model | text | |
| slug | text | Unique |
| device_type | text | tube/assisted/auto-tube/plate |
| braking_type | text | |
| guide_mode | boolean | |
| rope_slots | integer | |
| rope_diameter_min_mm | numeric | |
| rope_diameter_max_mm | numeric | |
| rope_diameter_optimal_min_mm | numeric | |
| rope_diameter_optimal_max_mm | numeric | |
| compatible_rope_types | jsonb | Array |
| weight_g | numeric | |
| material | text | |
| anti_panic | boolean | |
| lead_top_switch | boolean | |
| lowering_type | text | |
| mechanical_advantage | text | |
| rappel_single_strand | boolean | |
| rappel_double_strand | boolean | |
| best_use_cases | jsonb | Array |
| skill_level | jsonb | Array |
| certification | jsonb | Array |
| eco_design | boolean | |
| eco_details | text | |
| year_released | integer | |
| price_uvp_eur | numeric | |
| price_eur_min | numeric | |
| price_eur_max | numeric | |
| discount_pct | numeric | |
| device_color_1 | text | |
| device_color_2 | text | |
| image_url | text | |
| description | text | |
| pros | jsonb | |
| cons | jsonb | |

## quickdraws

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| slug | text | Unique |
| brand | text | |
| model | text | |
| status | text | |
| image_url | text | |
| quickdraw_type | text | sport/alpine/aid |
| sling_type | text | |
| sling_width_mm | numeric | |
| hot_forged | boolean | |
| carabiner_shape | text | |
| sling_length_mm | numeric | |
| available_lengths_cm | jsonb | Array |
| upper_gate_type | text | |
| upper_nose_type | text | |
| gate_opening_upper_mm | numeric | |
| lower_gate_type | text | |
| lower_nose_type | text | |
| gate_opening_lower_mm | numeric | |
| strength_major_kn | numeric | |
| strength_minor_kn | numeric | |
| strength_open_kn | numeric | |
| weight_g | numeric | |
| rubber_keeper | boolean | |
| captive_eye | boolean | |
| extendable | boolean | |
| price_uvp_eur | numeric | |
| price_set_eur | numeric | |
| price_eur_min | numeric | |
| best_use_cases | jsonb | Array |
| skill_level | jsonb | Array |
| certification | jsonb | Array |
| year_released | integer | |
| color_1 | text | |
| color_2 | text | |
| description | text | |
| pros | jsonb | |
| cons | jsonb | |

## Price Tables

Five parallel price tables with nearly identical structure: `shoe_prices`, `rope_prices`, `crashpad_prices`, `belay_prices`, `quickdraw_prices`.

Common columns across all:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| product_slug | text | FK to product table |
| retailer | text | |
| country | text | |
| product_url | text | |
| product_name | text | |
| brand | text | |
| model | text | |
| image_url | text | |
| match_confidence | text | |
| price_eur | numeric | |
| original_price_eur | numeric | |
| currency | text | |
| in_stock | boolean | |
| last_crawled_at | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Category-specific extras:
- **shoe_prices**: `sizes_available` (jsonb), `eur_size` (text)
- **rope_prices**: `length_m` (numeric), `diameter_mm` (numeric)
- **quickdraw_prices**: `pack_size` (integer), `length_cm` (numeric)

## price_history

Append-only log for historical price tracking.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| shoe_slug | text | Legacy naming - used for all categories |
| retailer | text | |
| price_eur | numeric | |
| recorded_at | timestamptz | |

## foot_scan_fits

One row per foot scan. User-submitted data + pipeline analysis results.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| scan_id | text | Matches photo filenames, e.g. scan-2026-03-05T13-35-21 |
| sex | text | male/female |
| street_size_eu | numeric | |
| shoes | jsonb | Array of {brand, model, size_eu, fit: {toes, forefoot, heel}} |
| email | text | Optional |
| email_freq | text | |
| toe_shape | text | egyptian/greek/roman/celtic/germanic |
| toe_confidence | numeric | 0-1 |
| forefoot_width_ratio | numeric | ball_width / foot_length |
| heel_width_ratio | numeric | heel_width / foot_length |
| arch_length_ratio | numeric | ball position fraction from heel |
| instep_height_ratio | numeric | instep_height / foot_length |
| heel_depth_ratio | numeric | heel_protrusion / foot_length |
| toe_delta_ratio | numeric | |
| volume_class | text | low/medium/high |
| forefoot_width_class | text | narrow/medium/wide |
| heel_width_class | text | narrow/medium/wide |
| arch_length_class | text | |
| instep_height_class | text | |
| heel_depth_class | text | |
| hallux_valgus_class | text | |
| hva_offset_ratio | numeric | |
| confidence | text | low/medium/high |
| notes | text | |
| landmarks | jsonb | Raw landmark coordinates |
| interpretation | jsonb | {title, paragraphs: [...]} sections |
| recommendations | jsonb | Scored shoe recommendations |
| next_shoe_preference | text | |
| next_shoe_notes | text | |
| status | text | |
| pipeline_stage | text | pending/processing/done/error |
| pipeline_error | text | |
| pipeline_started_at | timestamptz | |
| validation_results | jsonb | |
| generated_at | timestamptz | |
| created_at | timestamptz | |

## shoe_reviews

| Column | Type | Notes |
|--------|------|-------|
| shoe_slug | text | FK to shoes |
| source_name | text | |
| source_type | text | |
| source_url | text | |
| summary | text | |
| author | text | |
| pros | text | |
| cons | text | |
| fit_notes | text | |
| best_for | text | |
