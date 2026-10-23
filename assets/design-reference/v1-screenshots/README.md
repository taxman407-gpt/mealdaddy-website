# MealDaddy V1 screenshots

These screenshots are the current visual comparables for the MealDaddy mobile interface. Until a later design is explicitly approved, refer to this set as the **V1 screenshots**.

## Reference files

- `01-more.png` — More navigation screen and overall V1 visual system.
- `02-today.png` — authoritative Today-screen reference, including the metric progress-line layout.
- `03-entries.png` — Entries screen reference.
- `04-plan.png` — Plan screen reference.
- `05-more-alternate-capture.png` — second supplied capture of the More screen.

These are design references, not production assets. App data and functionality remain governed by the application code and database.

## Required checks for every UI change

- Design and review phone layouts alongside desktop layouts; phone support is part of completion.
- Keep the established V1 visual system consistent across screens, including matching actions, colors, and readable contrast.
- Check narrow phone widths (320–430 CSS pixels), single-column card layouts, readable prices and descriptions, and no horizontal page overflow.
- Keep touch targets at least 44 CSS pixels high, allow long labels to wrap, and verify content is not covered by navigation or the on-screen keyboard when applicable.
- Browser viewport checks do not replace real-device checks for camera capture, keyboard behavior, or Android Back gestures.
