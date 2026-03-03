# BlackBolt Operator Swift macOS API Integration Guide

## Table of Contents
1. [OpenAPI Contract](#openapi-contract)
2. [API Client Usage](#api-client-usage)
3. [Authentication](#authentication)
4. [Endpoints Reference](#endpoints-reference)
5. [Common Operations](#common-operations)
6. [Error Handling](#error-handling)
7. [Rate Limiting](#rate-limiting)
8. [Security](#security)
9. [Testing with Mocks](#testing-with-mocks)
10. [API Versioning](#api-versioning)

## OpenAPI Contract

### Contract Location

The OpenAPI specification for BlackBolt Operator API is defined in:

```
Repository: ../BlackBoltAPI
Path: openapi.yaml or openapi.json
Location: Project root or /docs/openapi/
```

### Accessing the Specification

```bash
# View OpenAPI spec (YAML format)
cat ../BlackBoltAPI/openapi.yaml

# View specific endpoint
grep -A 20 "paths:" ../BlackBoltAPI/openapi.yaml | head -30

# Convert to JSON for parsing
yq -P ../BlackBoltAPI/openapi.yaml > openapi.json
```

### Schema Reference

**Key Components**:

```yaml
# Approval object
Approval:
  type: object
  properties:
    id:
      type: string
      format: uuid
    title:
      type: string
    status:
      type: string
      enum: [pending, approved, rejected, escalated]
    priority:
      type: string
      enum: [low, medium, high, critical]
    submittedAt:
      type: string
      format: date-time
    requiredApprovals:
      type: integer
    currentApprovals:
      type: integer

# Campaign object
Campaign:
  type: object
  properties:
    id:
      type: string
      format: uuid
    name:
      type: string
    status:
      type: string
      enum: [draft, active, completed, archived]
    startDate:
      type: string
      format: date-time
    endDate:
      type: string
      format: date-time
    metrics:
      $ref: '#/components/schemas/CampaignMetrics'
```

### Code Generation Process

**Generate Code from OpenAPI**:

```bash
# Install Swift OpenAPI Generator
brew install swift-openapi-generator

# Generate client code
swift openapi generate \
  --input ../BlackBoltAPI/openapi.yaml \
  --output Sources/BlackBoltOperator/Generated/

# Generated files include:
# - Types.swift (data models)
# - Client.swift (API client)
# - Operations.swift (endpoint operations)
```

### Updates and Versioning

**When API Schema Changes**:

```bash
# 1. Update OpenAPI spec in BlackBoltAPI
# 2. Regenerate code
swift openapi generate --input ../BlackBoltAPI/openapi.yaml

# 3. Review generated changes
git diff Sources/BlackBoltOperator/Generated/

# 4. Update integration code if needed
# (Usually generated code is backward compatible)

# 5. Test with new schema
swift test

# 6. Update version if breaking changes
# MAJOR if breaking, MINOR if additive
```

## API Client Usage

### Creating HTTP Client

**Basic Setup**:

```swift
import Foundation

class OperatorHTTP {
    let session: URLSession
    let baseURL: URL
    let validator: APIRequestValidator
    
    init(
        baseURL: URL,
        validator: APIRequestValidator
    ) throws {
        // Validate HTTPS
        guard baseURL.scheme == "https" else {
            throw NetworkError.insecureURL
        }
        
        self.baseURL = baseURL
        self.validator = validator
        
        // Create secure session
        var config = URLSessionConfiguration.default
        config.tlsMinimumSupportedProtocolVersion = .TLSv13
        config.httpShouldSetCookies = false
        config.urlCredentialStorage = nil
        
        self.session = URLSession(configuration: config)
    }
}
```

### Building Requests

**Request Construction**:

```swift
// Build request for endpoint
func request(
    path: String,
    method: String = "GET"
) throws -> URLRequest {
    // 1. Construct URL
    guard var urlComponents = URLComponents(url: baseURL, resolvingAgainstBaseURL: true) else {
        throw NetworkError.invalidURL
    }
    urlComponents.path = path
    
    guard let url = urlComponents.url else {
        throw NetworkError.invalidURL
    }
    
    // 2. Create request
    var request = URLRequest(url: url)
    request.httpMethod = method
    
    // 3. Add security headers
    request.addValue("application/json", forHTTPHeaderField: "Content-Type")
    request.addValue("application/json", forHTTPHeaderField: "Accept")
    
    // 4. Sign request
    request = try await validator.signRequest(request)
    
    return request
}

// Usage
let approvalRequest = try runtime.request(path: "/approvals")
```

### Response Parsing

**Type-Safe Response Handling**:

```swift
// Generic response handler
func perform<T: Decodable>(
    _ request: URLRequest
) async throws -> T {
    // 1. Execute request
    let (data, response) = try await session.data(for: request)
    
    // 2. Validate HTTP response
    guard let httpResponse = response as? HTTPURLResponse else {
        throw NetworkError.invalidResponse
    }
    
    // 3. Check status code
    switch httpResponse.statusCode {
    case 200..<300:
        // Success - decode response
        return try JSONDecoder().decode(T.self, from: data)
    case 400:
        throw NetworkError.badRequest(try decode(ErrorResponse.self, from: data))
    case 401:
        throw NetworkError.unauthorized
    case 403:
        throw NetworkError.forbidden
    case 404:
        throw NetworkError.notFound
    case 429:
        throw NetworkError.rateLimited
    case 500..<600:
        throw NetworkError.serverError(httpResponse.statusCode)
    default:
        throw NetworkError.unknownError(httpResponse.statusCode)
    }
}

// Usage
let approvals: [Approval] = try await perform(request)
```

### Error Mapping

**Custom Error Types**:

```swift
enum NetworkError: LocalizedError {
    case invalidURL
    case invalidResponse
    case badRequest(ErrorResponse)
    case unauthorized
    case forbidden
    case notFound
    case rateLimited
    case serverError(Int)
    case unknownError(Int)
    case decodingError(DecodingError)
    
    var errorDescription: String? {
        switch self {
        case .unauthorized:
            return "Authentication failed. Please check your credentials."
        case .rateLimited:
            return "Too many requests. Please try again later."
        case .serverError(let code):
            return "Server error (\(code)). Please try again later."
        default:
            return "An error occurred. Please try again."
        }
    }
}

// Decode API error response
struct ErrorResponse: Decodable {
    let code: String
    let message: String
    let details: [String: String]?
}
```

## Authentication

### Operator Key Requirements

**Key Format and Storage**:

```swift
// Operator key requirements
struct OperatorKeyRequirements {
    static let minimumLength = 32
    static let maximumLength = 256
    static let allowedCharacters = CharacterSet.alphanumerics
                                    .union(CharacterSet(charactersIn: "-_"))
}

// Validate key format
func validateOperatorKey(_ key: String) throws {
    guard key.count >= OperatorKeyRequirements.minimumLength else {
        throw ValidationError.keyTooShort
    }
    
    guard key.count <= OperatorKeyRequirements.maximumLength else {
        throw ValidationError.keyTooLong
    }
}
```

### Tenant ID Management

**Tenant ID Format**:

```swift
// Tenant ID structure
struct TenantID {
    let value: String
    
    init(_ value: String) throws {
        // Validate format
        let pattern = "^[a-zA-Z0-9_-]{1,128}$"
        let regex = try NSRegularExpression(pattern: pattern)
        
        guard regex.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)) != nil else {
            throw ValidationError.invalidTenantID
        }
        
        self.value = value
    }
}

// Usage
let tenantID = try TenantID("org-123-production")
```

### Request Header Injection

**Automatic Header Addition**:

```swift
// Add authentication headers to all requests
extension URLRequest {
    mutating func addAuthenticationHeaders(
        operatorKey: String,
        tenantID: String
    ) {
        // Add custom headers
        addValue(operatorKey, forHTTPHeaderField: "X-Operator-Key")
        addValue(tenantID, forHTTPHeaderField: "X-Tenant-ID")
        
        // Add request signature (HMAC-SHA256)
        // See APIRequestValidator.signRequest()
    }
}

// Usage
var request = try runtime.request(path: "/approvals")
request.addAuthenticationHeaders(
    operatorKey: runtimeConfig.operatorKey,
    tenantID: runtimeConfig.tenantID
)
request = try await validator.signRequest(request)
```

### Token Refresh

**If Using Temporary Tokens**:

```swift
// Token with expiration
struct AuthToken: Codable {
    let token: String
    let expiresAt: Date
    
    var isExpired: Bool {
        Date() > expiresAt
    }
}

// Refresh token if needed
@MainActor
func ensureValidToken() async throws -> String {
    if let token = currentToken, !token.isExpired {
        return token.token
    }
    
    // Request new token
    let newToken = try await refreshToken()
    currentToken = newToken
    return newToken.token
}

// Add token to request
var request = try runtime.request(path: "/approvals")
let token = try await ensureValidToken()
request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
```

## Endpoints Reference

### Base URL Configuration

**API Endpoint Structure**:

```swift
// Base URL from configuration
let baseURL = URL(string: "https://api.blackbolt.local:8443")!

// Full endpoint paths
let approvalEndpoint = baseURL.appendingPathComponent("/api/v1/approvals")
// Result: https://api.blackbolt.local:8443/api/v1/approvals
```

### Common Endpoint Paths

**Approval Management**:
```
GET    /api/v1/approvals                    - List approvals
GET    /api/v1/approvals/:id                - Get approval details
POST   /api/v1/approvals/:id/approve        - Approve
POST   /api/v1/approvals/:id/reject         - Reject
POST   /api/v1/approvals/:id/escalate       - Escalate
```

**Campaign Management**:
```
GET    /api/v1/campaigns                    - List campaigns
GET    /api/v1/campaigns/:id                - Get campaign details
POST   /api/v1/campaigns                    - Create campaign
PATCH  /api/v1/campaigns/:id                - Update campaign
POST   /api/v1/campaigns/:id/activate       - Activate campaign
POST   /api/v1/campaigns/:id/close          - Close campaign
```

**Reports**:
```
GET    /api/v1/reports                      - List reports
POST   /api/v1/reports                      - Generate report
GET    /api/v1/reports/:id                  - Get report details
GET    /api/v1/reports/:id/download         - Download report
```

**Health and Status**:
```
GET    /api/v1/health                       - Health check
GET    /api/v1/status                       - System status
GET    /api/v1/version                      - API version
```

### HTTP Methods

**Standard REST Methods**:

```swift
enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case patch = "PATCH"
    case put = "PUT"
    case delete = "DELETE"
    case head = "HEAD"
    case options = "OPTIONS"
}
```

### Request/Response Examples

**List Approvals Request**:

```bash
# cURL example
curl -X GET https://api.blackbolt.local:8443/api/v1/approvals \
  -H "X-Operator-Key: $(cat ~/.config/blackbolt/operator-key)" \
  -H "X-Tenant-ID: org-123" \
  -H "X-Timestamp: $(date +%s)" \
  -H "X-Nonce: $(openssl rand -hex 16)" \
  -H "X-Signature: (calculated HMAC-SHA256)" \
  -H "Content-Type: application/json"
```

**List Approvals Response**:

```json
{
  "data": [
    {
      "id": "approval-123",
      "title": "Access Review",
      "status": "pending",
      "priority": "high",
      "submittedAt": "2026-03-03T10:30:00Z",
      "requiredApprovals": 2,
      "currentApprovals": 0
    }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "pageSize": 20,
    "hasMore": true
  }
}
```

**Approve Request**:

```bash
curl -X POST https://api.blackbolt.local:8443/api/v1/approvals/approval-123/approve \
  -H "X-Operator-Key: ..." \
  -H "X-Tenant-ID: org-123" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Approved after review",
    "comments": "User verified"
  }'
```

### Error Responses and Codes

**Common Error Responses**:

```json
// 400 Bad Request
{
  "code": "INVALID_REQUEST",
  "message": "Invalid request parameters",
  "details": {
    "field": "approvalId",
    "issue": "not a valid UUID"
  }
}

// 401 Unauthorized
{
  "code": "UNAUTHORIZED",
  "message": "Authentication required"
}

// 403 Forbidden
{
  "code": "INSUFFICIENT_PERMISSIONS",
  "message": "User lacks required permissions",
  "details": {
    "required": "approval.review",
    "user_permissions": ["approval.view"]
  }
}

// 429 Too Many Requests
{
  "code": "RATE_LIMITED",
  "message": "Rate limit exceeded",
  "details": {
    "retryAfter": 60,
    "limit": 100,
    "window": "60 seconds"
  }
}

// 500 Internal Server Error
{
  "code": "INTERNAL_ERROR",
  "message": "Internal server error",
  "details": {
    "requestId": "req-abc123",
    "timestamp": "2026-03-03T10:30:00Z"
  }
}
```

## Common Operations

### Fetching Approvals

```swift
// Fetch all pending approvals
@MainActor
func fetchPendingApprovals() async throws -> [Approval] {
    var request = try runtime.request(path: "/api/v1/approvals?status=pending")
    request.httpMethod = "GET"
    request = try await validator.signRequest(request)
    
    return try await http.perform(request)
}

// Usage
do {
    let approvals = try await fetchPendingApprovals()
    self.approvals = approvals
} catch {
    self.error = error
}
```

### Submitting Approvals

```swift
// Submit approval action
@MainActor
func submitApprovalAction(
    approvalId: String,
    action: ApprovalAction,
    reason: String
) async throws {
    // Build request body
    let body = [
        "action": action.rawValue,
        "reason": reason
    ]
    
    var request = try runtime.request(path: "/api/v1/approvals/\(approvalId)/\(action.endpoint)")
    request.httpMethod = "POST"
    request.httpBody = try JSONEncoder().encode(body)
    
    request = try await validator.signRequest(request)
    let _: EmptyResponse = try await http.perform(request)
}

enum ApprovalAction: String {
    case approve, reject, escalate
    
    var endpoint: String {
        self.rawValue
    }
}

// Usage
try await submitApprovalAction(
    approvalId: "approval-123",
    action: .approve,
    reason: "Verified and approved"
)
```

### Fetching Campaigns

```swift
// Fetch active campaigns
@MainActor
func fetchActiveCampaigns() async throws -> [Campaign] {
    var request = try runtime.request(path: "/api/v1/campaigns?status=active")
    request.httpMethod = "GET"
    request = try await validator.signRequest(request)
    
    return try await http.perform(request)
}
```

### Updating Campaign Status

```swift
// Update campaign status
@MainActor
func updateCampaignStatus(
    campaignId: String,
    newStatus: CampaignStatus
) async throws {
    let body = ["status": newStatus.rawValue]
    
    var request = try runtime.request(path: "/api/v1/campaigns/\(campaignId)")
    request.httpMethod = "PATCH"
    request.httpBody = try JSONEncoder().encode(body)
    request = try await validator.signRequest(request)
    
    let _: EmptyResponse = try await http.perform(request)
}

enum CampaignStatus: String, Codable {
    case draft, active, completed, archived
}
```

### Generating Reports

```swift
// Generate report
@MainActor
func generateReport(
    type: ReportType,
    dateRange: DateRange
) async throws -> Report {
    let body: [String: Any] = [
        "type": type.rawValue,
        "startDate": ISO8601DateFormatter().string(from: dateRange.start),
        "endDate": ISO8601DateFormatter().string(from: dateRange.end)
    ]
    
    var request = try runtime.request(path: "/api/v1/reports")
    request.httpMethod = "POST"
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    request = try await validator.signRequest(request)
    
    return try await http.perform(request)
}

enum ReportType: String {
    case approvals, campaigns, analytics, audit
}

struct DateRange {
    let start: Date
    let end: Date
}
```

## Error Handling

### HTTP Error Codes

**Status Code Handling**:

```swift
switch statusCode {
case 200...299:
    // Success - decode response
case 400:
    // Bad request - client error in request
case 401:
    // Unauthorized - authentication required
case 403:
    // Forbidden - authenticated but no permission
case 404:
    // Not found - resource doesn't exist
case 429:
    // Rate limited - too many requests
case 500...599:
    // Server error - server failed
default:
    // Unknown - unexpected status
}
```

### Custom Error Types

```swift
enum APIError: LocalizedError {
    case networkError(URLError)
    case invalidURL
    case invalidResponse
    case decodingError(DecodingError)
    case httpError(Int, String?)
    case rateLimited(retryAfter: Int?)
    case authentication(reason: String)
    case serverError(code: String)
    
    var errorDescription: String? {
        switch self {
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .rateLimited(let retryAfter):
            if let seconds = retryAfter {
                return "Too many requests. Try again in \(seconds) seconds."
            }
            return "Too many requests. Try again later."
        case .authentication(let reason):
            return "Authentication failed: \(reason)"
        case .serverError(let code):
            return "Server error: \(code)"
        default:
            return "An error occurred"
        }
    }
}
```

### Recovery Strategies

**Automatic Retry with Backoff**:

```swift
// Retry with exponential backoff
func performWithRetry<T>(
    operation: () async throws -> T,
    maxAttempts: Int = 3
) async throws -> T {
    var lastError: Error?
    
    for attempt in 1...maxAttempts {
        do {
            return try await operation()
        } catch let error as NetworkError {
            if case .rateLimited = error, attempt < maxAttempts {
                // Exponential backoff: 1s, 2s, 4s
                let delay = UInt64(pow(2.0, Double(attempt - 1))) * 1_000_000_000
                try await Task.sleep(nanoseconds: delay)
                lastError = error
                continue
            }
            throw error
        } catch {
            throw error
        }
    }
    
    throw lastError ?? NetworkError.unknownError(0)
}

// Usage
let approvals = try await performWithRetry {
    try await http.fetchApprovals()
}
```

### Retry Logic

```swift
// Determine if error is retryable
func isRetryable(_ error: Error) -> Bool {
    if let networkError = error as? NetworkError {
        switch networkError {
        case .rateLimited:
            return true
        case .serverError(let code) where code >= 500:
            return true  // 5xx errors are temporary
        default:
            return false
        }
    }
    
    if let urlError = error as? URLError {
        switch urlError.code {
        case .networkConnectionLost, .notConnectedToInternet, .timedOut:
            return true
        default:
            return false
        }
    }
    
    return false
}
```

## Rate Limiting

### Rate Limit Headers

**Response Headers**:

```bash
# Standard rate limit headers
X-RateLimit-Limit: 100           # Max requests per window
X-RateLimit-Remaining: 75        # Remaining in window
X-RateLimit-Reset: 1677923200    # Unix timestamp when limit resets
```

**Parsing Headers**:

```swift
func parseRateLimitHeaders(_ response: HTTPURLResponse) -> RateLimit? {
    guard let limit = response.value(forHTTPHeaderField: "X-RateLimit-Limit"),
          let remaining = response.value(forHTTPHeaderField: "X-RateLimit-Remaining"),
          let reset = response.value(forHTTPHeaderField: "X-RateLimit-Reset") else {
        return nil
    }
    
    return RateLimit(
        limit: Int(limit) ?? 0,
        remaining: Int(remaining) ?? 0,
        resetTime: Date(timeIntervalSince1970: TimeInterval(reset) ?? 0)
    )
}

struct RateLimit {
    let limit: Int
    let remaining: Int
    let resetTime: Date
}
```

### Backoff Strategies

**Exponential Backoff**:

```swift
func exponentialBackoff(attempt: Int, maxDelay: TimeInterval = 60) -> TimeInterval {
    let baseDelay = 1.0
    let delay = baseDelay * pow(2.0, Double(attempt - 1))
    return min(delay, maxDelay)
}

// Usage
for attempt in 1...3 {
    do {
        return try await makeRequest()
    } catch let error as NetworkError {
        if case .rateLimited = error {
            let delay = exponentialBackoff(attempt: attempt)
            try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            continue
        }
        throw error
    }
}
```

### Queue Management

**Request Queue**:

```swift
actor RequestQueue {
    private var pendingRequests: [() async throws -> Void] = []
    private var isProcessing = false
    
    @MainActor
    func enqueue(_ request: @escaping () async throws -> Void) {
        pendingRequests.append(request)
        if !isProcessing {
            processQueue()
        }
    }
    
    private func processQueue() {
        Task {
            isProcessing = true
            while !pendingRequests.isEmpty {
                let request = pendingRequests.removeFirst()
                do {
                    try await request()
                } catch {
                    print("Request failed: \(error)")
                }
                // Add delay between requests
                try await Task.sleep(nanoseconds: 100_000_000)  // 100ms
            }
            isProcessing = false
        }
    }
}
```

## Security

### Certificate Pinning

**Implementation in API Client**:

```swift
// Configure certificate pinning
let certificatePinning = CertificatePinning(
    pinnedHashes: [
        "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",  // Production
        "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="   // Backup
    ]
)

// Add to URLSessionDelegate
class PinningDelegate: NSObject, URLSessionDelegate {
    let pinning: CertificatePinning
    
    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        do {
            try pinning.validate(challenge: challenge)
            completionHandler(.useCredential, challenge.protectionSpace.serverTrust.map(URLCredential.init))
        } catch {
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }
}
```

### Request Signing

**Implement HMAC-SHA256 Signing**:

```swift
// See APIRequestValidator implementation for full details
let validator = APIRequestValidator(secretKeyHex: operatorKey)
var request = try runtime.request(path: "/approvals")
request = try await validator.signRequest(request)
// Headers added: X-Timestamp, X-Nonce, X-Signature
```

### TLS Requirements

**Enforce TLS 1.3+**:

```swift
var config = URLSessionConfiguration.default
config.tlsMinimumSupportedProtocolVersion = .TLSv13
config.tlsMaximumSupportedProtocolVersion = .TLSv13

let session = URLSession(configuration: config)
```

## Testing with Mocks

### Mock API Setup

```swift
// Mock HTTP client for testing
class MockHTTPClient: HTTPClientProtocol {
    var stubbedApprovals: [Approval]?
    var stubbedError: Error?
    
    func fetchApprovals() async throws -> [Approval] {
        if let error = stubbedError {
            throw error
        }
        return stubbedApprovals ?? []
    }
}

// Usage in tests
func testFetchApprovals() async {
    let mock = MockHTTPClient()
    mock.stubbedApprovals = [
        Approval(id: "1", title: "Test", status: .pending, ...)
    ]
    
    let store = OperatorShellStore(http: mock)
    await store.loadApprovals()
    
    XCTAssertEqual(store.approvals.count, 1)
}
```

### Response Injection

```swift
// Inject test responses from fixtures
func loadTestFixture(_ name: String) -> Data {
    let bundle = Bundle(for: type(of: self))
    guard let url = bundle.url(forResource: name, withExtension: "json") else {
        fatalError("Fixture not found: \(name)")
    }
    return try! Data(contentsOf: url)
}

// Usage
let fixtureData = loadTestFixture("approvals-response")
mock.stubbedResponse = try JSONDecoder().decode([Approval].self, from: fixtureData)
```

### Error Simulation

```swift
// Simulate API errors in tests
mock.stubbedError = APIError.rateLimited(retryAfter: 60)
// Test retry logic...

mock.stubbedError = APIError.authentication(reason: "Invalid token")
// Test error handling...
```

## API Versioning

### Version Negotiation

**API Version Header**:

```swift
// Specify API version in request
var request = try runtime.request(path: "/approvals")
request.addValue("v1", forHTTPHeaderField: "X-API-Version")
request.addValue("application/json", forHTTPHeaderField: "Accept")
```

### Backward Compatibility

**Handle Multiple Versions**:

```swift
// Decode with version-specific fields
struct ApprovalV1: Decodable {
    let id: String
    let status: String
}

struct ApprovalV2: Decodable {
    let id: String
    let status: String
    let priority: String?  // New in v2
}

// Try decoding new version first, fallback to old
func decodeApproval(from data: Data) throws -> any Decodable {
    do {
        return try JSONDecoder().decode(ApprovalV2.self, from: data)
    } catch {
        return try JSONDecoder().decode(ApprovalV1.self, from: data)
    }
}
```

### Migration Procedures

**Migrate to New API Version**:

```bash
# 1. Update endpoint paths
# /api/v1/approvals → /api/v2/approvals

# 2. Update request/response models
# Add new fields, deprecate old ones

# 3. Update client code
swift package update

# 4. Test backward compatibility
swift test

# 5. Release with deprecation notice
# Announce v1 will be removed in X months
```

---

This API integration guide covers everything needed to work with the BlackBolt Operator API. For security details, see SWIFT_SECURITY_GUIDE.md. For troubleshooting, see SWIFT_TROUBLESHOOTING.md.
