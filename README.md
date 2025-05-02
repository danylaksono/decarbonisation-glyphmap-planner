# Decarbonisation Glyphmap Planner

Interactive dashboard for planning and visualising building decarbonisation interventions. Access the live app at: [decarb-vis.netlify.app](https://decarb-vis.netlify.app/)

## Overview

This tool helps users simulate, prioritise, and allocate budgets for low-carbon technology (LCT) upgrades (e.g. heat pumps, solar PV) across building stock. It supports multi-year planning, custom intervention strategies, and visual analytics for scenario comparison.

## Key Features

- Visual timeline for managing and sequencing interventions
- Interactive map and glyph-based visualisation of results
- Customisable budget allocation and intervention parameters
- Sortable/filterable building table for selection and analysis
- Scenario comparison and summary statistics

## Main Components

- **Timeline View**: Manage, reorder, and edit interventions. Visualise intervention plans over time.
- **Quickview Form**: Add new interventions with custom technology, budget, and schedule. Supports different allocation profiles.
- **Map View**: Explore spatial impact of interventions using glyphmaps and aggregation controls.
- **Table View**: Filter, sort, and select buildings for targeted interventions.
- **Budget Allocator**: Flexible tool for distributing budgets across years and interventions.

## Model Background

The underlying model simulates LCT interventions on buildings, optimising for carbon savings or technology deployment under budget constraints. It supports:

- Carbon-first and tech-first optimisation strategies
- Multi-year, multi-intervention planning with budget rollover
- Building filtering and prioritisation (e.g. by size, energy use, ownership)
- Scenario analysis for policy and investment planning

For detailed model documentation, see [`docs/report.md`](docs/report.md).

## Getting Started

To run locally:

```bash
npm install
npm run dev
```

Then visit [http://localhost:3000](http://localhost:3000)

## Project Structure

- `docs/components/` – UI components (TimelineView, QuickviewForm, MapView, TableView, BudgetAllocator)
- `docs/data/` – Data loaders and static data
- `docs/index.md` – Main dashboard page
- `docs/report.md` – Model and methodology documentation
- `observablehq.config.ts` – Project configuration

## License

MIT
