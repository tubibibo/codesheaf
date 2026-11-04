# 4. Estimate tokens with a heuristic, not a tokenizer

- Status: Accepted
- Date: 2026-11-05

## Context

A live token readout needs to be instant and dependency-free. Exact counts
would require shipping a tokenizer (tiktoken, etc.) — tens of megabytes of
vocabulary tables — and pinning the estimate to one model family.

## Decision

`estimateTokens` is a documented heuristic: `ceil(asciiChars / 4) + cjkChars`
(with CJK covering Han, kana, and hangul ranges). Every display uses a `~`
prefix or the word "estimated".

## Consequences

- Zero-cost, model-agnostic estimates that are typically within a small
  factor of real BPE counts.
- Never an exact count — acceptable because the number drives a judgment
  ("will this fit in the chat?"), not billing.
- Swapping in an exact tokenizer later is a one-file change behind the same
  function signature.
