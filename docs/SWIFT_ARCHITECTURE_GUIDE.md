# BlackBolt Operator Swift macOS Architecture Guide

## Table of Contents
1. [App Architecture Overview](#app-architecture-overview)
2. [Module Responsibilities](#module-responsibilities)
3. [Data Flow](#data-flow)
4. [State Management](#state-management)
5. [Security Architecture](#security-architecture)
6. [Networking Architecture](#networking-architecture)
7. [Testing Architecture](#testing-architecture)
8. [Scalability Considerations](#scalability-considerations)

## App Architecture Overview

### Layered Architecture Pattern

BlackBolt Operator implements a **4-layer hexagonal architecture** designed for separation of concerns, testability, and maintainability:

```
┌─────────────────────────────────────────────────────────────┐
│                PRESENTATION LAYER (SwiftUI)                │
│  Views: Dashboard, Approvals, Settings, Campaign, Command  │
│  Responsibility: UI rendering, user interaction, local state│
└───────────────────────────┬─────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│         BUSINESS LOGIC LAYER (Models, State Stores)         │
│  OperatorShellStore, Models, Coordinators                   │
│  Responsibility: Application state, use cases, transitions  │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│    DATA ACCESS LAYER (Networking, Storage, Configuration)   │
│  OperatorHTTP, SecureConfigurationStore, Keychain          │
│  Responsibility: Data retrieval, persistence, transactions  │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│         SECURITY LAYER (Cryptography, Validation)           │
│  CertificatePinning, MemorySafety, APIRequestValidator     │
│  Responsibility: Encryption, validation, threat prevention  │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│      FOUNDATION (Swift, macOS, Crypto Frameworks)           │
│  Foundation, Security, CryptoKit, URLSession               │
└─────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Separation of Concerns**: Each layer has distinct responsibilities
2. **Dependency Injection**: Loose coupling through constructor injection
3. **Immutability**: Prefer value types and immutable data structures
4. **Async/Await**: Modern concurrency with structured tasks
5. **Error Handling**: Result types and throwing functions
6. **Defense in Depth**: Multiple security layers for protection

## Module Responsibilities

### BlackBoltOperatorApp.swift

**Purpose**: Application entry point and scene management

**Responsibilities**:
- SwiftUI Scene initialization
- Root view management (NavigationStack)
- OperatorLock integration
- Theme configuration (dark/light mode)
- Security audit startup
- Configuration validation

**Key Interfaces**:
```swift
@main
struct BlackBoltOperatorApp: App {
    @StateObject private var store: OperatorShellStore
    @StateObject private var lock: OperatorLock
    
    var body: some Scene {
        WindowGroup {
            OperatorRootView()
                .environmentObject(store)
                .environmentObject(lock)
        }
    }
}
```

**Dependencies**:
- OperatorShellStore
- OperatorLock
- SecurityAudit

### Models/ - Core Data Structures

#### OperatorModels.swift

**Core Types**:
```swift
struct Approval: Identifiable, Codable {
    let id: String
    let title: String
    let status: ApprovalStatus
    let priority: Priority
    let submittedAt: Date
    let requiredApprovals: Int
    let currentApprovals: Int
}

enum ApprovalStatus: String, Codable {
    case pending, approved, rejected, escalated
}

struct Campaign: Identifiable, Codable {
    let id: String
    let name: String
    let status: CampaignStatus
    let metrics: CampaignMetrics
}
```

**Responsibilities**:
- Data model definitions
- Codable conformance for serialization
- Equatable/Hashable for SwiftUI
- Domain logic validation

#### OperatorRuntimeConfig.swift

**Purpose**: Runtime configuration management

**Features**:
- Loads from UserDefaults at startup
- Validates HTTPS endpoints
- Manages API credentials
- Tracks configuration version for migrations

```swift
struct OperatorRuntimeConfig {
    var apiBaseUrl: String
    var operatorKey: String
    var tenantId: String
    var certificatePinningEnabled: Bool
    var requestSigningEnabled: Bool
}
```

**Key Methods**:
- `init()`: Load from UserDefaults with validation
- `validate()`: Verify configuration integrity
- `save()`: Persist to UserDefaults securely
- `reset()`: Clear configuration

#### OperatorShellStore.swift

**Purpose**: Central state management and application logic

**Key Published Properties**:
```swift
@MainActor
class OperatorShellStore: ObservableObject {
    @Published var approvals: [Approval] = []
    @Published var campaigns: [Campaign] = []
    @Published var isLoading = false
    @Published var error: AppError?
    @Published var selectedApproval: Approval?
}
```

**Major Responsibilities**:
- State persistence
- API communication coordination
- Business logic execution
- Error handling and recovery

### Networking/ - API Communication

#### OperatorHTTP.swift

**Purpose**: HTTP client for API integration

**Architecture**:
```swift
actor OperatorHTTP {
    let session: URLSession
    let validator: APIRequestValidator
    let pinning: CertificatePinning
    
    // Request building with validation
    func request(path: String) throws -> URLRequest
    
    // API endpoints
    func fetchApprovals() async throws -> [Approval]
    func submitApproval(id: String, action: String) async throws -> Void
}
```

**Security Features**:
- TLS 1.3+ enforcement via URLSessionConfiguration
- HTTPS-only validation on all requests
- Certificate pinning integration
- Request signing with HMAC-SHA256
- Response validation and error mapping

**Key Methods**:
- `request(path:)`: Build validated URLRequest
- `perform<T>(_:)`: Execute request with type-safe response
- `signRequest(_:)`: Apply HMAC-SHA256 signature

### Configuration/ - Encrypted Storage

#### SecureConfigurationStore.swift

**Purpose**: Store sensitive configuration with encryption

**Features**:
- AES-GCM encryption (256-bit)
- File protection attributes
- Atomic transactions
- Metadata tracking

```swift
actor SecureConfigurationStore {
    func store(_ config: Configuration) async throws
    func retrieve(_ id: String) async throws -> Configuration
    func delete(_ id: String) async throws
    func listAll() async throws -> [ConfigurationMetadata]
}
```

**Encryption Flow**:
1. Load plaintext configuration
2. Generate random 12-byte IV
3. Encrypt with AES-GCM using app key
4. Store IV + ciphertext + authentication tag
5. Apply file protection: "complete unless open"

### Security/ - Multi-Layer Security

#### CertificatePinning.swift

**Purpose**: Prevent man-in-the-middle attacks via certificate validation

**Public Key Pinning**:
```swift
class CertificatePinning {
    let pinnedHashes: [String]
    
    func validate(certificates: [SecCertificate]) throws
}
```

**Validation Process**:
1. Extract public key from server certificate
2. Calculate SHA256 hash of public key
3. Compare against pinned hashes list
4. Throw if no match found

#### APIRequestValidator.swift

**Purpose**: Request signing and replay attack prevention

**HMAC-SHA256 Signing**:
```swift
actor APIRequestValidator {
    func signRequest(_ request: URLRequest) async throws -> URLRequest
    func validateRequest(_ request: URLRequest) throws -> Void
}
```

**Signature Process**:
1. Generate timestamp (Unix seconds)
2. Generate random nonce (32 bytes)
3. Build canonical request string
4. Calculate HMAC-SHA256
5. Add headers: X-Timestamp, X-Nonce, X-Signature

**Replay Prevention**:
- Timestamp must be within 5 minutes of server time
- Nonce never used twice (cached for 10 minutes)
- Timestamp header prevents request reuse

#### MemorySafety.swift

**Purpose**: Secure credential handling with automatic memory zeroing

**SecureString Implementation**:
```swift
struct SecureString {
    private var data: [UInt8]
    
    func withUnsafeBytes<R>(_ body: (UnsafeRawBufferPointer) throws -> R) throws -> R
    
    deinit { /* Automatic memory zeroing */ }
}
```

**Memory Safety Features**:
- Stack-allocated byte arrays
- Cryptographic erasure in deinit
- No string representation in memory
- Keychain integration for persistence

#### AppSandboxManager.swift

**Purpose**: Validate sandbox configuration and entitlements

**Checks**:
```swift
struct SandboxAudit {
    func checkSandboxEnabled() -> Bool
    func checkCodeSignature() throws -> Void
    func checkEntitlements() throws -> Void
    func checkFileSystemAccess() throws -> Void
}
```

**Entitlements Verified**:
- com.apple.security.app-sandbox (enabled)
- com.apple.security.network.client (present)
- com.apple.security.keychain (present)

#### SecurityAudit.swift

**Purpose**: Comprehensive security audit on startup

**Audit Checks** (6 core checks):
1. Code signature verification
2. Debugger attachment detection
3. Keychain accessibility testing
4. Bundle integrity validation
5. OS version verification
6. Environment variable scanning

**Audit Result**:
```swift
struct AuditResult {
    let checkName: String
    let severity: AuditSeverity
    let passed: Bool
    let message: String
}

enum AuditSeverity {
    case info, warning, critical
}
```

#### Keychain.swift

**Purpose**: Secure credential storage with access control

**Access Control Level**:
```swift
kSecAttrAccessibleWhenUnlockedThisDeviceOnly
```

**Operations**:
```swift
actor Keychain {
    func store(passcode: String) async throws
    func retrieve() async throws -> String
    func rotatePasscode(new: String) async throws
    func clearAll() async throws
}
```

**Security Features**:
- Device unlock required (no passcode fallback)
- Credential expiration tracking (90 days)
- Rotation support for key rotation policies
- Integrity validation on retrieval

### Views/ - User Interface Layer

**17 Total Views**:
- **OperatorRootView**: Root navigation container
- **OperatorLockView**: Lock screen UI
- **DashboardView**: Main dashboard
- **ApprovalsView**: Approval management
- **CampaignEngineView**: Campaign management
- **CommandCenterView**: Central command interface
- **OperatorSettingsView**: Application settings
- **ReviewQueueView**: Approval review queue
- **AlertsHubView**: System alerts
- **AnalyticsView**: Analytics dashboard
- **ReportsView**: Report generation and viewing
- **CustomersListView**: Customer management
- **TenantsView**: Multi-tenant management
- **InterventionsView**: Intervention management
- **ImportsListView**: Import management
- **EvidenceView**: Evidence tracking
- **RevenueSummaryView**: Revenue analytics

**Common View Pattern**:
```swift
struct SomeView: View {
    @ObservedObject var store: OperatorShellStore
    @State private var showAlert = false
    
    var body: some View {
        NavigationStack {
            List(store.items) { item in
                NavigationLink(destination: DetailView(item: item)) {
                    ItemRow(item: item)
                }
            }
            .navigationTitle("Items")
        }
        .alert("Error", isPresented: $showAlert) {
            // Alert content
        }
    }
}
```

## Data Flow

### Request/Response Flow

```
User Action (View)
    ↓
OperatorShellStore (Load state)
    ↓
OperatorHTTP.fetchApprovals()
    ↓
Build URLRequest (path: "/approvals")
    ↓
APIRequestValidator.signRequest() (HMAC-SHA256)
    ↓
CertificatePinning.validate() (TLS handshake)
    ↓
URLSession.data(for:) (HTTP GET)
    ↓
Response.data (Encrypted over TLS 1.3)
    ↓
JSONDecoder (Deserialize [Approval])
    ↓
@Published var approvals (Update in MainActor)
    ↓
View redraw (SwiftUI @Published subscription)
```

### State Management Flow

```
Application State Change
    ↓
OperatorShellStore @Published property update
    ↓
SwiftUI observes change (View is ObservedObject)
    ↓
View body re-computed
    ↓
Minimal re-renders (SwiftUI diffing)
    ↓
User sees updated UI
```

### Error Handling Flow

```
Error thrown at any layer
    ↓
Propagate via throws/async throws
    ↓
OperatorShellStore catches in Task
    ↓
Set @Published error property
    ↓
View observes error change
    ↓
Display error alert/message
    ↓
User dismissed alert
    ↓
Clear error (set to nil)
```

### Security Validation Flow

```
App Launch
    ↓
SecurityAudit.performFullAudit()
    ↓
Run 6 concurrent security checks
    ↓
Collect results with severity levels
    ↓
Log results (critical issues logged)
    ↓
Continue (non-blocking in current design)
    ↓
OperatorRuntimeConfig.validate()
    ↓
Verify HTTPS endpoints
    ↓
Check configuration integrity
    ↓
Ready for user interaction
```

## State Management

### OperatorShellStore Design

**Thread Safety**:
```swift
@MainActor
class OperatorShellStore: ObservableObject {
    // All state updates on main thread
}
```

**State Organization**:
```
OperatorShellStore
├── Approval State
│   ├── @Published var approvals: [Approval]
│   ├── @Published var selectedApproval: Approval?
│   └── @Published var approvalFilter: ApprovalFilter
├── Campaign State
│   ├── @Published var campaigns: [Campaign]
│   └── @Published var activeCampaign: Campaign?
├── UI State
│   ├── @Published var isLoading: Bool
│   ├── @Published var error: AppError?
│   └── @Published var selectedTab: Tab
└── Configuration
    └── runtimeConfig: OperatorRuntimeConfig
```

**State Update Patterns**:

```swift
// Async state update
@MainActor
func loadApprovals() async {
    isLoading = true
    defer { isLoading = false }
    
    do {
        approvals = try await http.fetchApprovals()
        error = nil
    } catch {
        error = AppError(error)
        approvals = []
    }
}

// Computed state
var pendingApprovalsCount: Int {
    approvals.filter { $0.status == .pending }.count
}
```

**Observable State Patterns**:

```swift
// View subscribes to state changes
struct ApprovalsView: View {
    @ObservedObject var store: OperatorShellStore
    
    var body: some View {
        if store.isLoading {
            ProgressView()
        } else if let error = store.error {
            ErrorView(error: error)
        } else {
            List(store.approvals) { approval in
                ApprovalRow(approval: approval)
            }
        }
    }
}
```

### Error State Handling

**Error Types**:
```swift
enum AppError: LocalizedError {
    case networkError(URLError)
    case decodingError(DecodingError)
    case authenticationError
    case securityValidationFailed
    case keychainError(OSStatus)
    
    var errorDescription: String? {
        // User-friendly error messages
    }
}
```

**Error Recovery**:
```swift
// Retry logic with exponential backoff
func loadApprovalsWithRetry(maxAttempts: Int = 3) async {
    for attempt in 1...maxAttempts {
        do {
            approvals = try await http.fetchApprovals()
            return
        } catch {
            if attempt == maxAttempts {
                self.error = AppError(error)
            } else {
                let delay = UInt64(pow(2.0, Double(attempt)) * 1000000000)
                try await Task.sleep(nanoseconds: delay)
            }
        }
    }
}
```

## Security Architecture

### Defense-in-Depth Layers

```
Layer 1: Startup Security Audit
         ├─ Code signature verification
         ├─ Debugger detection
         └─ Entitlements validation

Layer 2: Network Security (TLS 1.3+)
         ├─ HTTPS-only enforcement
         ├─ Certificate pinning
         └─ Perfect forward secrecy

Layer 3: Request Signing (HMAC-SHA256)
         ├─ Request integrity
         ├─ Replay attack prevention
         └─ Authentication

Layer 4: Configuration Security (AES-GCM)
         ├─ Encrypted storage
         ├─ Authenticated encryption
         └─ Key derivation

Layer 5: Memory Safety
         ├─ Secure strings
         ├─ Automatic zeroing
         └─ No plaintext in logs

Layer 6: Keychain Storage
         ├─ Device-unlock access control
         ├─ Credential rotation
         └─ Expiration tracking
```

### Credential Management Flow

```
User enters API key
    ↓
SecureString stores in memory
    ↓
APIRequestValidator holds reference
    ↓
Credentials never logged or displayed
    ↓
Request signing uses without exposure
    ↓
Memory zeroing on deinit
    ↓
Keychain stores with access control
    ↓
Retrieved only when device unlocked
    ↓
Rotation via Keychain.rotatePasscode()
```

### Encryption/Decryption Pipeline

```
Plaintext Configuration
    ↓
SecureConfigurationStore.store()
    ↓
Generate random IV (12 bytes)
    ↓
AES-GCM encryption (256-bit)
    ↓
Generate authentication tag (16 bytes)
    ↓
File: [IV + Ciphertext + Tag]
    ↓
Apply file protection: "complete unless open"
    ↓
------- (At retrieval) -------
    ↓
Read encrypted file
    ↓
Extract IV, Ciphertext, Tag
    ↓
AES-GCM decryption verification
    ↓
Authentication tag validation
    ↓
Return plaintext Configuration
```

### Audit and Validation Flow

```
App Launch
    ↓
SecurityAudit.performFullAudit()
    ├─ Check 1: Code signature verification
    │   ├─ Load app bundle
    │   ├─ Validate signature
    │   └─ Report validity
    ├─ Check 2: Debugger detection
    │   ├─ Signal handler test
    │   └─ Report debugger status
    ├─ Check 3: Keychain accessibility
    │   ├─ Test item storage
    │   ├─ Test item retrieval
    │   └─ Report accessibility
    ├─ Check 4: Bundle integrity
    │   ├─ Hash Info.plist
    │   ├─ Compare with expected
    │   └─ Report integrity
    ├─ Check 5: OS version
    │   ├─ Get system version
    │   ├─ Verify minimum (14.0)
    │   └─ Report version
    └─ Check 6: Environment scanning
        ├─ Check for suspicious vars
        ├─ Check for debug tools
        └─ Report environment

Audit completed
    ↓
Log results (severity levels)
    ↓
Critical issues flagged (but non-blocking)
```

## Networking Architecture

### HTTP Client Design

**Secure Session Configuration**:
```swift
static var secure: URLSession {
    var config = URLSessionConfiguration.default
    
    // TLS 1.3+ only
    config.tlsMinimumSupportedProtocolVersion = .TLSv13
    
    // Disable insecure protocols
    config.tlsMaximumSupportedProtocolVersion = .TLSv13
    
    // Certificate pinning delegate
    let delegate = URLSessionDelegate()
    
    return URLSession(
        configuration: config,
        delegate: delegate,
        delegateQueue: nil
    )
}
```

**TLS/SSL Configuration**:
- Enforced TLS 1.3 minimum
- Perfect forward secrecy (ECDHE key exchange)
- Strong cipher suites only
- Certificate chain validation

**Certificate Pinning**:
- Public key pinning (SHA256 hashes)
- Configurable pinned hashes
- Graceful failure on pin mismatch
- Backup pins for key rotation

**Request/Response Cycle**:
```
URLRequest construction
    ↓
Add security headers
    ↓
Sign with HMAC-SHA256
    ↓
URLSession.data(for:)
    ↓
TLS handshake with cert pinning
    ↓
HTTP request over encrypted channel
    ↓
Receive response
    ↓
Validate response headers
    ↓
Deserialize JSON with strict types
    ↓
Return typed response or throw
```

## Testing Architecture

### Mock Implementations

**Protocol-based mocks**:
```swift
protocol HTTPClient {
    func request(_ path: String) throws -> URLRequest
    func perform<T: Decodable>(_: URLRequest) async throws -> T
}

// Mock for testing
class MockHTTPClient: HTTPClient {
    var stubbedResponse: Any?
    var stubbedError: Error?
    
    func perform<T: Decodable>(_ request: URLRequest) async throws -> T {
        if let error = stubbedError {
            throw error
        }
        return stubbedResponse as! T
    }
}
```

**Test Doubles Strategy**:
- Stub: Returns fixed responses
- Mock: Records calls for verification
- Fake: Partial implementation (in-memory keychain)
- Spy: Wraps real implementation to observe

### Unit vs Integration Test Split

**Unit Tests** (Test individual modules):
- CertificatePinning validation logic
- APIRequestValidator signing algorithm
- MemorySafety string handling
- Configuration encryption/decryption
- State store transformations

**Integration Tests** (Test module interactions):
- Full request/response cycle
- Error handling across layers
- State propagation to UI
- Security audit completion
- Configuration loading and validation

### Performance Test Approach

```swift
func testRequestSigningPerformance() {
    let validator = APIRequestValidator(secretKeyHex: testKey)
    
    self.measure {
        for _ in 0..<1000 {
            _ = try? validator.signRequest(testRequest)
        }
    }
    // Reports time per operation
}
```

## Scalability Considerations

### State Management Scaling

**Horizontal Scaling**:
- Separate stores for different features (ApprovalStore, CampaignStore)
- Avoid monolithic OperatorShellStore
- Use @StateObject for sub-stores in views

**Vertical Scaling**:
- Pagination for large lists
- Lazy loading of data
- In-memory cache with size limits

### Memory Management

**Memory Profiling**:
- Monitor allocated memory with Instruments
- Profile object lifecycles
- Detect retain cycles with Xcode debugger

**Optimization**:
- Release cached data periodically
- Use weak references for delegated callbacks
- Profile view allocations with Memory Graph

### Network Optimization

**Batch Requests**:
```swift
async let approvals = fetchApprovals()
async let campaigns = fetchCampaigns()
let (a, c) = try await (approvals, campaigns)
```

**Connection Reuse**:
- URLSession manages connection pooling
- Keep-alive for multiple requests
- Connection timeout configuration

**Request Coalescing**:
```swift
@MainActor
func loadApprovalsOnce() async {
    if approvals == nil {
        approvals = try await http.fetchApprovals()
    }
}
```

### UI Responsiveness

**Main Thread Constraints**:
- All UI updates on @MainActor
- Async operations off-main for network/crypto
- Loading states prevent user interaction freeze

**List Performance**:
- Use LazyStack for large lists
- Virtualización in ScrollView
- Minimize view complexity per row

---

This architecture guide explains the foundational design of BlackBolt Operator. For security implementation details, see SWIFT_SECURITY_GUIDE.md. For development instructions, see SWIFT_DEVELOPMENT_GUIDE.md.
