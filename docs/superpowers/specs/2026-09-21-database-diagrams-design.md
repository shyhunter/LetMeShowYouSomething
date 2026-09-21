# Database diagrams design

## Goal

Add `diagrams[].kind: "database"` so a review can explain tables, columns, keys, relationships, and clearly labelled sample rows on the same offline page as the other diagram kinds.

## Scope

- A database diagram has tables with stable ids, labelled columns, and an explicit key column.
- Relationships name valid source and target tables and columns, and declare one-to-many cardinality without relying on a legend.
- Optional sample rows are visibly marked as examples and can only use declared columns.
- A table can link to a review item through `step`, consistent with other diagrams.
- The checker rejects malformed or misleading diagrams with its standard: what is wrong, how to fix it, and why it matters.
- The renderer draws the table layout offline and preserves selection, keyboard access, comments, and proposal behavior already supported by diagrams.

## Out of scope

- Database execution, migrations, SQL generation, remote databases, vendor-specific icons, or real production data.
- AI explainers (#70), flow-edit proposals (#66), and screenshot areas (#33).

## Data model

`database` is a third diagram model alongside `flowchart`, `system`, and `sequence`. Its nodes represent tables and declare columns. Its edges represent table relationships and identify the columns at both ends. Sample rows are data-only examples attached to their table; they never execute or fetch anything.

The schema keeps the protocol closed (`additionalProperties: false`). The checker remains the semantic authority for cross-references, duplicate ids, keys, cardinality, and example-row shape. The renderer consumes only checker-valid data.

## Validation and safety

- Reject duplicate table ids, empty tables, missing/duplicate columns, keys absent from columns, and relationships whose tables or columns do not exist.
- Reject invalid relationship cardinality and sample-row values keyed by undeclared columns.
- Keep all examples synthetic; never add customer, credential, or private data.
- Preserve the no-network, no-third-party-runtime, MIT-0 generated-page boundary.

## Testing

Each new refusal begins as a focused failing unit test in `test/protocol.test.mjs`, then receives the minimum checker/schema/renderer change needed to pass. Add a worked database example, regenerate its HTML page, and extend Playwright plus Chrome checks to prove readable table/cardinality rendering, keyboard access, and an exported comment round trip.
