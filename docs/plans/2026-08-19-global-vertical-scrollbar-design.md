# Global Vertical Scrollbar Design

**Goal:** Hide the page-level vertical scrollbar without affecting scrolling or any horizontal scrollbar.

**Design:** Apply Firefox and WebKit scrollbar-hiding declarations only to the root `html` element in `src/app/globals.css`. Do not use wildcard selectors or modify nested scroll containers, so horizontal carousels and other component-level overflow behavior remain unchanged.

**Verification:** Add a focused stylesheet regression test that requires both root declarations and rejects global wildcard scrollbar hiding.
