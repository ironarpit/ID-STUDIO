# Fix #1: Save Actual Unsaved Answers Before Opening Scanned Product

Fix the unsaved-edits workflow across standard Floor IQ audits, Daily Purchase audits, and Core/Non-Core Focus checks so that pending scans validate and persist actual user draft inputs instead of fabricating default answers.

## User Review & Critical Decisions

> [!IMPORTANT]
> The implementation incorporates all 5 required safeguards:
> 1. **Strict Return Value Propagation**: `submitValidated` only returns `true` if the underlying persistence callback explicitly resolves to a truthy/successful value. Returning `false` or throwing errors will always propagate as `false`.
> 2. **Decoupled Persistence & Navigation**: `submitValidated(false)` performs data persistence without closing or navigating inside the modal form. Navigation to product B is exclusively orchestrated by `FloorAuditRunner` upon confirmed success.
> 3. **Preserved Pending Scan with Distinct Error Reporting**: On failure, `pendingScan` is preserved so the user can resolve issues and retry. Validation errors are distinguished from backend/persistence errors.
> 4. **Synchronous Ref Lock & State Guard**: A synchronous `isSavingRef.current = true` lock blocks rapid duplicate submissions, modal dismissal, or new incoming scanner events during an in-flight save, released in a `finally` block.
> 5. **Comprehensive Failure Test Matrix**: Explicitly verifies both `false` return and thrown error scenarios across all 3 audit forms.

---

## 1. Overview & Root Cause Analysis

### The Problem
In `src/components/audit/FloorAuditRunner.tsx`, `handleUnsavedSaveAndProceed`:
1. Reads stale properties from `inspectingResult` instead of reading the active form's internal draft state (`display`, `board`, `boardStatus`, `remarks`, `issueReason`, `visibilityLevel`, `displayLocations`).
2. Fabricates default values (forcing `'yes'`, `'board_correct'`, `'OK'`, `'YES'`, `'OFF'`, `'correct'`) for missing or untouched fields.
3. Catches save errors silently with a `console.warn` and proceeds to open product B regardless, leaving data in a corrupt or incomplete state.

### The Solution
Eliminate all fabricated defaults from `FloorAuditRunner.tsx`. Delegate validation and persistence to the active modal form instance via a unified imperative handle interface (`AuditCheckFormHandle`), ensuring product A is saved with its real draft inputs before product B is ever loaded.

---

## 2. Technical Architecture & Component Interaction

```
┌────────────────────────────────────────────────────────────────────────┐
│                          FloorAuditRunner                              │
│                                                                        │
│  State: inspectingResult (Product A), pendingScan (Product B)          │
│  Locks: isSavingRef (synchronous) & isUnsavedSaving (UI state)         │
│  Ref:   activeFormRef -> AuditCheckFormHandle                          │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼                        ▼                        ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Standard Audit  │    │  Daily Purchase  │    │   Focus Check    │
│ Inspector Modal  │    │   Check Modal    │    │      Modal       │
├──────────────────┤    ├──────────────────┤    ├──────────────────┤
│ useImperative-   │    │ useImperative-   │    │ useImperative-   │
│ Handle:          │    │ Handle:          │    │ Handle:          │
│ submitValidated  │    │ submitValidated  │    │ submitValidated  │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

### Form Handle Contract
```ts
export interface AuditCheckFormHandle {
  /**
   * Validates form and commits current draft state.
   * @param advanceToNext If true, advances to the next sequential product (used by Save & Next).
   *                      If false, saves without sequential navigation (used by Save & Open / Save & Close).
   * @returns Promise<boolean> Returns true ONLY if validation passed and persistence succeeded.
   */
  submitValidated: (advanceToNext: boolean) => Promise<boolean>;
}
```

---

## 3. Detailed Implementation Steps & Safeguards

### Safeguard 1: Form Return Value Propagation
In each modal form, `onSaveResult`, `onSave`, and `onSaveAndNext` must be typed as `Promise<boolean>` (or `Promise<boolean | void>`).
- If the callback returns `false`, `submitValidated` returns `false`.
- If the callback throws an error, the error is caught, displayed in the form's error state, and `submitValidated` returns `false`.
- Only when the callback explicitly completes without error and does not return `false` does `submitValidated` return `true`.

### Safeguard 2: Separate Persistence from Navigation
When calling `submitValidated(false)`:
- The form executes validation and calls the persistence callback with `isNext = false`.
- The form does NOT trigger `onClose()`.
- Navigation to Product B is exclusively handled by `FloorAuditRunner` only after `submitValidated` returns `true`.

### Safeguard 3: Preserve `pendingScan` on Failure with Clear Retry Path
In `FloorAuditRunner.tsx`:
- If `submitValidated` returns `false`, `pendingScan` is NOT cleared.
- `setShowUnsavedPrompt(false)` closes the prompt so Product A remains in the foreground with its draft and error message visible.
- The user can fix the input and either:
  1. Click normal "Save & Close", which saves and can trigger opening the pending scan.
  2. Re-trigger "Save & Open Scanned Product" via the pending scan banner/action or re-scanning.
- Error messages explicitly differentiate between validation errors (e.g. "Missing required fields in Product A") and persistence errors (e.g. "Storage save failed: [error message]").

### Safeguard 4: Synchronous Ref Lock + UI State
In `FloorAuditRunner.tsx`:
- Add `const isSavingRef = useRef<boolean>(false);` alongside `const [isUnsavedSaving, setIsUnsavedSaving] = useState<boolean>(false);`
- In `handleUnsavedSaveAndProceed`:
  ```ts
  if (isSavingRef.current) return;
  isSavingRef.current = true;
  setIsUnsavedSaving(true);
  try {
    const saved = await activeFormRef.current?.submitValidated(false);
    if (saved) {
      // open pending product B
    } else {
      // keep product A open, keep pendingScan intact
    }
  } finally {
    isSavingRef.current = false;
    setIsUnsavedSaving(false);
  }
  ```
- Hardware/camera scanner events (`handleLocateEvent`) check `if (isSavingRef.current) return;` to ignore incoming scans while a save is in progress.

### Safeguard 5: Explicit Component Updates

1. **`FloorProductInspectorModal.tsx`**:
   - Wrap with `React.forwardRef<AuditCheckFormHandle, FloorProductInspectorModalProps>`.
   - Update `onSaveResult` prop to `(updatedFields: Partial<AuditProductResult>, status: 'done' | 'flagged' | 'pending', isNext?: boolean) => Promise<boolean | void> | void`.
   - Expose `useImperativeHandle(ref, () => ({ submitValidated: (isNext) => handleSaveAction(isNext) }))`.
   - In `handleSaveAction(isNext)`:
     - Run `validateForm()`. If invalid, `setValidationError(msg); return false;`
     - In `try`: call `const res = await onSaveResult(updatedFields, targetStatus, isNext);`
       - If `res === false`, `return false;`
       - `return true;`
     - In `catch`: `setValidationError(err?.message || 'Failed to save audit result.'); return false;`

2. **`DailyPurchaseCheckModal.tsx`**:
   - Wrap with `React.forwardRef<AuditCheckFormHandle, DailyPurchaseCheckModalProps>`.
   - Expose `useImperativeHandle(ref, () => ({ submitValidated: (isNext) => handleSaveCheck(isNext) }))`.
   - In `handleSaveCheck(isNext)`:
     - Run `validateAnswers()`. If invalid, `return false;`
     - In `try`: call `const saved = await onSave(extraFields, newStatus, isNext);`
       - If `saved === false`, `return false;`
       - `return true;`
     - In `catch`: `setValidationError(err?.message || 'Failed to save.'); return false;`

3. **`FocusProductCheckModal.tsx`**:
   - Wrap with `React.forwardRef<AuditCheckFormHandle, FocusProductCheckModalProps>`.
   - Expose `useImperativeHandle(ref, () => ({ submitValidated: (advanceToNext) => handleSave(advanceToNext) }))`.
   - In `handleSave(advanceToNext)`:
     - Run validation for `display`, `board`, `boardType`. If invalid, `setErrorMessage(msg); return false;`
     - In `try`: call `const saved = await onSaveAndNext({ display, board, boardType }, advanceToNext);`
       - If `saved === false`, `return false;`
       - `return true;`
     - In `catch`: `setErrorMessage(err?.message || 'Failed to save.'); return false;`

4. **`FloorAuditRunner.tsx`**:
   - Attach `ref={activeFormRef}` to all 3 modals.
   - Refactor `handleUnsavedSaveAndProceed` with `isSavingRef` lock, error distinction, and `pendingScan` preservation.
   - Refactor `handleUnsavedDiscardAndProceed` to cleanly discard draft and open Product B.
   - Refactor `handleUnsavedCancel` to dismiss prompt and retain Product A.

---

## 4. Verification & Testing Matrix

| Scenario | Test Action | Expected Result |
| :--- | :--- | :--- |
| **1. Standard Audit Draft Save & Open** | Edit Product A (e.g., On Floor = No, Missing Board, custom remark). Scan Product B. Click "Save & Open". | Product A persists exact edited fields and remark. Product B opens with its own clean answers. |
| **2. Daily Purchase Incomplete Draft** | Open Product A, leave Price Board unanswered. Scan Product B. Click "Save & Open". | Prompt closes, Product A stays open with inline validation error displayed, nothing saved, Product B does not open, pendingScan preserved. |
| **3. Focus Check Incomplete Draft** | Open Product A, select Display = Yes, Board = Yes, leave Board Type empty. Scan Product B. Click "Save & Open". | Prompt closes, Product A stays open with error, Product B does not open, pendingScan preserved. |
| **4. Persistence Returns `false`** | Mock `onSaveResult` / `onSave` / `onSaveAndNext` returning `false`. Scan B -> Save & Open. | `submitValidated` returns `false`. Product A stays open with draft intact, Product B does not open, pendingScan preserved. |
| **5. Persistence Throws Error** | Mock save throwing an exception (e.g. storage quota / DB disconnect). Scan B -> Save & Open. | Error message displayed on form. Product A stays open with draft intact, Product B does not open. |
| **6. Discard Edits & Open Scanned** | Edit Product A. Scan Product B. Click "Discard & Open". | Product A's original unedited database record is preserved. Product B opens. |
| **7. Continue Editing** | Edit Product A. Scan Product B. Click "Continue Editing". | Prompt closes, Product A stays open with all unsaved edits intact. |
| **8. Rapid Scans / Multi-Click Protection** | During active saving of Product A, rapid scanner triggers or clicks are fired. | Ignored by `isSavingRef.current` lock until persistence finishes. Released in `finally`. |
