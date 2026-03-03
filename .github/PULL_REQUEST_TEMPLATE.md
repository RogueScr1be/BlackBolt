## Description

Please include a summary of the changes and related context. Include any relevant motivation and context.

**Type of Change:**
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring
- [ ] Test addition/improvement
- [ ] CI/CD improvement

## Related Issues

Fixes # (issue number)
Relates to # (related issue number)

## Changes Made

Describe the specific changes you made:

- [ ] Change 1
- [ ] Change 2
- [ ] Change 3

## Testing

Please describe the tests you ran to verify your changes:

### Test Environment
- macOS Version: [e.g., 14.0]
- Architecture: [e.g., Apple Silicon]
- Swift Version: [e.g., 6.0]

### Test Cases
- [ ] Test case 1
- [ ] Test case 2
- [ ] Test case 3

### Manual Testing Performed

```bash
# Commands run to test functionality
BlackBoltOperator --version
BlackBoltOperator --help
# ... other test commands
```

### Test Results
- [ ] All tests pass locally
- [ ] No new warnings
- [ ] Code coverage maintained or improved

## Code Review Checklist

### General
- [ ] My code follows the project's code style
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings

### Swift/iOS Specific
- [ ] Code compiles without errors
- [ ] No Swift warnings
- [ ] Follows Swift naming conventions
- [ ] Proper error handling implemented
- [ ] Memory management is appropriate

### Testing
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Code coverage has not decreased
- [ ] All tests are meaningful and properly documented

## Security Review Checklist

- [ ] No hardcoded credentials or secrets
- [ ] No unsafe memory operations
- [ ] Proper input validation
- [ ] Appropriate use of Keychain for sensitive data
- [ ] No unintended network access
- [ ] Proper error handling (no information leakage)
- [ ] No use of deprecated APIs
- [ ] Entitlements are appropriate

## Performance Impact

- [ ] No performance degradation
- [ ] Memory usage is appropriate
- [ ] Build time not significantly affected
- [ ] Runtime performance maintained or improved

### Performance Metrics (if applicable)
```
Before: [metric value]
After:  [metric value]
Change: [percentage/absolute change]
```

## Documentation

- [ ] Updated README.md if needed
- [ ] Updated CHANGELOG.md
- [ ] Updated API documentation
- [ ] Updated operational guides
- [ ] Added inline code comments where needed
- [ ] Updated relevant ADRs or design documents

## Screenshots/Evidence

If applicable, add screenshots or output showing the changes:

```
[Add screenshots or terminal output]
```

## Breaking Changes

Does this PR introduce breaking changes?
- [ ] No breaking changes
- [ ] Yes, breaking changes (describe below)

### Breaking Change Details
If yes, please describe:
1. What is breaking
2. How to migrate
3. Deprecation timeline

## Deployment Notes

Any special considerations for deployment?

- [ ] Database migration needed
- [ ] Configuration changes needed
- [ ] Feature flags needed
- [ ] Rollback strategy required
- [ ] Zero-downtime deployment required

### Deployment Instructions
```
Steps to deploy this change:
1. [Step 1]
2. [Step 2]
3. [Step 3]
```

## Rollback Plan

In case of issues, this change can be rolled back by:
1. [Rollback step 1]
2. [Rollback step 2]
3. [Rollback step 3]

## Additional Information

### Dependencies Added/Updated
- [ ] No new dependencies
- [ ] Dependencies updated (list below)

**List any new or updated dependencies:**
- Dependency 1: version X → Y
- Dependency 2: version X → Y

### Environment Variables
- [ ] No new environment variables
- [ ] New environment variables (list below)

**Environment variables:**
```
NEW_VAR=value  # Description
```

### Configuration Changes
- [ ] No configuration changes
- [ ] Configuration changes needed (describe below)

### Known Issues/Limitations

Any known issues or limitations with this change:
- [Issue 1]
- [Issue 2]

## Reviewer Notes

Any specific areas you'd like reviewers to focus on:

1. [Focus area 1]
2. [Focus area 2]
3. [Focus area 3]

## Future Improvements

Potential improvements or follow-up work:

- [ ] Performance optimization needed in [area]
- [ ] Additional testing for [scenario]
- [ ] Documentation enhancement in [section]
- [ ] Follow-up PR for [feature]

## Checklist Before Submission

- [ ] PR title is descriptive
- [ ] PR description is complete
- [ ] All required checks pass
- [ ] No merge conflicts
- [ ] Branch is up to date with main
- [ ] Code review checklist is complete
- [ ] Ready for merge

---

**Reviewers:** @reviewer1 @reviewer2 @reviewer3
**Priority:** [Critical / High / Medium / Low]
**Target Merge Date:** [Date if applicable]

Thank you for contributing to BlackBolt Operator!
