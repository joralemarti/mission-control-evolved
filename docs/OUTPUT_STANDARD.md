# Mission Control Output Standard v1

## Default Rule
All outputs must be delivered in structured Markdown unless the task explicitly requires JSON.

## Mandatory Sections (when applicable)
- ## Repo Evidence
- ## Assumptions
- ## Proposal / Plan
- ## Files to Change (exact paths)
- ## Risks
- ## Success Metrics

## JSON Usage
Use JSON only when:
- The output is intended for programmatic execution.
- A machine-readable artifact is required.
- A change bundle or configuration payload is defined.

If no format is specified in a task, default to structured Markdown.
