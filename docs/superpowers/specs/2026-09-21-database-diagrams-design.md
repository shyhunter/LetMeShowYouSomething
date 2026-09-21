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

`database` is a third diagram model alongside `flowchart`, `system`, and `sequence`. It retains the existing generic `nodes` and `edges` shape so comments, keyboard selection, and proposals use the established protocol without a parallel targeting system:

- Each node is a table: `kind: "table"`, a stable id matching the existing diagram-id grammar, a trimmed `label` (1–160 characters), optional `step`, and `columns`.
- Each column has a stable id matching the same grammar, a trimmed `label` (1–80 characters), a trimmed plain-language `type` (1–80 characters), and `key: true` or `false`. A table has one or more key columns; this explicitly permits composite keys.
- Each relationship is an edge whose `from` table is the child/many side and whose `to` table is the parent/one side. It names `fromColumn` and `toColumn`, carries the closed `cardinality: "many-to-one"`, and has an optional trimmed label. This direction is both checked and drawn, so multiplicity cannot be silently inverted.
- A node's optional `sampleRows` is an array of objects whose keys are declared column ids and whose values are strings, numbers, booleans, or null. They are visibly labelled “example data”; objects, arrays, remote values, and executable content are unsupported.

Limits are intentionally small and renderer-safe: at most 30 tables per diagram, 30 columns and 10 sample rows per table, 160 relationships, and 500 characters in any sample-cell string. Labels, types, and sample values are escaped at the HTML/SVG boundary.

The existing generic `node` and `edge` comment targets apply directly: a table is a node and a relationship is an edge. Existing rename/remove/add-node and add/remove/relabel-edge proposals therefore work on database diagrams with the same ids and target semantics; database-specific structural changes remain out of scope for #69.

The schema keeps the protocol closed (`additionalProperties: false`). The checker remains the semantic authority for cross-references, duplicate ids, keys, cardinality, and example-row shape. The renderer consumes only checker-valid data.

## Validation and safety

- Reject duplicate table ids, empty tables, invalid/duplicate columns, no key column, and relationships whose tables or columns do not exist.
- Reject relationships whose child/parent column mapping or `many-to-one` direction is inconsistent, duplicate relationship identities, and dangling `step` links.
- Reject invalid relationship cardinality, non-scalar sample values, and sample-row values keyed by undeclared columns.
- Keep all examples synthetic; never add customer, credential, or private data.
- Preserve the no-network, no-third-party-runtime, MIT-0 generated-page boundary.

## Testing

Each new refusal begins as a focused failing unit test in `test/protocol.test.mjs`, then receives the minimum checker/schema/renderer change needed to pass. Unit coverage includes duplicate ids, empty tables, composite keys, dangling steps, absent columns/keys, reversed and mismatched relationship endpoints, duplicate relationships, invalid sample rows, and unsafe size limits. It also proves HTML/SVG escaping for every table label, column label/type, relationship label, and sample-cell value.

Add a worked database example, regenerate its HTML page, and extend Playwright plus Chrome checks to prove readable table/cardinality rendering, keyboard access, table/relationship comments, and an exported comment/proposal round trip.
