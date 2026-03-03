# Development Setup Guide for BlackBolt

This guide provides step-by-step instructions for setting up the BlackBolt Operator development environment.

## Prerequisites

- macOS 12.0 or later
- Xcode 14.0 or later (with Swift 5.9+)
- Homebrew (package manager)
- Git

## Setup Steps

### 1. Install Required Tools

Install the code quality tools via Homebrew:

```bash
# Install SwiftLint (code linter)
brew install swiftlint

# Install SwiftFormat (code formatter)
brew install swiftformat

# Install git-secrets (credentials detector)
brew install git-secrets

# Install yamllint (YAML validator)
brew install yamllint

# Install pre-commit framework (hook manager)
pip install pre-commit
```

Verify installations:

```bash
swiftlint version
swiftformat --version
git-secrets --version
pre-commit --version
```

### 2. Clone the Repository

```bash
git clone https://github.com/blackbolt/operator.git
cd operator
```

### 3. Set Up Git Hooks

Install and configure git hooks:

```bash
# Run the setup script
./scripts/setup-git-hooks.sh

# This will:
# - Configure git to use .githooks directory
# - Initialize pre-commit framework
# - Verify hook installation
```

Verify hooks are installed:

```bash
git config core.hooksPath
# Should output: .githooks

ls -la .githooks/
# Should show: pre-commit, commit-msg, pre-push
```

### 4. Configure Git Secrets

Initialize git-secrets for your repository:

```bash
# Initialize git-secrets for the repo
git secrets --install

# Add standard patterns for AWS credentials
git secrets --register-aws

# Add custom patterns for API keys (optional)
git secrets --add 'api[_-]key'
git secrets --add 'apiKey'
```

Test git-secrets:

```bash
# This should pass (no secrets detected)
git secrets scan

# To see what patterns are being checked
git secrets --list
```

### 5. Configure Xcode

#### Swift Package Manager Setup

```bash
# Open the Xcode workspace
open -a Xcode .
```

#### Build Settings

In Xcode:
1. Select the BlackBoltOperator target
2. Build Settings tab
3. Set "Swift Language Version" to 5.9 or later

### 6. Install Swift Dependencies

The project uses Swift Package Manager. Dependencies are defined in `Package.swift`.

```bash
# Resolve dependencies (automatic on build)
swift package resolve

# Or through Xcode
# Product > Build (⌘B)
```

### 7. Configure IDE for Code Quality

#### SwiftLint in Xcode

Add a Build Phase:

1. Select the target
2. Build Phases
3. Click "+ New Run Script Build Phase"
4. Enter:

```bash
if which swiftlint >/dev/null; then
  swiftlint --config .swiftlint.yml
else
  echo "error: SwiftLint not installed"
fi
```

#### SwiftFormat Integration

Install the Xcode extension:

```bash
# swiftformat provides integration helpers
swiftformat --help | grep xcode
```

Or format before commit:

```bash
./scripts/format.sh
```

## Daily Development Workflow

### Before Starting

```bash
# Update the repository
git pull origin main

# Install any new dependencies
swift package resolve

# Run quality checks
./scripts/check-code-quality.sh
```

### During Development

1. Write your code following [CODING_STANDARDS.md](./CODING_STANDARDS.md)
2. Run SwiftLint frequently:

```bash
./scripts/lint.sh --verbose
```

3. Format your code regularly:

```bash
./scripts/format.sh
```

4. Test your changes:

```bash
swift test
```

### Before Committing

The pre-commit hook will automatically run:

```bash
# Try to commit
git add .
git commit -m "feat: add new authentication flow"

# Hooks will run automatically:
# 1. SwiftLint validation
# 2. SwiftFormat check
# 3. git-secrets scan
# 4. File size checks
# 5. Configuration validation
```

If any check fails, fix the issues and try again:

```bash
# Fix linting issues
./scripts/lint.sh --fix

# Fix formatting issues
./scripts/format.sh

# Try commit again
git commit -m "feat: add new authentication flow"
```

### Bypass Hooks (Not Recommended)

Only in exceptional cases:

```bash
# Skip all hooks
git commit --no-verify

# Skip pre-push hooks
git push --no-verify
```

### Before Pushing

The pre-push hook will verify:

```bash
# Attempting to push
git push origin feature-branch

# Pre-push hook will check:
# 1. All changes are committed
# 2. Branch name is valid
# 3. Tests pass (if test script exists)
# 4. Code quality checks pass
```

## Building from Source

### Development Build

```bash
# Build in debug mode
swift build

# Run tests
swift test
```

### Release Build

```bash
# Build in release mode
swift build -c release

# The compiled binary is at:
# .build/release/BlackBoltOperator
```

### Xcode Build

```bash
# Open in Xcode
open -a Xcode .

# Build
Product > Build (⌘B)

# Run
Product > Run (⌘R)

# Test
Product > Test (⌘U)
```

## Running Tests Locally

### Run All Tests

```bash
swift test
```

### Run Specific Test Suite

```bash
swift test --filter TestClassName
```

### Run With Verbose Output

```bash
swift test --verbose
```

### Run With Coverage

```bash
swift test --enable-code-coverage
```

### Generate Coverage Report

```bash
# After running tests with coverage enabled
xcrun llvm-cov export -format lcov \
  -instr-profile .build/debug/codecov/default.profdata \
  .build/debug/BlackBoltOperatorPackageTests.xctest/Contents/MacOS/BlackBoltOperatorPackageTests \
  > coverage.lcov
```

## IDE Configuration

### Xcode Preferences

1. Open Xcode
2. Preferences (⌘,)
3. Text Editing tab

#### Editor Settings

```
Tab width: 2
Indent using: Spaces
Enable code folding: Yes
Show whitespace: Yes
```

#### Formatting

```
Enable line numbers: Yes
Soft wrap lines: Yes
Wrap lines at column: 120
```

## Troubleshooting

### SwiftLint Not Running in Git Hooks

```bash
# Check if hooks are installed
git config core.hooksPath

# Should return: .githooks

# Make hooks executable
chmod +x .githooks/*

# Re-run setup
./scripts/setup-git-hooks.sh
```

### SwiftFormat Not Formatting

```bash
# Verify installation
which swiftformat

# Check configuration
cat .swiftformat

# Test formatting
./scripts/format.sh --dry-run
```

### Git Secrets Not Detecting Patterns

```bash
# List registered patterns
git secrets --list

# Add custom patterns
git secrets --add 'password'
git secrets --add 'secret'

# Scan repository
git secrets scan --all
```

### Build Failures

```bash
# Clean build artifacts
swift package clean

# Clear derived data
rm -rf .build/

# Resolve dependencies again
swift package resolve

# Rebuild
swift build
```

### Tests Failing

```bash
# Run tests with verbose output
swift test --verbose

# Run specific test file
swift test Tests/BlackBoltOperatorTests/SomeTest.swift

# Check for timing issues
swift test --parallel false
```

## Documentation

- [Coding Standards](./CODING_STANDARDS.md) - Style guide and conventions
- [Security Guide](./SWIFT_SECURITY.md) - Security best practices
- [Contributing Guide](../CONTRIBUTING.md) - Contribution process

## Getting Help

1. Check the documentation files above
2. Review existing code examples in the repository
3. Check git history for similar implementations:

```bash
git log --grep="feature" --oneline
```

4. Ask in the team Slack channel

## Additional Resources

- [Swift Official Documentation](https://docs.swift.org)
- [SwiftLint Documentation](https://github.com/realm/SwiftLint)
- [SwiftFormat Documentation](https://github.com/nicklockwood/SwiftFormat)
- [CryptoKit Documentation](https://developer.apple.com/documentation/cryptokit)
