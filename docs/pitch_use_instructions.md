Implement the `scam-recovery-v2.1.json` compatibility layer without breaking the existing v1/v2 pitch format.

## Objective

Make v2.1 speakable by the current voice-agent runtime while preserving backward compatibility with existing pitches.

Do not redesign the pitch content. Do not alter the existing v1/v2 behavior unless required for compatibility.

### 1. Extend `load_pitch.ts`

Locate the existing pitch loader and its current `segments` handling, particularly the logic around:

* `load_pitch.ts:103-109` — variable substitution
* `load_pitch.ts:180-187` — missing `segments` handling

Support these schema generations:

### Legacy v1/v2

```text
pitch.segments[]
pitch.variables[]
```

Continue loading these exactly as before.

### v2.1

```text
pitch.conversation[]
pitch.runtime_requirements{}
```

Normalize `conversation[]` into the internal segment representation expected by the existing voice loop.

For each conversation record:

```text
id
text
listenAfter
listenMs
```

must become an ordinary internal segment with equivalent semantics.

Do not require the voice loop to understand both `segments` and `conversation`. Normalize at load time.

### 2. Preserve pitch identity

v2.1 currently lacks `id`.

The loader must establish a stable pitch identity without inventing a persistent identifier inside the source JSON.

Preferred behavior:

1. Use `pitch.id` when present.
2. Otherwise use the existing filename/path-derived identity mechanism if one already exists.
3. Do not generate a random ID on every load.
4. Do not modify v1/v2 IDs.

If the current loader has an established fallback convention, reuse it rather than introducing another one.

### 3. Runtime variable resolution

Do NOT simply expose:

```text
runtime_requirements
```

as though its values are the actual deployment values.

For example:

```json
"runtime_requirements": {
  "principal_name": "{principal_name}",
  "callback_number": "{verified_callback_number}"
}
```

means that the pitch requires those deployment variables.

The loader should resolve the placeholders against the actual deployment configuration.

Required behavior:

```text
pitch declaration
       ↓
deployment configuration
       ↓
resolved pitch
       ↓
voice runtime
```

Do not hardcode organization names, telephone numbers, URLs, case references or other deployment-specific values in the loader.

### 4. Missing-variable behavior

Do NOT silently replace an unresolved required variable with an empty string.

That is especially important for:

```text
{principal_name}
{verified_callback_number}
{verification_url}
{case_reference}
{principal_role}
{approved_case_description}
{approved_case_development}
{approved_source_description}
```

If a required runtime value is unavailable:

* mark the pitch as unresolved;
* return a clear validation error;
* prevent the pitch from entering a live speaking state;
* identify the missing variable(s).

Example:

```text
Pitch cannot be activated:
missing required runtime variables:
- principal_name
- verified_callback_number
- case_reference
```

The existing v1/v2 behavior should remain unchanged unless their variables are already subject to validation.

### 5. Preserve policy metadata

The normalized pitch object should retain v2.1 metadata including:

```text
policy
runtime_requirements
states
refusal_branches
post_refusal_rules
consent_rules
```

Do not discard these fields during normalization.

### 6. Expose refusal branches to the voice loop

The current voice loop does not consume:

```text
refusal_branches
states
```

Add the smallest necessary runtime integration so that `listen_on_call` can recognize the configured branch triggers and return a structured transition.

Do NOT implement this as unrestricted fuzzy matching against arbitrary model output.

At minimum, normalize branch results into something equivalent to:

```text
{
  branchId,
  action,
  terminal,
  optOut
}
```

Examples:

```text
r1_explicit_refusal
  → TERMINATE

r2_do_not_contact
  → TERMINATE_AND_OPTOUT

r4_not_the_right_person
  → TERMINATE_UNLESS_CORRECTION_VOLUNTARILY_OFFERED

r5_wrong_number
  → TERMINATE

r6_verification_concern
  → PAUSE_DATA_COLLECTION_AND_PROVIDE_VERIFICATION

r7_not_now
  → OFFER_SCHEDULED_FOLLOWUP_WITHOUT_PRESSURE
```

The important invariant is:

```text
explicit refusal ≠ objection
```

A refusal must never be routed back through persuasion logic.

Likewise:

```text
do-not-contact ≠ not-interested
```

A do-not-contact request must produce an opt-out and terminate the interaction.

### 7. Consent rules

Expose `consent_rules` to the voice runtime.

At minimum, enforce these semantics:

```text
silence_is_consent = false
recognition_is_consent = false
prior_contact_is_consent = false
answering_the_call_is_consent = false
positive_consent_required = true
```

Also preserve the distinction:

```text
consent to hear explanation
    !=
consent to provide documents

consent to follow-up
    !=
consent to transfer documents
```

Do not implement additional document collection in this task.

### 8. Do not move policy enforcement entirely into the prompt

The JSON `policy.forbidden` block is useful metadata, but do not assume that putting a rule in the pitch makes it runtime-enforced.

Where practical, enforce the critical terminal behaviors in code:

* explicit refusal → terminate;
* do-not-contact → opt out + terminate;
* unresolved required identity/verification variable → cannot activate;
* no consent → no document-transfer state.

### 9. Backward compatibility tests

Add or update automated tests covering:

#### v1

```text
load
list
resolve variables
10? existing segment count unchanged
```

Use the actual v1 segment count rather than assuming it is 10.

#### v2

Verify:

```text
load succeeds
0 errors
segments remain speakable
existing variable substitution remains intact
```

#### v2.1

Verify all of the following:

```text
list succeeds
load succeeds
stable pitch ID exists
10 conversation records normalize to 10 segments
all 10 segment texts resolve with supplied deployment configuration
no unresolved placeholders remain
all 7 refusal branches parse
all terminal actions parse
consent_rules parse
policy parses
```

Also test failure cases:

```text
missing principal_name
missing verified_callback_number
missing verification_url
missing case_reference
```

Each must fail validation rather than produce an empty-string substitution.

### 10. Explicit regression test for the original failure

Add a test proving that this no longer happens:

```text
v2.1
→ segmentCount: 0
→ "has no segments array, so there is nothing to speak"
```

Instead:

```text
v2.1
→ normalized segments: 10
→ speakable: true
```

### 11. Do not change unrelated code

Do not:

* rewrite the voice architecture;
* replace the existing pitch schema;
* modify v1/v2 JSON;
* add hardcoded case data;
* add fake verification information;
* add document-upload functionality;
* alter unrelated UI;
* claim live-call readiness.

After implementation, report:

```text
VERIFIED
- files changed
- tests executed
- v1 result
- v2 result
- v2.1 result
- refusal-branch result
- missing-variable result

NOT VERIFIED
- anything requiring an actual telephony call
- anything requiring external verification infrastructure
```

Do not report the task as complete unless the tests actually pass.
