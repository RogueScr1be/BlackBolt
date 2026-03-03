# Swift Coding Standards for BlackBolt

This document defines the coding standards, naming conventions, and best practices for the BlackBolt Operator Swift application.

## Table of Contents

1. [Naming Conventions](#naming-conventions)
2. [Code Organization](#code-organization)
3. [Documentation Requirements](#documentation-requirements)
4. [Security Requirements](#security-requirements)
5. [Error Handling](#error-handling)
6. [Performance Guidelines](#performance-guidelines)
7. [Testing Standards](#testing-standards)
8. [Common Patterns](#common-patterns)

## Naming Conventions

### Classes, Structs, and Enums (PascalCase)

```swift
// Correct
class APIClient { }
struct NetworkRequest { }
enum AuthenticationError { }

// Incorrect
class api_client { }
struct networkRequest { }
enum authentication_error { }
```

### Functions, Methods, and Variables (camelCase)

```swift
// Correct
func fetchUserData() { }
var userName: String = ""
let apiEndpoint: URL

// Incorrect
func fetchUserData() { }  // Wrong case
var user_name: String = ""
let API_ENDPOINT: URL
```

### Constants (Context Dependent)

```swift
// Compile-time constants: SCREAMING_SNAKE_CASE
let MAX_RETRY_ATTEMPTS = 3
let DEFAULT_TIMEOUT_SECONDS = 30

// Runtime constants: camelCase (like variables)
let defaultUserTimeout = TimeInterval(30)
let maxConnectionAttempts = 5
```

### Protocol Names

```swift
// Use suffix "Protocol" for clarity or "-able"/"-ible" for capability protocols
protocol AuthenticationProtocol { }
protocol Codable { }  // Standard library convention
protocol DataPersistable { }
```

### Enum Cases (camelCase)

```swift
// Correct
enum HTTPMethod {
  case get
  case post
  case put
  case delete
}

// Incorrect
enum HTTPMethod {
  case GET
  case POST
}
```

## Code Organization

### File Structure

```swift
// 1. File header comment
// 2. Import statements (organized alphabetically)
import Foundation
import Combine

// 3. Type definition
class APIClient {
  // MARK: - Type Properties
  static let shared = APIClient()

  // MARK: - Properties
  private let session: URLSession

  // MARK: - Initialization
  init(session: URLSession = .shared) {
    self.session = session
  }

  // MARK: - Public Methods
  func fetchData(from url: URL) async throws -> Data {
    // Implementation
  }

  // MARK: - Private Methods
  private func validateURL(_ url: URL) -> Bool {
    // Implementation
  }
}
```

### Access Control

Use explicit access modifiers:

```swift
// Correct
public class PublicAPI { }
internal class InternalService { }
private class PrivateHelper { }

// Avoid relying on implicit internal
class ImplicitInternal { }  // Implicit - not recommended
```

### Nesting Depth

- Maximum nesting level: 2 for types, 2 for functions
- Extract complex nested logic into separate functions

```swift
// Correct
func processData(_ data: [Int]) -> [Int] {
  return data
    .filter { isValid($0) }
    .map { transform($0) }
}

// Avoid excessive nesting
func processData(_ data: [Int]) -> [Int] {
  var result: [Int] = []
  for item in data {
    if isValid(item) {
      if let transformed = transform(item) {
        if shouldInclude(transformed) {
          result.append(transformed)  // 3 levels deep
        }
      }
    }
  }
  return result
}
```

## Documentation Requirements

### Public APIs (Required)

All public types, methods, and properties must have documentation:

```swift
/// Fetches user data from the API.
///
/// - Parameters:
///   - userID: The unique identifier for the user
///   - completion: Closure called when the request completes
/// - Returns: A URLSessionTask that can be cancelled
/// - Throws: `APIError.invalidResponse` if the response is malformed
///
/// Example usage:
/// ```swift
/// let client = APIClient()
/// client.fetchUser(id: 123) { result in
///   switch result {
///   case .success(let user):
///     print("User: \(user.name)")
///   case .failure(let error):
///     print("Error: \(error)")
///   }
/// }
/// ```
public func fetchUser(userID: Int, completion: @escaping (Result<User, APIError>) -> Void) -> URLSessionTask {
  // Implementation
}
```

### Internal APIs (Recommended)

Document complex logic and non-obvious behavior:

```swift
/// Validates the provided authentication token against the issuer's public key.
/// This operation is expensive and should be cached when possible.
internal func validateToken(_ token: String) throws -> TokenClaims {
  // Implementation
}
```

### Comment Guidelines

- Use `///` for documentation comments
- Use `//` for code comments
- Keep comments concise and focused
- Explain "why" not "what" the code does

```swift
// Good: Explains the reasoning
// Retry with exponential backoff to handle transient network failures
let delaySeconds = pow(2.0, Double(attemptNumber))

// Poor: States the obvious
// Set delay to power of 2
let delaySeconds = pow(2.0, Double(attemptNumber))
```

## Security Requirements

### 1. Never Hardcode Credentials

```swift
// Incorrect - FORBIDDEN
let apiKey = "sk-1234567890abcdef"
let password = "MySecretPassword123"

// Correct - Use environment or configuration
let apiKey = Configuration.apiKey
let password = try Keychain.retrieve(for: "app_password")
```

### 2. Validate All Input

```swift
func processUserEmail(_ email: String) throws -> Email {
  // Validate format
  guard email.contains("@") && email.contains(".") else {
    throw ValidationError.invalidEmail
  }

  // Validate length
  guard email.count <= 254 else {
    throw ValidationError.emailTooLong
  }

  return Email(email)
}
```

### 3. Use Keychain for Secrets

```swift
// Storing
try Keychain.store("my_secret_token", for: "app_api_token")

// Retrieving
let token = try Keychain.retrieve(for: "app_api_token")
```

### 4. Implement Error Handling

```swift
func fetchSecureData() async throws -> Data {
  do {
    let request = URLRequest(url: secureURL)
    let (data, response) = try await URLSession.shared.data(for: request)

    guard let httpResponse = response as? HTTPURLResponse else {
      throw NetworkError.invalidResponse
    }

    guard (200...299).contains(httpResponse.statusCode) else {
      throw NetworkError.statusCode(httpResponse.statusCode)
    }

    return data
  } catch {
    // Log error securely (don't log sensitive data)
    logger.error("Failed to fetch secure data: \(error.localizedDescription)")
    throw NetworkError.fetchFailed
  }
}
```

### 5. Avoid Force Unwrapping

```swift
// Incorrect
let value = optionalValue!  // Dangerous

// Correct - Use guard or optional chaining
guard let value = optionalValue else {
  throw ValidationError.missingValue
}

// Or optional chaining
let result = optionalValue?.processedValue ?? defaultValue
```

### 6. No Implicitly Unwrapped Optionals

```swift
// Incorrect
var unsafeString: String! = "value"

// Correct
var safeString: String = "value"
var optionalString: String? = nil
```

## Error Handling

### Define Clear Error Types

```swift
enum NetworkError: LocalizedError {
  case invalidURL
  case requestFailed(URLError)
  case statusCode(Int)
  case invalidResponse
  case decodingFailed(DecodingError)

  var errorDescription: String? {
    switch self {
    case .invalidURL:
      return "The provided URL is invalid"
    case .requestFailed(let error):
      return "Network request failed: \(error.localizedDescription)"
    case .statusCode(let code):
      return "Server returned status code: \(code)"
    case .invalidResponse:
      return "The server response was invalid"
    case .decodingFailed(let error):
      return "Failed to decode response: \(error.localizedDescription)"
    }
  }
}
```

### Use Result Type

```swift
// Good: Explicit about success/failure
func fetchUser(completion: @escaping (Result<User, NetworkError>) -> Void) {
  // Implementation
}

// Async/await preferred
func fetchUser() async throws -> User {
  // Implementation
}
```

## Performance Guidelines

### Avoid Unnecessary Copies

```swift
// Correct: Use references where appropriate
class DataCache {
  private var cachedData: [String: Data] = [:]
}

// Incorrect: Unnecessary copying
struct DataCache {
  private var cachedData: [String: Data] = [:]  // Copies on mutation
}
```

### Use Lazy Initialization

```swift
lazy var expensiveResource: SomeClass = {
  return SomeClass()
}()
```

### Optimize Loops

```swift
// Correct: Simple, readable
let filtered = data.filter { $0.isValid }

// Avoid: Unnecessary intermediate arrays
var filtered: [Item] = []
for item in data {
  if item.isValid {
    filtered.append(item)
  }
}
```

### Memory Management

```swift
// Use weak references in closures to avoid retain cycles
let task = fetchData { [weak self] result in
  self?.handleResult(result)
}
```

## Testing Standards

### Test Organization

```swift
class UserAPIClientTests: XCTestCase {
  // MARK: - Properties
  var sut: UserAPIClient!  // System Under Test
  var mockSession: URLSession!

  // MARK: - Setup and Teardown
  override func setUp() {
    super.setUp()
    mockSession = createMockSession()
    sut = UserAPIClient(session: mockSession)
  }

  override func tearDown() {
    sut = nil
    mockSession = nil
    super.tearDown()
  }

  // MARK: - Tests
  func testFetchUserSuccess() {
    // Given
    let expectedUser = User(id: 1, name: "John")

    // When
    let result = sut.fetchUser(id: 1)

    // Then
    XCTAssertEqual(result, expectedUser)
  }
}
```

### Test Naming Convention

```swift
// Format: test<UnitUnderTest>_<Scenario>_<ExpectedResult>
func testFetchUser_WithValidID_ReturnsUser() { }
func testFetchUser_WithInvalidID_ThrowsError() { }
func testValidateEmail_WithEmptyString_ReturnsFalse() { }
```

## Common Patterns

### MVVM Architecture

```swift
// ViewModel handles business logic
class UserListViewModel: ObservableObject {
  @Published var users: [User] = []
  @Published var isLoading: Bool = false
  @Published var error: Error?

  private let apiClient: APIClient

  func loadUsers() async {
    isLoading = true
    defer { isLoading = false }

    do {
      users = try await apiClient.fetchUsers()
    } catch {
      self.error = error
    }
  }
}

// View displays data
struct UserListView: View {
  @StateObject var viewModel = UserListViewModel()

  var body: some View {
    List(viewModel.users) { user in
      Text(user.name)
    }
    .task {
      await viewModel.loadUsers()
    }
  }
}
```

### Dependency Injection

```swift
class AuthService {
  private let apiClient: APIClient
  private let keychainManager: KeychainManager

  init(
    apiClient: APIClient = APIClient(),
    keychainManager: KeychainManager = KeychainManager()
  ) {
    self.apiClient = apiClient
    self.keychainManager = keychainManager
  }
}
```

### Builder Pattern

```swift
class RequestBuilder {
  private var url: URL?
  private var headers: [String: String] = [:]
  private var body: Data?

  func withURL(_ url: URL) -> Self {
    self.url = url
    return self
  }

  func withHeader(_ value: String, forKey key: String) -> Self {
    headers[key] = value
    return self
  }

  func build() throws -> URLRequest {
    guard let url = url else { throw BuildError.missingURL }
    var request = URLRequest(url: url)
    request.allHTTPHeaderFields = headers
    request.httpBody = body
    return request
  }
}
```

## Code Review Checklist

Before submitting code for review, ensure:

- [ ] All public APIs are documented with `///` comments
- [ ] No hardcoded credentials or secrets
- [ ] No force unwraps (!) except in safe contexts
- [ ] No implicitly unwrapped optionals (!)
- [ ] Error handling is comprehensive
- [ ] Variable and function names follow conventions
- [ ] Cyclomatic complexity is kept under 10
- [ ] Line length does not exceed 120 characters
- [ ] All tests pass locally
- [ ] SwiftLint and SwiftFormat pass
