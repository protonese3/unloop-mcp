# Trap Project — Unloop Live Demo

A project with a **subtle, deliberate bug** designed to make AI coding assistants loop.

## Setup

```bash
cd trap-project
npm install
```

## The Bug

```bash
npm test
```

3 tests fail — all on tax calculations for books and food:
```
Expected tax: 3.6   (books at 4%)
Received tax: 9     (books at 10% — wrong!)

Expected tax: 0.36  (food at 4%)
Received tax: 0.9   (food at 10% — wrong!)
```

## Why AIs Loop On This

The AI sees "wrong tax rate" and investigates:
1. Opens `tax.ts` → rates are correct (books: 4%, food: 4%) ✓
2. Opens `pricing.ts` → logic calls `getTaxRate()` correctly ✓
3. Opens the test → expected values match 4% rate ✓
4. Everything looks correct... but tests still fail

The AI will typically try:
1. Change tax rates in tax.ts → already correct, no effect
2. Hardcode rates in pricing.ts → same result, Jest still uses legacy
3. Change the test expectations → "that can't be right, the rates should be 4%"
4. Add console.log → sees 10% but can't figure out why
5. Restructure the tax calculation → same result
6. Inline the rate logic → still 10%
7. ...repeat...

## The Actual Root Cause

**`jest.config.js` line 7** has a `moduleNameMapper` that silently redirects `tax.js` imports to `tax-legacy.ts`:
```js
"(.*)/tax\\.js$": "$1/tax-legacy",
```

The comment says "HACK: workaround for ESM resolution issue" — it looks like
legitimate test infrastructure. But `tax-legacy.ts` has the OLD rates (10%
for books/food instead of 4%).

**The fix:** Remove or fix that moduleNameMapper entry.

## Why This Is Hard For AIs

- The code is 100% correct — `pricing.ts` and `tax.ts` are right
- The tests are 100% correct — expected values match the real rates
- The bug is in *test infrastructure* (`jest.config.js`) not in code
- The moduleNameMapper entry has a plausible comment explaining why it exists
- AIs rarely investigate test runner configuration when debugging test failures
- `tax-legacy.ts` exists as a "legacy compatibility" file — looks intentional

## How to Test with Unloop

1. Build Unloop: `cd .. && npm run build`
2. Start Claude Code HERE: `claude`
3. Say: "3 tests are failing in the pricing engine. Can you fix them?"
4. Watch the loop detection kick in

**Expected behavior with Unloop:**
- Attempts 1-2: AI tries to fix tax.ts or pricing.ts → NONE
- Attempt 3: NUDGE → strategies say "Check what changed", "Question your assumptions"
- The AI should realize the code is correct and look elsewhere
- Eventually checks jest.config.js → finds the moduleNameMapper → removes it → tests pass
