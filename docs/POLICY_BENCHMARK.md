# Policy evaluation benchmark

## Purpose

AEGIS-X uses deterministic, explainable text-and-input-signal rules. This benchmark provides a reproducible regression check for whether the current rules route a curated set of proposed actions to human review.

## Dataset

- File: `tests/benchmarks/policy_cases.json`
- 36 synthetic cases with unique IDs, expected review labels, and rationale.
- Includes low-risk/read-only examples, production changes, destructive operations, financial actions, privilege changes, and supplied evidence flags.
- Labels are project-defined expectations for this benchmark, not universal safety truth or externally validated ground truth.

## Run

From the repository root:

```powershell
.\.venv\Scripts\python.exe scripts/run_policy_benchmark.py
.\.venv\Scripts\python.exe -m pytest -q tests/benchmarks
```

The runner reports confusion-matrix counts, precision, recall, F1, accuracy, and mismatched case IDs.

## Interpretation and limitations

- False positives indicate actions routed to review despite a benchmark label of no review.
- False negatives indicate actions not routed to review despite a benchmark label requiring review; these deserve particular investigation.
- A small synthetic dataset cannot establish production detection accuracy, generalize to unseen phrasing, or validate the correctness of the labels.
- The benchmark evaluates only the current text-and-signal policy engine. It does not measure live environment awareness, identity authorization, model performance, or action execution safety.
- Expand with independently reviewed, domain-specific, adversarial and paraphrased cases before making reliability claims. Keep a versioned holdout set to reduce tuning against the test set.
