# UI System Migration (`@florexlabs/ui`)

This project now uses `@florexlabs/ui` as the primary UI source for the dashboard.

## What Was Migrated

The following local UI patterns were replaced with reusable components:

- `Button` (all dashboard actions)
- `Card` (main dashboard surfaces)
- `Badge` (status chips and counters)
- `Input` (target URL, rules and custom profile forms)
- `Container` and `Section` (main page layout)
- `Spinner` (loading indicator in header)
- `EmptyState` (logs empty state)

## What Stays Local (for now)

Some pieces are still local because they are domain-specific or need native behavior:

- Native `<select>` in profile/rules editors:
  keeps simple keyboard behavior and existing test selectors (`combobox`) stable.
- Log table sizing/overflow styles:
  specific to high-density proxy request data in this dashboard.

## Why This Split

- Reusable visual primitives now come from `@florexlabs/ui`.
- Business-specific rendering logic (proxy data table and rule editor behavior) stays in app code.

## Example

```tsx
import { Badge, Button, Card, Input } from '@florexlabs/ui';

export function Example() {
  return (
    <Card padding="sm">
      <Badge tone="success">Control API: connected</Badge>
      <Input placeholder="https://api.example.com" />
      <Button variant="secondary">Save URL</Button>
    </Card>
  );
}
```

## Notes

- `@florexlabs/ui/florex.css` is imported in dashboard entrypoint.
- Tailwind CSS v4 is enabled in dashboard Vite config for component utility classes.
