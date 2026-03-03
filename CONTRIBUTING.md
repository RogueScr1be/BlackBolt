# Contributing to BlackBolt

Thank you for your interest in contributing to the BlackBolt Operator project. This document outlines the contribution process, code review expectations, and guidelines.

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Before You Start](#before-you-start)
3. [Development Setup](#development-setup)
4. [Making Changes](#making-changes)
5. [Commit Message Format](#commit-message-format)
6. [Code Review Process](#code-review-process)
7. [Testing Requirements](#testing-requirements)
8. [Security Disclosure](#security-disclosure)

## Code of Conduct

All contributors are expected to follow professional standards:

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the code, not the person
- Help others learn and improve
- Report inappropriate behavior

## Before You Start

1. **Create an Issue**: For significant features or changes, open an issue first to discuss the approach.

2. **Check Existing Work**: Look for open pull requests and issues to avoid duplicating work.

3. **Read Documentation**:
   - [CODING_STANDARDS.md](./docs/CODING_STANDARDS.md) - Style guide
   - [SWIFT_SECURITY.md](./docs/SWIFT_SECURITY.md) - Security best practices
   - [DEVELOPMENT_SETUP.md](./docs/DEVELOPMENT_SETUP.md) - Environment setup

## Development Setup

Follow the [Development Setup Guide](./docs/DEVELOPMENT_SETUP.md) to configure your environment.

Quick reference:

```bash
# Install tools
brew install swiftlint swiftformat git-secrets yamllint
pip install pre-commit

# Clone and setup
git clone <repository>
cd operator
./scripts/setup-git-hooks.sh

# Verify
swift package resolve
swift test
```

## Making Changes

### 1. Create a Feature Branch

```bash
# Use meaningful branch names
git checkout -b feature/add-oauth-support
git checkout -b fix/correct-token-validation
git checkout -b docs/update-setup-guide
git checkout -b refactor/simplify-api-client
```

**Branch naming convention**: `<type>/<description>`

Types: `feature`, `fix`, `docs`, `refactor`, `test`, `chore`, `security`

### 2. Make Your Changes

Follow [CODING_STANDARDS.md](./docs/CODING_STANDARDS.md):

- Use meaningful variable names (camelCase for variables, PascalCase for types)
- Write documentation for public APIs
- Keep functions focused and small
- Avoid force unwraps and implicitly unwrapped optionals
- Add security considerations for sensitive code

Example:

```swift
/// Authenticates a user with the provided credentials.
///
/// - Parameters:
///   - email: The user's email address
///   - password: The user's password (not stored in this function)
/// - Returns: An authentication token valid for 24 hours
/// - Throws: `AuthError.invalidCredentials` if authentication fails
///
/// - Important: Passwords are not logged or stored. Use Keychain for persistence.
public func authenticate(email: String, password: String) async throws -> AuthToken {
  guard email.contains("@") else {
    throw AuthError.invalidEmail
  }

  // Implementation
}
```

### 3. Run Quality Checks

Before committing, ensure your code passes all checks:

```bash
# Lint your code
./scripts/lint.sh --verbose

# Fix linting issues automatically
./scripts/lint.sh --fix

# Check formatting
./scripts/format.sh --check

# Auto-format code
./scripts/format.sh

# Run all quality checks
./scripts/check-code-quality.sh

# Run tests
swift test
```

## Commit Message Format

Follow the Conventional Commits specification:

**Format**: `type(scope): message`

**Types**:
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that don't affect code meaning (formatting, missing semicolons)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding or updating tests
- `chore`: Changes to build process, dependencies
- `security`: Security-related changes

**Scope** (optional): Area of the codebase (e.g., `auth`, `networking`, `security`)

**Message**:
- Lowercase first letter (after scope)
- Use imperative mood ("add feature" not "added feature")
- Don't end with period
- Keep under 100 characters for first line

**Examples**:

```
feat: add OAuth 2.0 authentication flow

fix(security): remove hardcoded API endpoint

docs(setup): clarify installation steps for M1 Macs

refactor(api): simplify request building logic

test: add unit tests for token validation

chore: update SwiftLint configuration
```

**Multi-line commits**:

```
feat(auth): implement token refresh mechanism

Add automatic token refresh when tokens expire.
Tokens are refreshed 5 minutes before expiration
to ensure seamless user experience.

- Implement RefreshTokenManager
- Add background task for token monitoring
- Cache tokens securely in Keychain
```

## Code Review Process

### Submitting a Pull Request

1. **Push your branch**:

```bash
git push origin feature/your-feature-name
```

2. **Create a PR on GitHub**:
   - Use a clear, descriptive title
   - Reference related issues (#123)
   - Include screenshots/GIFs if UI-related
   - Explain the changes and reasoning

3. **PR Template**:

```markdown
## Description
Brief description of changes.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Related Issues
Fixes #123

## Testing
How to test these changes:
- [ ] Test scenario 1
- [ ] Test scenario 2

## Checklist
- [ ] Code follows style guidelines
- [ ] Documentation is updated
- [ ] Tests added/updated
- [ ] No new warnings
- [ ] Commit messages follow convention
```

### Review Expectations

Reviewers will check:

1. **Code Quality**
   - Follows CODING_STANDARDS.md
   - Passes SwiftLint
   - Passes SwiftFormat
   - No security issues

2. **Functionality**
   - Solves the stated problem
   - Doesn't break existing features
   - Error handling is comprehensive
   - Edge cases are handled

3. **Documentation**
   - Public APIs are documented
   - Complex logic is explained
   - README/docs updated if needed

4. **Testing**
   - Tests are comprehensive
   - Test names are descriptive
   - Edge cases are tested

5. **Performance**
   - No unnecessary allocations
   - Efficient algorithms
   - Proper use of async/await

### Responding to Feedback

- Address all comments
- Push new commits (don't force-push)
- Re-request review when ready
- Thank reviewers for feedback

### Approval and Merge

- Requires 1 approval from code owner
- All checks must pass (CI/lint/tests)
- Squash and merge to main branch
- Delete feature branch after merge

## Testing Requirements

### Unit Tests

Write tests for all public methods:

```swift
class UserRepositoryTests: XCTestCase {
  var sut: UserRepository!

  override func setUp() {
    super.setUp()
    sut = UserRepository(mockDatabase: MockDatabase())
  }

  func testFetchUser_WithValidID_ReturnsUser() {
    // Given
    let expectedUser = User(id: 1, name: "John")

    // When
    let result = try? sut.fetchUser(id: 1)

    // Then
    XCTAssertEqual(result, expectedUser)
  }

  func testFetchUser_WithInvalidID_ThrowsError() {
    // Given
    // When/Then
    XCTAssertThrowsError(try sut.fetchUser(id: -1))
  }
}
```

### Test Coverage

- Aim for >80% code coverage
- Test happy paths and error cases
- Test edge cases and boundary conditions
- Use mocks for external dependencies

### Run Tests

```bash
# All tests
swift test

# Specific test
swift test --filter TestClassName

# With coverage
swift test --enable-code-coverage
```

## Security Disclosure

If you discover a security vulnerability:

1. **Do NOT open a public issue**
2. **Email security@blackbolt.io** with details
3. **Include**:
   - Vulnerability description
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Resources

- [Coding Standards](./docs/CODING_STANDARDS.md)
- [Security Guide](./docs/SWIFT_SECURITY.md)
- [Development Setup](./docs/DEVELOPMENT_SETUP.md)
- [Swift Best Practices](https://docs.swift.org)

## Questions?

- Check existing documentation
- Review closed issues and discussions
- Ask in the team Slack channel
- Contact the project maintainers

Thank you for contributing to BlackBolt!
