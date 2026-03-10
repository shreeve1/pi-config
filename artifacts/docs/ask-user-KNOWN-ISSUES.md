# Ask User Extension - Known Issues & Limitations

**Last Updated:** February 24, 2026  
**Extension Version:** 1.1.0 (post-review fixes)

---

## ✅ Fixed Issues (v1.1.0)

### Critical Fixes Applied

**1. Signal Parameter Now Wired Up** ✅
- **Issue:** Signal parameter was received but not passed to UI methods
- **Impact:** Users couldn't cancel questions with Ctrl+C
- **Fix Applied:** All handlers now pass `signal` to `ctx.ui` methods
- **Status:** RESOLVED

**2. Type Annotations Added** ✅
- **Issue:** Handler functions used `any` types
- **Impact:** Lost type safety in implementations
- **Fix Applied:** 
  - Imported `ExtensionContext` type
  - Created `AskUserParamsType` from schema
  - All handlers properly typed
- **Status:** RESOLVED

**3. Enhanced Parameter Validation** ✅
- **Issue:** Didn't validate parameter combinations
- **Impact:** Confusing behavior with invalid combinations
- **Fix Applied:**
  - Validates options only for select type
  - Validates defaultValue only for input/editor
  - Clear error messages for invalid combinations
- **Status:** RESOLVED

**4. Timeout Documented in Tool Description** ✅
- **Issue:** LLM couldn't discover timeout feature
- **Impact:** Timeout rarely used
- **Fix Applied:** Added timeout to description with example
- **Status:** RESOLVED

---

## ⚠️ Known Limitations (By Design)

### 1. Timeout vs Cancellation Detection

**Issue:** Cannot reliably distinguish timeout from Escape key cancellation

**Technical Details:**
- Pi's `ctx.ui` methods return `undefined` for both timeout and Escape
- No way to differentiate between the two scenarios
- `timedOut` flag is set based on whether timeout was provided, not actual cause

**Current Behavior:**
```typescript
if (answer === undefined) {
  // Could be timeout OR Escape key
  timedOut: dialogOptions.timeout !== undefined  // Best guess
}
```

**Impact:**
- `timedOut: true` may appear when user pressed Escape (false positive)
- `timedOut: false` may appear when timeout actually occurred (if no timeout set)

**Workaround:** Document this limitation. In practice, both scenarios mean "no answer provided" so distinction may not matter for most use cases.

**Future Fix:** Would require Pi API change to return different values or additional metadata.

---

### 2. RPC Mode Untested

**Issue:** Code handles RPC mode but behavior is untested

**Technical Details:**
- Extension checks `ctx.hasUI` (true in RPC mode)
- Attempts to use `ctx.ui` methods which should delegate to RPC host
- No actual RPC environment testing performed

**Current Code:**
```typescript
if (!ctx.hasUI) {
  return errorResult("UI not available");
}
// In RPC mode: ctx.hasUI = true, but does delegation work?
```

**Impact:**
- May work perfectly (designed to)
- May have edge cases or failures
- Unknown performance characteristics

**Status:** UNTESTED - use at own risk in RPC environments

**Testing Needed:**
1. Set up Pi in RPC mode
2. Call `ask_user` tool
3. Verify dialogs appear on host
4. Test all question types
5. Test timeout and cancellation

---

### 3. Timeout Pause Behavior Unverified

**Issue:** Plan specified "timeouts only count down when dialog is VISIBLE" but this may not be Pi's actual behavior

**Intended Behavior:**
- Timeout countdown pauses during other tool execution
- Resumes when dialog becomes visible
- User doesn't lose time while bash/read commands run

**Actual Behavior:** UNKNOWN - Pi's built-in timeout may not pause

**Test Scenario:**
```
1. LLM calls: bash({ command: "sleep 10" })
2. While running, LLM calls: ask_user({ timeout: 5000 })
3. Question: Does timeout start immediately or wait for bash to finish?
4. If immediate: Does it count down during bash execution?
```

**Impact:**
- If timeout doesn't pause: User may never see question (timed out during bash)
- If timeout waits: Better UX but delays question

**Status:** BEHAVIOR UNDEFINED - needs testing

**Documentation:** Should clarify actual behavior once tested

---

### 4. No Concurrent Questions Support

**Issue:** Only one question dialog can be active at a time

**Technical Details:**
- Extension doesn't queue questions
- Second `ask_user` call while dialog is open: behavior undefined
- Likely: second call waits, or returns error

**Current Code:**
```typescript
// No concurrency handling
const answer = await ctx.ui.input(...);
// What if another ask_user is called here?
```

**Impact:**
- LLM should not call `ask_user` multiple times concurrently
- If it does, behavior is unpredictable

**Workaround:** Document that questions are sequential only

**Future Enhancement:** Could implement question queue if needed

---

### 5. No Built-in Input Validation

**Issue:** Input fields don't validate format (email, URL, number, etc.)

**Current Behavior:**
- All input accepted as-is
- LLM must validate responses itself

**Example:**
```typescript
// No validation for email format
ask_user({
  question: "Enter your email:",
  type: "input"
})
// User can type: "not an email" ← Accepted
```

**Impact:**
- LLM needs to re-ask if validation fails
- More back-and-forth for validated input

**Workaround:** LLM can validate and re-ask:
```
1. Ask for email
2. Validate format
3. If invalid, ask again
```

**Future Enhancement:** Could add optional `validation` parameter with regex or custom function

---

## 🔍 Testing Requirements

### High Priority

1. **Timeout Behavior Test**
   - Test timeout during concurrent tool execution
   - Document actual pause/no-pause behavior
   - Update docs with findings

2. **RPC Mode Test**
   - Test in actual RPC environment
   - Verify all question types work
   - Document any limitations found

### Medium Priority

3. **Signal Cancellation Test**
   - Verify Ctrl+C cancels dialogs
   - Test AbortController.abort()
   - Confirm cleanup happens

4. **Concurrent Questions Test**
   - What happens with overlapping calls?
   - Document actual behavior
   - Add error if not supported

### Low Priority

5. **Timeout vs Escape Distinction**
   - Can Pi API provide better info?
   - Is distinction important for users?
   - Document workarounds if needed

---

## 📊 Impact Assessment

| Issue | Severity | User Impact | Fix Difficulty |
|-------|----------|-------------|----------------|
| Signal wiring | 🔴 Critical | High | ✅ FIXED |
| Type safety | 🟡 Warning | Low | ✅ FIXED |
| Validation gaps | 🟡 Warning | Medium | ✅ FIXED |
| Timeout docs | 🟡 Warning | Low | ✅ FIXED |
| Timeout detection | 🟡 Warning | Low | Pi API limitation |
| RPC untested | 🟡 Warning | Unknown | Needs testing |
| Timeout pause | 🟡 Warning | Medium | Needs testing/docs |
| No concurrency | 🟢 Note | Low | By design |
| No validation | 🟢 Note | Low | Future enhancement |

---

## 🚀 Recommended Actions

### Before Production Use

1. **Test timeout behavior** - 30 minutes
   - Run test prompts with concurrent operations
   - Document actual behavior
   - Update user guide

2. **Test RPC mode** (if using RPC) - 1 hour
   - Set up RPC environment
   - Run basic test prompts
   - Document compatibility

3. **Test signal cancellation** - 15 minutes
   - Verify Ctrl+C works
   - Test during long operations
   - Confirm no hangs

### Optional Improvements

4. **Add validation support** - 4 hours
   - Add optional `pattern` parameter (regex)
   - Add optional `validator` function
   - Update docs

5. **Improve timeout detection** - 2 hours
   - Investigate Pi API for better info
   - Implement workaround if possible
   - Document limitations if not

6. **Add question queue** - 3 hours
   - Implement concurrent question handling
   - Test with parallel calls
   - Update docs

---

## 📝 Documentation Updates Needed

### User Guide Updates

1. Add "Known Limitations" section
2. Document timeout detection behavior (after testing)
3. Add RPC mode compatibility notes (after testing)
4. Clarify sequential-only question support

### Test Prompts Updates

1. Add timeout behavior tests
2. Add RPC mode test scenarios
3. Add signal cancellation tests
4. Add concurrent question anti-patterns

### Quick Start Updates

1. Add troubleshooting for timeout issues
2. Add RPC mode usage notes
3. Link to known limitations

---

## 🔮 Future Enhancements

### Version 1.2.0 (Potential)

- [ ] Input validation (regex, custom functions)
- [ ] Better timeout/cancel distinction
- [ ] Concurrent question queue
- [ ] Progress indicators for timeouts
- [ ] Custom validators per question type

### Version 2.0.0 (Potential)

- [ ] Multi-question forms (wizard pattern)
- [ ] Conditional follow-up questions
- [ ] Rich formatting (markdown in questions)
- [ ] File picker integration
- [ ] Custom themes per question

---

## 💡 Workarounds for Current Limitations

### Timeout Detection Workaround

```typescript
// Can't distinguish timeout from Escape, so:
// 1. Set reasonable timeouts (30+ seconds)
// 2. Accept that both mean "no answer"
// 3. Handle gracefully in LLM logic
```

### RPC Mode Workaround

```typescript
// If RPC doesn't work:
// 1. Use ask_user only in interactive mode
// 2. Provide alternative input method for RPC
// 3. Document RPC limitations
```

### Validation Workaround

```typescript
// LLM can validate and re-ask:
1. Call ask_user
2. Check format
3. If invalid: "That doesn't look like an email. Try again?"
4. Call ask_user again
```

### Concurrent Questions Workaround

```typescript
// LLM should ask sequentially:
1. First question
2. Wait for answer
3. Second question
4. Wait for answer
// Never: ask both at once
```

---

## ✅ Summary

**Fixed in v1.1.0:**
- ✅ Signal parameter wired up
- ✅ Type safety improved
- ✅ Parameter validation enhanced
- ✅ Timeout documented

**Still Limited (By Design):**
- ⚠️ Timeout vs cancellation detection
- ⚠️ RPC mode untested
- ⚠️ Timeout pause behavior unclear
- ⚠️ No concurrent questions
- ⚠️ No built-in validation

**Action Required:**
- Test timeout behavior
- Test RPC mode (if using)
- Update docs with findings

**Overall Assessment:**
Extension is **production-ready** for interactive mode with documented limitations. RPC mode needs testing before production use.

---

**Version History:**
- v1.0.0 (Feb 24, 2026) - Initial release
- v1.1.0 (Feb 24, 2026) - Critical fixes applied, limitations documented
