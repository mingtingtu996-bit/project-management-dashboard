# Non-Residential Default Master Plan Asset Closure Design

## Goal

Close the local code path for all ten formal non-residential business types so the wizard produces a project-manager-reviewable master schedule from governed system assets, while deployment, staging, and production/live verification remain explicitly out of scope.

## Product Contract

- The wizard produces a coarse project master schedule, not a full process checklist.
- Visible rows must represent contractual milestones, major physical work, building or functional-zone control windows, specialty systems, commissioning, statutory acceptance, and handover.
- Process steps, quality checks, document preparation, temporary works, and resource details remain linked projections, constraints, metadata, or drilldown rows unless they are true master-control gates.
- A plan is never executable-ready merely because every currently available asset was selected.
- Real project outcomes are optional calibration overlays for cold start. Candidate, shadow, and evidence-only assets cannot change runtime output.

## Architecture

Keep the existing single generator:

`buildTemplateRecommendation -> buildWizardTemplateSelection -> generateWbsTemplateRows -> executable assembly`

Add a data-driven non-residential asset package layer with three composable parts:

1. A shared non-residential control package for startup, foundation, basement, building lanes, envelope, MEP, fitout, outdoor works, commissioning, acceptance, and handover.
2. A business-type specialty package for hotel, hospital, school, industrial, data center, transportation hub, sports/culture, TOD upper-cover, renovation, and modular construction.
3. Expansion rules driven only by existing wizard facts such as business type, building count, area, floors, basement levels, structure, selected methods, special-room types, and hard constraints.

The package is a seed/registry asset consumed by `wbsTemplateGenerationService`; it does not introduce a second generator or an LLM dependency.

## Asset Contract

Every visible duration-bearing activity must carry:

- stable activity code and business-type applicability;
- execution phase and control lane;
- plan item kind and duration contribution mode;
- standard-duration stable code;
- T2 rhythm template ID;
- predecessor intent with FS/SS/FF and lag where relevant;
- scale or productivity basis when duration varies with project facts;
- visibility class identifying primary control, interface gate, milestone, or drilldown-only support;
- runtime resolution lineage and a consumption receipt.

Cold-start values are `system_bootstrap`. Published project/company/industry/system assets may override them through existing resolvers. Candidate and evidence-only assets never override runtime values.

## Business-Type Coverage

Each type must have explicit control coverage rather than six token profile rows:

- Hotel: mockup, guestrooms, public areas, back-of-house, vertical transport, opening commissioning, trial operation.
- Hospital: medical technology and ward blocks, clean areas, medical gas, medical equipment, clinical fitout, integrated testing, health acceptance.
- School: teaching, laboratory, dormitory/canteen, campus MEP, sports/outdoor works, opening handover.
- Industrial: plant structure/envelope, process foundations, utilities, equipment installation, single-machine and integrated commissioning, trial production.
- Data center: shell, white space, critical power, generators, cooling, controls/DCIM, IST/load testing, production handover.
- Transportation hub: station structure/long-span enclosure, public MEP, passenger systems, platform interfaces, trial operation and operational handover.
- Sports/culture: long-span structure, enclosure, seating/public fitout, event systems, rehearsal and operational acceptance.
- TOD upper-cover: live-line protection, transfer deck, towers/podium, rail interfaces, phased commissioning and handover.
- Renovation: survey/appraisal, decanting and protection, demolition, strengthening, MEP cutover, fitout restoration, staged operational return.
- Modular construction: design freeze, factory production, transport, site readiness, lifting, connection, enclosure, MEP plug-in, commissioning and handover.

## Readiness Gate

`executable_default_master_plan_ready` requires all of the following:

- visible row count meets the configured minimum and the business-type operational floor;
- asset inventory is not exhausted below either threshold;
- required phase and business-control coverage is complete;
- all duration-bearing rows have valid system or governed runtime authority;
- dependency coverage is at least 90 percent;
- the primary network is acyclic, connected, and has one root and one terminal sink;
- method and duration-asset semantics have no conflicts.

Insufficient inventory returns `executable_default_master_plan_blocked` with explicit reason codes. It must not reduce the effective minimum to the available row count.

## Learning Boundary

Task completion continues to create governed duration samples. Learning may calibrate duration distributions, lags, overlap, productivity, visibility, and business-scope selection. Structural additions/deletions, hard dependencies, contract milestones, and confirmed baseline replacement remain high risk and require professional approval. Confirmed plans receive revision drafts only.

## Verification

- Unit tests lock the non-collapsing readiness floor.
- Each business type has multiple scale/feature probes.
- Tests assert content coverage, asset mappings, T2 mappings, dependency closure, phase coverage, visibility, and no semantic mismatch.
- A controlled published asset must change attributable output and rollback must restore the prior result.
- Local tests and generated reports are local evidence only. Deployment and environment verification are not part of this implementation scope.
