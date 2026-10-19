# OpenFit Improvements

Make OpenFit a personal health workstation with fast navigation, deeper comparisons, and control over local data.

## Priority Features

### 1. Command Palette

- Open with `⌘K` on macOS or `Ctrl+K` on Windows and Linux.
- Jump to a date, switch views, compare weeks, export data, or ask the assistant.
- Provide keyboard shortcuts for common actions.

### 2. Comparison Workspace

- Compare two days, weeks, or custom date ranges side by side.
- Overlay sleep, resting heart rate, activity, and HRV to explore patterns.
- Show changes against personal baselines and link to the underlying readings.

### 3. Custom Dashboards

- Pin metrics, rearrange cards, and resize charts.
- Save layouts such as Training, Recovery, and Sleep.
- Restore the default layout when needed.

### 4. Annotations and Personal Experiments

- Mark travel, illness, late meals, training changes, and other events on charts.
- Track an experiment over a chosen period and compare it with a baseline.
- Keep notes alongside relevant dates and metrics.

### 5. Assistant Integration with the Interface

- Support requests such as “Show nights under six hours,” “Compare this month with last month,” and “Open the days behind that trend.”
- Let the assistant navigate views and apply filters.
- Link responses to the underlying dates and readings so users can inspect the evidence.

### 6. Data Inspector

- Inspect each metric’s source, timestamp, raw value, and normalization.
- Explain why data is missing.
- Show sync history and provide retry controls for failed dates.

### 7. Saved Searches and Rules

- Save filters such as “low sleep + high activity.”
- Create personal rules with user-controlled thresholds.
- Flag matching days and provide direct navigation to them.

### 8. Local Exports and Automation

- Export filtered data as CSV or JSON.
- Schedule local backups.
- Eventually expose a CLI for scripts and custom analysis.

## Display Foundation

- Add an optional compact display mode with denser cards and precise values.
- Provide keyboard shortcuts and optional chart legends.
- Keep the current overview as the default experience.

## Suggested Starting Order

1. Command palette.
2. Comparison workspace.
3. Annotations and personal experiments.

These features help users investigate changes, understand their data, and keep a record of what changed.
