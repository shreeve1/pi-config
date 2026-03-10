# Ask User Extension - Test Prompts

Test prompts to verify the `ask_user` extension works correctly in Pi.

---

## Prerequisites

1. Ensure the extension is loaded:
   ```bash
   ls -la ~/.pi/agent/extensions/ask-user.ts
   ```

2. Start Pi in interactive mode (not with `-p` flag)

3. Check that `ask_user` tool appears in the system prompt

---

## Test 1: Simple Text Input

**Prompt:**
```
I need to configure the database connection. Please ask me for the database hostname.
```

**Expected Behavior:**
- LLM calls `ask_user` with `type: "input"`
- Dialog appears asking for database hostname
- User types hostname and presses Enter
- LLM receives the answer and can proceed

**Verification:**
- Dialog displays correctly
- Answer is captured
- LLM acknowledges the input

---

## Test 2: Confirmation Dialog

**Prompt:**
```
I'm about to delete all files in the /tmp/test directory. Please confirm this action with me first.
```

**Expected Behavior:**
- LLM calls `ask_user` with `type: "confirm"`
- Yes/No dialog appears
- User selects Yes or No
- LLM receives boolean result

**Verification:**
- Confirmation dialog shows warning message
- Yes/No options are clear
- LLM respects the user's choice

---

## Test 3: Multiple Choice Selection

**Prompt:**
```
I need to set up a new project. Please ask me which framework I want to use: React, Vue, or Svelte.
```

**Expected Behavior:**
- LLM calls `ask_user` with `type: "select"` and three options
- Selection dialog appears with arrow key navigation
- User selects a framework
- LLM receives the selected option

**Verification:**
- All three options are displayed
- Arrow keys navigate
- Selected option is highlighted
- LLM gets both the index and value

---

## Test 4: Multi-line Editor

**Prompt:**
```
I need a detailed description of the feature you want me to implement. Please open an editor for me to provide the full specification.
```

**Expected Behavior:**
- LLM calls `ask_user` with `type: "editor"`
- Full-screen editor opens
- User can write multiple lines
- User saves with Ctrl+S or exits
- LLM receives the full text

**Verification:**
- Editor opens with full capabilities
- Multi-line text is supported
- Formatting (newlines, indentation) is preserved
- LLM receives complete text

---

## Test 5: Default Values

**Prompt:**
```
Please ask me for the server port, with a default value of 3000.
```

**Expected Behavior:**
- LLM calls `ask_user` with `defaultValue: "3000"`
- Input dialog shows "3000" as placeholder or pre-filled
- User can accept default or change it
- LLM receives the final value

**Verification:**
- Default value is visible
- User can modify it
- Empty input doesn't crash

---

## Test 6: Timeout Handling

**Prompt:**
```
Ask me if I want to proceed with deployment, but only wait 5 seconds for my answer.
```

**Expected Behavior:**
- LLM calls `ask_user` with `timeout: 5000`
- Dialog shows countdown timer
- If no response in 5 seconds, dialog auto-dismisses
- LLM receives `cancelled: true, timedOut: true`

**Verification:**
- Countdown displays correctly
- Dialog auto-closes at zero
- LLM handles timeout gracefully

---

## Test 7: User Cancellation

**Prompt:**
```
Please ask me for my email address.
```

**Expected Behavior:**
- Dialog appears
- User presses Escape key
- Dialog closes without saving
- LLM receives `cancelled: true`

**Verification:**
- Escape key works
- LLM acknowledges cancellation
- No error occurs

---

## Test 8: Invalid Parameters (Error Handling)

**Prompt:**
```
Use the ask_user tool with type "select" but don't provide any options.
```

**Expected Behavior:**
- LLM attempts to call tool with missing options
- Tool returns validation error
- LLM receives error message
- No crash occurs

**Verification:**
- Helpful error message returned
- LLM can retry with correct parameters
- Extension remains functional

---

## Test 9: Complex Workflow

**Prompt:**
```
I want to create a new API endpoint. First ask me what HTTP method to use (GET, POST, PUT, DELETE), then ask for the endpoint path, then confirm whether I want to add authentication.
```

**Expected Behavior:**
- LLM makes three separate `ask_user` calls
- First: select from HTTP methods
- Second: input for path
- Third: confirm for auth
- LLM uses all three answers to proceed

**Verification:**
- Questions appear sequentially
- Each answer is captured
- LLM synthesizes all inputs correctly
- Workflow feels natural

---

## Test 10: TUI Rendering

**Prompt:**
```
Ask me a few different questions using different types, then I'll expand the tool results to see the details.
```

**After questions are answered:**
- Press `Ctrl+O` to expand tool results
- Verify rendering shows:
  - Question text
  - Question type
  - User's answer
  - Success indicator (✓) or warning (⚠)

**Verification:**
- Compact view is clean and readable
- Expanded view shows full details
- Colors are appropriate (success green, warning yellow)
- Boolean answers show "Yes"/"No" not "true"/"false"

---

## Advanced Test: Non-Interactive Mode

**Test with print mode:**
```bash
pi -p "Use the ask_user tool to ask me a question"
```

**Expected Behavior:**
- Tool returns "UI not available" error
- LLM receives error message
- No crash occurs

**Verification:**
- Graceful error handling
- Clear error message
- Extension doesn't break Pi

---

## Session Persistence Test

**Steps:**
1. Ask several questions using `ask_user`
2. Answer them
3. Use `/tree` to view session history
4. Fork the session or navigate tree
5. Verify question/answer history is preserved

**Verification:**
- Questions appear in `/tree` view
- Answers are stored in session file
- Forking preserves independent histories
- Session resume shows full Q&A history

---

## Performance Test

**Prompt:**
```
Ask me 10 questions in a row using ask_user. Use different types: input, confirm, select, editor.
```

**Expected Behavior:**
- Questions appear one at a time
- No memory leaks
- No slowdown over time
- All questions complete successfully

**Verification:**
- Extension remains responsive
- No console errors
- Memory usage is stable
- Pi doesn't hang or crash

---

## Notes

- Test in order (simple to complex)
- Document any issues found
- Check console for errors (if accessible)
- Verify session file structure if possible
- Test with different Pi themes/configurations

---

## Expected Test Results

| Test | Status | Notes |
|------|--------|-------|
| 1. Simple Input | ✓ | |
| 2. Confirmation | ✓ | |
| 3. Selection | ✓ | |
| 4. Editor | ✓ | |
| 5. Default Values | ✓ | |
| 6. Timeout | ✓ | |
| 7. Cancellation | ✓ | |
| 8. Error Handling | ✓ | |
| 9. Complex Workflow | ✓ | |
| 10. TUI Rendering | ✓ | |
| 11. Non-Interactive | ✓ | |
| 12. Session Persistence | ✓ | |
| 13. Performance | ✓ | |

---

## Troubleshooting Failed Tests

If a test fails:

1. Check extension is loaded: `/reload`
2. Verify tool registration: Check system prompt
3. Look for TypeScript errors in extension file
4. Check Pi version compatibility
5. Review Pi logs if available
6. Test with a minimal prompt first
7. Compare with Pi's built-in question tools (if any)

---

## Next Steps After Testing

Once all tests pass:
- ✅ Extension is production-ready
- ✅ Can be used in real workflows
- ✅ Document any discovered limitations
- ✅ Consider implementing Phase 5 enhancements
- ✅ Share extension with team/community
