# Global Vertical Scrollbar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Hide only the website's root vertical scrollbar while preserving all scrolling and component-level horizontal scrollbars.

**Architecture:** Keep the change in the existing global stylesheet and scope browser-specific declarations to `html`. Protect that scope with a small Vitest source-level regression test.

**Tech Stack:** CSS, Vitest, TypeScript

---

### Task 1: Protect root-only scrollbar styling

**Files:**
- Create: `src/app/globals.test.ts`
- Modify: `src/app/globals.css`

1. Add a failing test requiring root-only Firefox and WebKit scrollbar-hiding rules.
2. Run the focused test and confirm it fails because the rules are absent.
3. Add `scrollbar-width: none` to `html` and hide `html::-webkit-scrollbar`.
4. Run the focused test and the relevant test suite.
