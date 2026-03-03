# BlackBolt Operator Swift macOS Troubleshooting Guide

## Table of Contents
1. [Build Failures](#build-failures)
2. [Runtime Errors](#runtime-errors)
3. [Code Signing Issues](#code-signing-issues)
4. [Performance Issues](#performance-issues)
5. [Testing Issues](#testing-issues)
6. [Debugging Techniques](#debugging-techniques)
7. [Common Issues and Solutions](#common-issues-and-solutions)

## Build Failures

### "Module not found" Errors

**Symptom**: Compilation fails with "Module 'X' not found" or similar

**Common Causes**:
1. Dependencies not resolved
2. Build cache corruption
3. Missing Xcode toolchain
4. Incorrect Swift version

**Solutions**:

```bash
# Solution 1: Update dependencies
swift package update

# Solution 2: Clean build cache
rm -rf .build
swift package clean

# Solution 3: Force re-resolution
swift package update --force

# Solution 4: Verify Swift version
swift --version
# Expected: Swift version 6.0.x

# Solution 5: Reset Package Manager cache
rm -rf ~/Library/Developer/Xcode/DerivedData/*
swift build
```

**Verification**:
```bash
# Check if module can be found
swift package describe
# Should list all dependencies

# Check Package.resolved
cat Package.resolved | grep -A 5 '"name"'
```

### Compilation Errors

**Symptom**: Swift compiler error like "Type 'X' does not conform to protocol 'Y'"

**Common Causes**:
1. Protocol conformance missing
2. Type mismatch
3. Ambiguous method overload
4. Missing inheritance declaration

**Type Mismatch Example**:
```swift
// ❌ Error: Type mismatch
let approval: Approval = "123"

// ✅ Fix: Correct type
let approval: Approval = fetchedApproval
```

**Protocol Conformance Example**:
```swift
// ❌ Error: Does not conform to Codable
struct MyApproval {
    let id: String
    let data: Data  // Data is not Codable!
}

// ✅ Fix: Use proper Codable types
struct MyApproval: Codable {
    let id: String
    let dataString: String  // Use String instead
}
```

**Solutions**:

```bash
# Check which Swift version is active
xcode-select -p
# Output: /Applications/Xcode.app/Contents/Developer

# Try specific compiler flags
swift build -Xswiftc -D -Xswiftc DEBUG

# Build with warnings as errors (to catch all issues)
swift build --strict-warnings
```

### Linking Errors

**Symptom**: "Undefined symbols for architecture arm64" or "ld: symbol not found"

**Common Causes**:
1. Missing dependency configuration
2. Symbol visibility issues
3. Framework not linked
4. Incompatible architecture

**Solutions**:

```bash
# Solution 1: Check Package.swift dependencies
cat Package.swift | grep -A 10 "dependencies"

# Solution 2: Clean and rebuild
swift package clean
rm -rf .build
swift build

# Solution 3: Check for architecture issues
lipo -info .build/debug/BlackBoltOperator

# Solution 4: Rebuild with verbose output
swift build -v 2>&1 | grep -i "error\|undefined"

# Solution 5: Check if local dependency is built
ls -la ../BlackBoltAPI/.build/
```

**Debug Linking**:
```bash
# Get detailed linking information
swift build -v 2>&1 | grep -E "ld|clang|link"

# Check dynamic dependencies
otool -L .build/debug/BlackBoltOperator
```

## Runtime Errors

### Keychain Access Errors

**Symptom**: "OSStatus -34018" or "Keychain error" at runtime

**Error Code Meanings**:
- `-34018`: Item not found (erSecItemNotFound)
- `-25293`: Invalid parameter (erSecParam)
- `-25294`: User cancelled (erSecUserCancelled)
- `-25308`: Item already exists (erSecDuplicateItem)

**Common Causes**:
1. Incorrect account identifier
2. Item not in keychain
3. Access denied by sandbox
4. Keychain locked (device is locked)

**Solutions**:

```bash
# Check if item exists in Keychain
security find-generic-password -a operator_key \
  ~/Library/Keychains/login.keychain-db

# Delete existing item (if corrupted)
security delete-generic-password -a operator_key \
  ~/Library/Keychains/login.keychain-db

# Create test keychain for debugging
security create-keychain -p password ~/Library/Keychains/debug.keychain
security set-keychain-settings -t -l -u ~/Library/Keychains/debug.keychain

# Use debug keychain
KEYCHAIN_PATH=~/Library/Keychains/debug.keychain swift run BlackBoltOperator

# Lock/unlock device in Simulator (Shift+Ctrl+Cmd+Q)
# This tests access control
```

**Debugging Code**:
```swift
// Add detailed error logging
func debugKeychainAccess() {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: "operator_key"
    ]
    
    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    
    print("Keychain query status: \(status)")
    // Status codes:
    // 0 = errSecSuccess
    // -34018 = erSecItemNotFound
    // -34014 = erSecNoSuchAttr (incorrect account)
}
```

### Network Errors

**Symptom**: URLError or connection refused

**Network Error Codes**:
- `NSURLErrorNotConnectedToInternet`: No network
- `NSURLErrorCannotFindHost`: DNS resolution failed
- `NSURLErrorCannotConnectToHost`: Connection refused
- `NSURLErrorSecureConnectionFailed`: TLS error
- `NSURLErrorClientCertificateRequired`: Certificate error

**Certificate Pinning Failures**:

```bash
# Check certificate details
openssl s_client -connect api.blackbolt.local:8443 -showcerts

# Extract public key for pinning
openssl s_client -connect api.blackbolt.local:8443 < /dev/null | \
  openssl x509 -outform DER | \
  openssl dgst -sha256 -binary | \
  openssl enc -base64

# Test with curl
curl -v -X GET https://api.blackbolt.local:8443/approvals \
  --cacert /path/to/ca-cert.pem
```

**TLS Negotiation Issues**:

```bash
# Test TLS version
openssl s_client -connect api.blackbolt.local:8443 -tls1_2
openssl s_client -connect api.blackbolt.local:8443 -tls1_3

# Check cipher suites
openssl s_client -connect api.blackbolt.local:8443 -showcerts 2>&1 | \
  grep "Cipher"

# Test with specific cipher
openssl s_client -connect api.blackbolt.local:8443 \
  -cipher 'TLS13-AES-256-GCM-SHA384:TLS13-AES-128-GCM-SHA256'
```

**Request Timeout Scenarios**:

```swift
// Increase timeout for slow networks
var config = URLSessionConfiguration.default
config.timeoutIntervalForRequest = 30  // 30 seconds
config.timeoutIntervalForResource = 300  // 5 minutes

let session = URLSession(configuration: config)
```

**Debugging Network**:

```bash
# Monitor network requests (all interfaces)
sudo tcpdump -i en0 -n 'tcp port 8443'

# Or use Network framework diagnostics
ENABLE_NETWORK_LOGGING=true swift run BlackBoltOperator 2>&1 | \
  grep -i "network\|error\|failed"

# Test endpoint manually
curl -X GET https://api.blackbolt.local:8443/approvals \
  -H "X-Timestamp: $(date +%s)" \
  -H "X-Nonce: test-nonce" \
  -v
```

### Configuration Errors

**Symptom**: "Invalid configuration" or "Empty value detected"

**Common Causes**:
1. Missing environment variables
2. Invalid configuration values
3. Configuration corruption
4. Version mismatch

**Solutions**:

```bash
# Check environment variables are set
env | grep -i "API_\|OPERATOR_\|TENANT_"

# Test with explicit values
API_BASE_URL=https://api.local:8443 \
OPERATOR_KEY=test-key-32-chars-min \
TENANT_ID=test-tenant \
swift run BlackBoltOperator

# Check configuration file
cat ~/Library/Application\ Support/BlackBoltOperator/config.plist

# Reset to defaults
rm -rf ~/Library/Application\ Support/BlackBoltOperator
swift run BlackBoltOperator  # Will re-create with defaults

# Enable configuration logging
ENABLE_SECURITY_LOGGING=true swift run BlackBoltOperator
```

**Validate Configuration**:

```swift
// Add validation at startup
func validateConfiguration() async throws {
    let config = OperatorRuntimeConfig()
    
    // Verify each required field
    guard !config.apiBaseUrl.isEmpty else {
        throw ConfigError.missingApiUrl
    }
    guard config.apiBaseUrl.hasPrefix("https://") else {
        throw ConfigError.insecureApiUrl
    }
    guard !config.operatorKey.isEmpty else {
        throw ConfigError.missingOperatorKey
    }
    
    print("Configuration valid: ✅")
}
```

## Code Signing Issues

### "Code signature invalid" Error

**Symptom**: "dyld: code signature invalid" or similar

**Common Causes**:
1. Modified binary after signing
2. Signature certificate invalid
3. Entitlements mismatch
4. Architecture mismatch

**Solutions**:

```bash
# Check signature validity
codesign -v /Applications/BlackBoltOperator.app
# Output: valid on disk OR in ad hoc signature invalid

# Verify signature details
codesign -d -v /Applications/BlackBoltOperator.app

# Re-sign binary
codesign -s - /Applications/BlackBoltOperator.app

# Sign with specific certificate
codesign -s "Developer ID Application: Company Name" \
         --options runtime \
         /Applications/BlackBoltOperator.app

# Verify code signing certificate exists
security find-identity -v -p codesigning
```

### Certificate Not Found

**Symptom**: "Certificate not found in keychain" during signing

**Solutions**:

```bash
# List available certificates
security find-identity -v -p codesigning

# Import certificate into Keychain
security import certificate.p12 \
  -k ~/Library/Keychains/login.keychain-db \
  -P certificate_password

# Create self-signed certificate for development
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem \
  -days 365 -subj "/CN=Self Signed"

# Import to Keychain
openssl pkcs12 -export -in cert.pem -inkey key.pem \
  -out certificate.p12 -password pass:password

security import certificate.p12 \
  -k ~/Library/Keychains/login.keychain-db -P password
```

### Entitlements Mismatch

**Symptom**: "Entitlements don't match" or sandbox violation

**Solutions**:

```bash
# Check current entitlements
codesign -d --entitlements /dev/stdout /Applications/BlackBoltOperator.app

# Re-sign with correct entitlements
codesign -s "Developer ID Application" \
         --entitlements entitlements.plist \
         /Applications/BlackBoltOperator.app

# Verify entitlements were applied
codesign -d --entitlements /dev/stdout /Applications/BlackBoltOperator.app | \
  grep "com.apple.security"
```

## Performance Issues

### High Memory Usage

**Symptom**: App consumes > 500MB memory

**Debugging Steps**:

```bash
# Check memory usage
ps aux | grep BlackBoltOperator

# Monitor with Activity Monitor
open -a "Activity Monitor"
# Search for "BlackBolt", watch Memory column

# Use Instruments profiler
swift run -c release BlackBoltOperator
# In Xcode: Product > Profile > Allocations

# Check for memory leaks
# Product > Profile > Leaks
```

**Common Memory Leaks**:

```swift
// ❌ Leak: Retain cycle
class OperatorShellStore {
    var observer: NSObjectProtocol?
    
    init() {
        observer = NotificationCenter.default.addObserver(
            forName: NSNotification.Name("Test"),
            object: nil,
            queue: .main
        ) { [self] _ in  // ⚠️ Captures self
            self.update()
        }
    }
    // observer never removed!
}

// ✅ Fix: Use weak self
observer = NotificationCenter.default.addObserver(
    forName: NSNotification.Name("Test"),
    object: nil,
    queue: .main
) { [weak self] _ in
    self?.update()
}

deinit {
    if let observer = observer {
        NotificationCenter.default.removeObserver(observer)
    }
}
```

**Large Data Structure Caching**:

```swift
// ❌ Problem: Caching large data indefinitely
class Cache {
    var approvals: [Approval] = []  // Grows unbounded
}

// ✅ Solution: Limit cache size
actor LimitedCache {
    private var approvals: [Approval] = []
    private let maxSize = 1000
    
    func addApprovals(_ new: [Approval]) {
        approvals.append(contentsOf: new)
        if approvals.count > maxSize {
            approvals.removeFirst(approvals.count - maxSize)
        }
    }
}
```

### Slow API Calls

**Symptom**: Requests take > 5 seconds

**Investigation**:

```bash
# Log request timing
ENABLE_NETWORK_LOGGING=true swift run BlackBoltOperator 2>&1 | \
  grep -E "request|response|timing"

# Check network latency
ping -c 10 api.blackbolt.local
# Look for packet loss and latency

# Test endpoint directly
time curl -X GET https://api.blackbolt.local:8443/approvals \
  -H "X-Timestamp: $(date +%s)" \
  -H "X-Nonce: test" \
  2>&1 | tail -1
```

**Performance Optimization**:

```swift
// Measure request duration
let start = Date()
let data = try await performRequest()
let duration = Date().timeIntervalSince(start)
print("Request took \(duration)s")

// Optimize signing (pre-calculate if possible)
// Batch requests
async let approvals = fetchApprovals()
async let campaigns = fetchCampaigns()
let (a, c) = try await (approvals, campaigns)
```

### UI Responsiveness

**Symptom**: App freezes during operations

**Common Causes**:
1. Long-running operation on main thread
2. Synchronous network requests
3. Large view updates

**Solutions**:

```swift
// ❌ Bad: Blocking main thread
func loadApprovals() {
    let data = fetchApprovalsSync()  // BLOCKS UI
    approvals = data
}

// ✅ Good: Async operation
func loadApprovals() {
    Task {
        do {
            approvals = try await http.fetchApprovals()
        } catch {
            showError(error)
        }
    }
}

// ✅ Good: Explicit main thread dispatch
Task {
    let data = try await fetchApprovals()
    await MainActor.run {
        self.approvals = data
    }
}
```

**Profile UI Performance**:

```bash
# Use Core Animation Tool
# Product > Profile > Core Animation

# Monitor frame rate (should be 60 FPS)
# Check for yellow/red indicators
```

## Testing Issues

### Test Failures

**Symptom**: Tests fail with assertion errors

**Debugging**:

```bash
# Run single test
swift test --filter "TestName"

# Run with verbose output
swift test -v

# Run with output capture
swift test 2>&1 | tee test-output.log

# Check which test failed
swift test --filter "CertificatePinningTests"
```

**Async Test Timeout**:

```swift
// ❌ Problem: Test times out
func testAsyncOperation() async throws {
    let result = try await someAsyncFunction()
    XCTAssertEqual(result, expected)
}

// ✅ Solution: Set timeout
func testAsyncOperation() async throws {
    let result: Bool = try await withThrowingTaskGroup(
        of: Bool.self
    ) { group in
        group.addTask(operation: someAsyncFunction)
        
        if let result = try await group.next() {
            return result
        }
        throw TestError.timeout
    }
}

// ✅ Better: Use timeout wrapper
func testWithTimeout() async throws {
    try await withThrowingTaskGroup(of: Void.self) { group in
        group.addTask {
            try await someAsyncFunction()
        }
        
        try await Task.sleep(nanoseconds: 5_000_000_000)  // 5 second timeout
        group.cancelAll()
    }
}
```

### Mock Setup Problems

**Symptom**: Mocks don't work as expected

**Solutions**:

```swift
// ✅ Proper mock setup
class MockHTTPClient: HTTPClient {
    var stubbedResponse: [Approval]?
    var stubbedError: Error?
    
    func fetchApprovals() async throws -> [Approval] {
        if let error = stubbedError {
            throw error
        }
        return stubbedResponse ?? []
    }
}

// ✅ Use in test
func testWithMock() {
    let mock = MockHTTPClient()
    mock.stubbedResponse = [mockApproval]
    
    let store = OperatorShellStore(http: mock)
    // Test...
}
```

### Test Coverage Issues

```bash
# Generate coverage report
swift test --enable-code-coverage

# Find coverage data
find .build -name "*.profdata" -type f

# View coverage
xcrun llvm-cov show \
  -instr-profile=.build/debug/codecov/default.profdata \
  .build/debug/BlackBoltOperatorTests \
  Sources/BlackBoltOperator/Security/CertificatePinning.swift
```

## Debugging Techniques

### Xcode Debugger

**Set Breakpoint**:
```
1. Click in gutter next to line
2. Blue arrow appears
3. Right-click for options
```

**Debugger Commands**:
```lldb
# Print variable
(lldb) po someVariable

# Continue execution
(lldb) continue

# Step over
(lldb) next

# Step into
(lldb) step

# Print backtrace
(lldb) bt
```

### LLDB Cheat Sheet

```lldb
# Memory inspection
memory read 0x7fff1234

# Evaluate expression
expr someVariable = newValue

# Conditional breakpoint
breakpoint set --file OperatorHTTP.swift --line 42 --condition "url.count > 100"

# Watchpoint
watchpoint set variable someVariable
```

### Logging Debug Information

```swift
// Structured logging
func log(_ message: String, level: LogLevel = .info) {
    let timestamp = ISO8601DateFormatter().string(from: Date())
    print("[\(timestamp)] [\(level)] \(message)")
}

// Usage in debugging
log("API request initiated", level: .debug)
log("Certificate validation: \(result)", level: .debug)
```

### System Logs

```bash
# View application logs
log show --predicate 'process == "BlackBoltOperator"' --last 1h

# Filter for errors
log show --predicate 'process == "BlackBoltOperator" AND level == error' --last 1h

# Real-time log streaming
log stream --predicate 'process == "BlackBoltOperator"' --level debug
```

## Common Issues and Solutions

### Keychain Locked After System Sleep

**Symptom**: Keychain access fails after device sleeps, works after unlock

**Root Cause**: Access control set to `WhenUnlockedThisDeviceOnly`

**Expected Behavior**: This is correct! Access control intentionally locks on sleep.

**Solution**: Ensure app handles `kSecErrorWhenLockedError`:

```swift
do {
    let credential = try await keychain.retrieve()
} catch KeychainError.whenLocked {
    // Show message to user
    presentLockScreen()
} catch {
    // Handle other errors
}
```

### Network Requests Hanging

**Symptom**: Requests never complete, no error returned

**Debugging**:

```bash
# Check if request is actually sent
sudo tcpdump -i en0 -n 'tcp port 8443' | head -20

# Set explicit timeout
URLSessionConfiguration.default.timeoutIntervalForRequest = 30

# Check if server is responding
curl -v -X GET https://api.blackbolt.local:8443/approvals --max-time 10
```

**Common Cause - Missing Request Signing**:

```swift
// ❌ Request hangs (server waits for signature)
var request = try runtime.request(path: "/approvals")
let data = try await session.data(for: request)

// ✅ Sign request first
var request = try runtime.request(path: "/approvals")
request = try await validator.signRequest(request)
let data = try await session.data(for: request)
```

### Certificate Validation Failures

**Symptom**: "Certificate validation failed" or 403 Forbidden

**Solutions**:

```bash
# Check certificate chain
openssl s_client -connect api.blackbolt.local:8443 -showcerts

# Verify certificate dates
openssl x509 -in cert.pem -text -noout | grep -E "Not Before|Not After"

# Disable pinning for debugging
CERTIFICATE_PINNING_ENABLED=false swift run BlackBoltOperator

# Extract and verify pinning hash
openssl x509 -pubkey -noout < cert.pem | \
  openssl pkey -pubin -outform der | \
  openssl dgst -sha256 -binary | \
  openssl enc -base64
```

---

This troubleshooting guide covers the most common issues and their solutions. For more detailed information, see SWIFT_SECURITY_GUIDE.md (for security-related issues) and SWIFT_DEVELOPMENT_GUIDE.md (for development setup issues).
