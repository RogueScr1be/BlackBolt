# BlackBolt Operator Swift macOS Development Guide

## Table of Contents
1. [Project Overview and Architecture](#project-overview-and-architecture)
2. [Development Environment Setup](#development-environment-setup)
3. [Building from Source](#building-from-source)
4. [Running Tests Locally](#running-tests-locally)
5. [Running the App](#running-the-app)
6. [Debugging Tips](#debugging-tips)
7. [Code Organization](#code-organization)
8. [Common Development Tasks](#common-development-tasks)
9. [IDE Configuration](#ide-configuration)

## Project Overview and Architecture

### Overview

BlackBolt Operator is a macOS Swift application designed to provide secure operational control and approval management. Built with Swift 6.0 and targeting macOS 14+, the application emphasizes security, performance, and maintainability through a layered architecture.

### Architecture Principles

The BlackBolt Operator follows a **layered architecture** pattern with clear separation of concerns:

```
┌──────────────────────────────────────────────┐
│      Presentation Layer (SwiftUI Views)      │
│  DashboardView, ApprovalsView, SettingsView  │
├──────────────────────────────────────────────┤
│   Business Logic Layer (Models, Stores)      │
│    OperatorShellStore, OperatorModels        │
├──────────────────────────────────────────────┤
│   Data Access Layer (Networking, Config)     │
│    OperatorHTTP, SecureConfigurationStore    │
├──────────────────────────────────────────────┤
│      Security Layer (Crypto, Keychain)       │
│  CertificatePinning, MemorySafety, Audit     │
├──────────────────────────────────────────────┤
│     Foundation (Swift, macOS Frameworks)     │
└──────────────────────────────────────────────┘
```

### Key Components

- **Views**: 17 SwiftUI-based user interface components for different operational areas
- **Models**: Core data structures including OperatorShellStore for state management
- **Networking**: HTTP client with certificate pinning and request signing
- **Security**: Comprehensive security infrastructure (6 modules)
- **Configuration**: Encrypted configuration storage and runtime settings

## Development Environment Setup

### System Requirements

Before setting up your development environment, ensure you have:

- **macOS Version**: Tahoe 15.0+ (for development; app supports 14.0+)
- **Xcode**: 15.2 or later
- **Swift**: 6.0 toolchain (included with Xcode 15.2+)
- **RAM**: 8GB minimum (16GB recommended)
- **Disk Space**: 20GB minimum for Xcode, SDKs, and project builds

### Installing Required Tools

#### 1. Install/Update Xcode

```bash
# Check current Xcode version
xcode-select --version

# Install latest Xcode from App Store, or via CLI:
xcode-select --install

# Install specific Xcode version (if needed)
# Visit: https://developer.apple.com/download/all/
```

#### 2. Accept Xcode License

```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
```

#### 3. Verify Swift Toolchain

```bash
# Check Swift version
swift --version
# Expected output: Swift version 6.0.x (or compatible)

# Check Swift package manager
swift package --version
```

#### 4. Install Homebrew (Optional but Recommended)

```bash
# Install Homebrew for managing additional dependencies
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Useful development tools
brew install git git-flow
brew install jq  # JSON processing for testing
```

### Cloning and Initial Setup

```bash
# Clone the repository
git clone <repository-url>
cd BlackBoltOperator

# Verify the project structure
ls -la
# Expected: Sources/, Tests/, Package.swift, Package.resolved, README.md

# Update dependencies
swift package update

# Verify build setup
swift build --version
```

### Xcode Setup and Preferences

#### 1. Open Project in Xcode

```bash
# If using Xcode IDE
open Package.swift
# Or open the folder in Xcode
open -a Xcode .
```

#### 2. Configure Xcode Preferences

Go to **Xcode > Settings > Locations**:
- Set "Command Line Tools" to your Xcode installation
- Verify "Derived Data" location (default: ~/Library/Developer/Xcode/DerivedData)

#### 3. Configure Build Settings

In Xcode project settings:
- **Swift Compiler - Code Generation**
  - Optimization Level (Debug): None
  - Optimization Level (Release): Optimize for Speed
  - Generate Debug Symbols: Yes
- **Swift Compiler - Language**
  - Swift Language Version: Swift 6.0
  - Strict Concurrency Checking: On

### Environment Variables Setup

Create `.env.development` file in project root (not committed):

```bash
# API Configuration
API_BASE_URL=https://api.blackbolt.local:8443
OPERATOR_KEY=your-development-key-here
TENANT_ID=your-tenant-id-here

# Security Configuration
CERTIFICATE_PINNING_ENABLED=false
API_REQUEST_SIGNING_ENABLED=true

# Logging Configuration
LOG_LEVEL=debug
ENABLE_NETWORK_LOGGING=true
ENABLE_SECURITY_LOGGING=true

# Feature Flags
FEATURE_ANALYTICS=false
FEATURE_ADVANCED_DEBUGGING=true
```

### Dependency Management

The project uses Swift Package Manager. Key dependencies:

```
Package Dependencies:
├── BlackBoltAPI (local path: ../BlackBoltAPI)
└── swift-crypto (3.1.0+)
```

To add new dependencies, edit Package.swift and run `swift package update`.

## Building from Source

### Debug Build

```bash
# Clean previous builds
swift build --clean

# Build debug version (default)
swift build
# Output: .build/debug/BlackBoltOperator

# Verbose build output
swift build -v
```

**Build Time**: ~30-60 seconds on first build, 5-15 seconds incremental

**Output Structure**:
```
.build/debug/
├── BlackBoltOperator (executable)
└── (other intermediate files)
```

### Release Build

```bash
# Build release version (with optimizations)
swift build -c release
# Output: .build/release/BlackBoltOperator

# Verbose release build
swift build -c release -v
```

**Build Time**: 2-5 minutes (includes optimizations)

### Building with Custom Flags

```bash
# Build with sanitizers for memory issues
swift build -Xswiftc -g -Xswiftc -sanitize=address

# Build with threading sanitizer
swift build -Xswiftc -sanitize=thread
```

### Creating .app Bundle Manually

```bash
# Build release version first
swift build -c release

# Create app structure
mkdir -p BlackBoltOperator.app/Contents/MacOS
mkdir -p BlackBoltOperator.app/Contents/Resources

# Copy executable
cp .build/release/BlackBoltOperator BlackBoltOperator.app/Contents/MacOS/

# Create Info.plist
cat > BlackBoltOperator.app/Contents/Info.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>BlackBoltOperator</string>
    <key>CFBundleIdentifier</key>
    <string>com.blackbolt.operator</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>NSMinimumOSVersion</key>
    <string>14.0</string>
</dict>
</plist>
EOF

# Verify structure
ls -la BlackBoltOperator.app/Contents/
```

### Build Troubleshooting

**Module not found errors**:
```bash
rm -rf .build
swift package clean
swift package update
swift build
```

**Memory issues during build**:
```bash
swift build -j 1  # Reduce parallel jobs
```

## Running Tests Locally

### Basic Test Execution

```bash
# Run all tests
swift test

# Run with verbose output
swift test -v

# Run specific test case
swift test --filter SecurityTests
```

### Test Filtering and Selection

```bash
# Run tests matching a pattern
swift test --filter "Certificate"

# Run with code coverage
swift test --enable-code-coverage
```

### Understanding Test Output

Successful test run output:
```
Test Suite 'All Tests' started at 2026-03-03 10:30:00.000
Test Case 'SecurityTests.testCertificatePinning' passed (0.234 seconds)
Test Suite 'All Tests' finished (1.567 seconds)

Total Tests Run: 42
Tests Passed: 42
Tests Failed: 0
```

### Test Coverage Generation

```bash
# Enable coverage collection
swift test --enable-code-coverage -v

# Generate HTML coverage report
swift test --enable-code-coverage && \
  xcrun llvm-cov show \
  -format=html \
  -instr-profile=.build/debug/codecov/default.profdata \
  .build/debug/BlackBoltOperatorTests > coverage.html
```

## Running the App

### Command Line Execution

```bash
# Run debug build
swift run BlackBoltOperator

# Run release build
swift run -c release BlackBoltOperator

# Run with output capture
swift run BlackBoltOperator 2>&1 | tee output.log
```

### Environment Variables

```bash
# Single variable
OPERATOR_KEY=test-key swift run BlackBoltOperator

# Multiple variables
API_BASE_URL=https://localhost:8443 \
OPERATOR_KEY=dev-key \
LOG_LEVEL=debug \
swift run BlackBoltOperator
```

### Logging Configuration

```bash
# Enable debug logging
LOG_LEVEL=debug swift run BlackBoltOperator

# Enable network logging
ENABLE_NETWORK_LOGGING=true swift run BlackBoltOperator

# File logging
LOG_FILE=~/logs/blackbolt.log swift run BlackBoltOperator
```

## Debugging Tips

### Xcode Debugger Setup

#### Setting Breakpoints

1. Click in gutter next to line number (blue arrow)
2. Right-click to set conditions or ignore count
3. Continue to next breakpoint (Resume button)

#### Useful Debugger Commands

- **Step Over**: F6
- **Step Into**: F7
- **Step Out**: F8
- **Continue**: Ctrl+Cmd+Y

### LLDB Commands

Use LLDB console when paused:

```lldb
# Print variable value
(lldb) po someVariable

# Print with type info
(lldb) p someVariable

# Set variable
(lldb) expr someVariable = newValue

# Call function
(lldb) expr someFunction()

# Backtrace
(lldb) bt

# Stack inspection
(lldb) frame variable
```

### Memory Debugging

```bash
# Run with Address Sanitizer
swift build -Xswiftc -sanitize=address
swift run BlackBoltOperator

# Check for memory leaks in Xcode
# Product > Profile (Cmd+I) > Leaks
```

### Performance Profiling

```bash
# Open Xcode debugger
# Product > Profile (Cmd+I)
# Select Instruments tool

# Key Instruments:
# - Time Profiler (CPU usage)
# - Leaks (memory leaks)
# - Allocations (memory growth)
```

### Console Logging

```bash
# Run with all logs
swift run BlackBoltOperator 2>&1

# Filter for specific logs
swift run BlackBoltOperator 2>&1 | grep "Security"

# Save to file and monitor
swift run BlackBoltOperator > debug.log 2>&1 &
tail -f debug.log
```

### Keychain Access Debugging

```bash
# Check keychain status
security dump-keychain ~/Library/Keychains/login.keychain-db 2>/dev/null

# Reset for debugging
security delete-keychain ~/Library/Keychains/debug.keychain
security create-keychain -p password ~/Library/Keychains/debug.keychain
```

## Code Organization

### Module Structure

```
Sources/BlackBoltOperator/
├── BlackBoltOperatorApp.swift
├── Configuration/
│   └── SecureConfigurationStore.swift
├── Models/
│   ├── OperatorModels.swift
│   ├── OperatorRuntimeConfig.swift
│   └── OperatorShellStore.swift
├── Networking/
│   └── OperatorHTTP.swift
├── Security/
│   ├── APIRequestValidator.swift
│   ├── AppSandboxManager.swift
│   ├── CertificatePinning.swift
│   ├── Keychain.swift
│   ├── MemorySafety.swift
│   ├── OperatorLock.swift
│   └── SecurityAudit.swift
└── Views/
    ├── DashboardView.swift
    ├── ApprovalsView.swift
    └── (15 other specialized views)
```

### File Naming Conventions

- **Files**: PascalCase matching the primary type
- **Types**: PascalCase (OperatorShellStore, CertificatePinning)
- **Functions/Variables**: camelCase (validateRequest, apiBaseUrl)
- **Constants**: SCREAMING_SNAKE_CASE (MAX_RETRIES, DEFAULT_TIMEOUT)
- **Tests**: Test suffix (CertificatePinningTests)

### Dependency Injection Patterns

```swift
class OperatorHTTP {
    let session: URLSession
    let validator: APIRequestValidator
    
    init(
        session: URLSession = URLSession.secure,
        validator: APIRequestValidator
    ) {
        self.session = session
        self.validator = validator
    }
}

// Usage
let validator = APIRequestValidator(secretKeyHex: key)
let http = OperatorHTTP(validator: validator)
```

### Async/Await Patterns

```swift
// Async function
async func fetchApprovals() throws -> [Approval] {
    let request = try runtime.request(path: "/approvals")
    let data = try await URLSession.shared.data(for: request)
    return try JSONDecoder().decode([Approval].self, from: data.0)
}

// Caller
Task {
    do {
        let approvals = try await fetchApprovals()
    } catch {
        // Handle error
    }
}

// Structured concurrency
async let approvals = fetchApprovals()
async let campaigns = fetchCampaigns()
let results = try await (approvals, campaigns)
```

## Common Development Tasks

### Adding a New Feature

1. **Create the Model**:
```swift
struct NewFeature: Codable {
    let id: String
    let name: String
    let status: String
}
```

2. **Add API Endpoint**:
```swift
func fetchNewFeatures() async throws -> [NewFeature] {
    var request = try runtime.request(path: "/new-feature")
    request = try await validator.signRequest(request)
    let data = try await session.data(for: request)
    return try JSONDecoder().decode([NewFeature].self, from: data.0)
}
```

3. **Update Store**:
```swift
@MainActor
class OperatorShellStore: ObservableObject {
    @Published var newFeatures: [NewFeature] = []
    
    func loadNewFeatures() async {
        do {
            newFeatures = try await http.fetchNewFeatures()
        } catch {
            // Handle error
        }
    }
}
```

4. **Create View**:
```swift
struct NewFeatureView: View {
    @ObservedObject var store: OperatorShellStore
    
    var body: some View {
        List(store.newFeatures) { feature in
            Text(feature.name)
        }
    }
}
```

5. **Write Tests**:
```swift
final class NewFeatureTests: XCTestCase {
    func testNewFeatureDecoding() throws {
        let json = """
        {"id": "1", "name": "Feature", "status": "active"}
        """
        let feature = try JSONDecoder().decode(
            NewFeature.self,
            from: json.data(using: .utf8)!
        )
        XCTAssertEqual(feature.name, "Feature")
    }
}
```

### Modifying API Integration

1. **Update Endpoint Path**:
```swift
let request = try runtime.request(path: "/v2/approvals")
```

2. **Add Request Headers**:
```swift
var request = try runtime.request(path: "/approvals")
request.addValue("application/json", forHTTPHeaderField: "Accept")
```

3. **Update Request Signing**:
```swift
request = try await validator.signRequest(request)
```

4. **Handle New Response Format**:
```swift
struct UpdatedResponse: Codable {
    let data: [Approval]
    let meta: ResponseMetadata
}
let response = try JSONDecoder().decode(UpdatedResponse.self, from: data)
```

### Updating Dependencies

```bash
# Check for updates
swift package update --dry-run

# Update all dependencies
swift package update

# Clean after updates
swift build --clean
swift build
```

### Running Security Audits

```bash
# Run security audit at startup
let audit = SecurityAudit()
let results = await audit.performFullAudit()

# Check specific audits
for check in results {
    if check.severity == .critical {
        print("Critical issue: \(check.message)")
    }
}

# Enable security logging
ENABLE_SECURITY_LOGGING=true swift run BlackBoltOperator
```

## IDE Configuration

### Xcode Settings for Swift Development

#### Editor Settings
- **Tabs & Indentation**:
  - Use Spaces: Yes
  - Space Indentation: 4 spaces
  - Tab Width: 4
- **Code Folding**: Enable

#### Build Settings
- **Swift Compiler - Code Generation**:
  - Optimization Level (Debug): None [-Onone]
  - Optimization Level (Release): Optimize for Speed [-O]
  - Generate Debug Symbols: Yes

- **Swift Compiler - Warning Policies**:
  - Treat Warnings as Errors: Yes (for releases)
  - Swift Language Version: Swift 6.0

#### Debugging Symbols
- **Debug Information Format**:
  - Debug: DWARF with dSYM File
  - Release: DWARF

### Essential Xcode Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Build | Cmd+B |
| Run | Cmd+R |
| Test | Cmd+U |
| Profile | Cmd+I |
| Clean Build | Cmd+Shift+K |
| Show Console | Cmd+Shift+C |
| Show Debugger | Cmd+Shift+Y |
| Jump to Definition | Ctrl+Cmd+J |
| Find Callers | Ctrl+Alt+Cmd+J |
| Format Code | Ctrl+I |

### Xcode Build Performance

```bash
# Clear derived data if builds are slow
rm -rf ~/Library/Developer/Xcode/DerivedData/*

# Rebuild index
# File > Packages > Reset Package Caches
```

### Swift Package Manager Integration

```bash
# Generate Xcode project
swift package generate-xcodeproj

# Remove generated project (use Package.swift instead)
rm -rf BlackBoltOperator.xcodeproj
```

### Code Formatting

```bash
# Install SwiftFormat
brew install swiftformat

# Format entire project
swiftformat Sources/

# Check without formatting
swiftformat --lint Sources/
```

---

This guide provides comprehensive instructions for developing, building, testing, and debugging the BlackBolt Operator application. For architecture details, see SWIFT_ARCHITECTURE_GUIDE.md. For security information, see SWIFT_SECURITY_GUIDE.md.
