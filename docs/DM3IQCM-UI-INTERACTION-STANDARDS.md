# DM3Oi UI Interaction Standards

## Clickable entity rows

When a register row represents one entity with one available detail destination, the entire ordinary row surface is the primary navigation target. Use the shared `NavigableRow` table primitive, place a real link to the same destination in the entity’s identifying cell, and omit redundant **Open**, **View**, or **Details** actions.

Do not make a row clickable when it has no existing detail route, represents an aggregate rather than one record, or has no unambiguous primary destination. A table’s presence alone does not imply row navigation. Legitimate actions such as Edit, Delete, Archive, Activate, Deactivate, Assign, and links to different destinations remain visible and independent.

## Keyboard and assistive technology

A navigable row must:

- be reachable in the keyboard tab order;
- expose a concise navigation label;
- navigate on Enter and Space;
- provide a visible `:focus-visible` indicator;
- retain a semantic anchor in its identifying cell, so navigation does not depend exclusively on pointer or JavaScript row handling.

Do not wrap a `<tr>` in an anchor and do not describe navigation rows as buttons.

## Nested controls

Links, buttons, inputs, selects, textareas, labels, disclosure controls, and elements marked `data-row-navigation-ignore` own their interactions. Events originating from these controls must not activate row navigation. This rule preserves alternate destinations and forms such as membership role/status controls.

## Visual and responsive behavior

Use a subtle background change, pointer cursor, and restrained focus outline consistent with the DM3Oi visual system. Do not add navigation icons solely to advertise row clickability. The full row remains a touch target on responsive layouts, while nested controls remain independently tappable and existing horizontal table scrolling is preserved.
