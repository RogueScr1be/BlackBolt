import Foundation
import CryptoKit

@testable import BlackBoltOperator

// MARK: - Test Data Fixtures

enum TestFixtures {
    // MARK: - API Response Fixtures

    static let sampleImportStatusResponse = """
    {
        "importId": "import-123",
        "status": "processing",
        "totalRows": 1000,
        "processedRows": 500,
        "succeededRows": 480,
        "failedRows": 20,
        "duplicateRows": 0
    }
    """

    static let sampleCustomerSegmentResponse = """
    {
        "tenantId": "tenant-1",
        "total": 5000,
        "items": [
            {"segment": "premium", "count": 1500},
            {"segment": "standard", "count": 3000},
            {"segment": "trial", "count": 500}
        ]
    }
    """

    static let sampleRevenueImportResponse = """
    {
        "revenueImportId": "rev-import-456",
        "status": "completed",
        "totalRows": 500,
        "processedRows": 500,
        "succeededRows": 495,
        "failedRows": 5,
        "duplicateRows": 0,
        "createdAt": "2024-03-03T10:00:00Z",
        "finishedAt": "2024-03-03T10:05:00Z"
    }
    """

    static let sampleErrorResponse = """
    {
        "code": "invalid_request",
        "message": "Request validation failed"
    }
    """

    static let sampleUnauthorizedResponse = """
    {
        "code": "unauthorized",
        "message": "Invalid authentication token"
    }
    """

    static let sampleForbiddenResponse = """
    {
        "code": "forbidden",
        "message": "Insufficient permissions"
    }
    """

    static let sampleServerErrorResponse = """
    {
        "code": "internal_error",
        "message": "Internal server error"
    }
    """

    static let sampleValidationErrorResponse = """
    {
        "code": "validation_error",
        "message": "Validation failed",
        "details": [
            {"field": "email", "error": "Invalid email format"},
            {"field": "age", "error": "Must be greater than 0"}
        ]
    }
    """

    // MARK: - Empty/Edge Case Fixtures

    static let emptyJSONObject = "{}"
    static let emptyJSONArray = "[]"
    static let invalidJSON = "{invalid json"
    static let nullValue = "null"

    // MARK: - JSON Encoding/Decoding

    static func jsonData<T: Encodable>(_ value: T) throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(value)
    }

    static func decodeJSON<T: Decodable>(_ json: String, as type: T.Type) throws -> T {
        guard let data = json.data(using: .utf8) else {
            throw NSError(domain: "TestData", code: -1, userInfo: nil)
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(type, from: data)
    }

    // MARK: - Data Generation

    static func randomJSONString(size: Int = 1024) -> String {
        let randomData = (0..<size).map { _ in String(UInt8.random(in: 65...90)) }.joined()
        return """
        {
            "id": "\(UUID().uuidString)",
            "timestamp": \(Date().timeIntervalSince1970),
            "data": "\(randomData)"
        }
        """
    }

    static func largeJSONArray(size: Int = 100) -> String {
        let items = (0..<size).map { i in
            """
            {"id": "\(i)", "name": "Item \(i)", "value": \(i * 100)}
            """
        }.joined(separator: ",")
        return "[\(items)]"
    }
}

// MARK: - Model Factory Functions

enum ModelFactory {
    // MARK: - Error Creation

    static func makeOperatorAppError(
        code: String = "test_error",
        message: String = "Test error message",
        httpStatus: Int? = 400,
        path: String? = "/api/test"
    ) -> OperatorAppError {
        OperatorAppError(
            code: code,
            message: message,
            httpStatus: httpStatus,
            path: path
        )
    }

    static func makeNetworkError() -> OperatorAppError {
        OperatorAppError(
            code: "network_unavailable",
            message: "Network connection unavailable",
            httpStatus: nil,
            path: nil
        )
    }

    static func makeTimeoutError() -> OperatorAppError {
        OperatorAppError(
            code: "request_timeout",
            message: "Request exceeded maximum timeout",
            httpStatus: nil,
            path: nil
        )
    }

    static func makeCertificateError() -> OperatorAppError {
        OperatorAppError(
            code: "certificate_validation_failed",
            message: "Certificate validation failed",
            httpStatus: nil,
            path: nil
        )
    }

    static func makeAuthenticationError() -> OperatorAppError {
        OperatorAppError(
            code: "authentication_failed",
            message: "Authentication failed",
            httpStatus: 401,
            path: "/auth"
        )
    }

    static func makeAuthorizationError() -> OperatorAppError {
        OperatorAppError(
            code: "forbidden",
            message: "Access denied",
            httpStatus: 403,
            path: nil
        )
    }

    static func makeNotFoundError() -> OperatorAppError {
        OperatorAppError(
            code: "not_found",
            message: "Resource not found",
            httpStatus: 404,
            path: nil
        )
    }

    static func makeConflictError() -> OperatorAppError {
        OperatorAppError(
            code: "conflict",
            message: "Resource conflict",
            httpStatus: 409,
            path: nil
        )
    }

    static func makeRateLimitError() -> OperatorAppError {
        OperatorAppError(
            code: "rate_limited",
            message: "Too many requests",
            httpStatus: 429,
            path: nil
        )
    }

    static func makeInternalServerError() -> OperatorAppError {
        OperatorAppError(
            code: "internal_error",
            message: "Internal server error",
            httpStatus: 500,
            path: nil
        )
    }

    static func makeImportStatusRow(
        importId: String = "import-123",
        status: String = "processing",
        totalRows: Int = 1000,
        processedRows: Int = 250,
        succeededRows: Int = 200,
        failedRows: Int = 25,
        duplicateRows: Int = 25
    ) -> ImportStatusRow {
        ImportStatusRow(
            importId: importId,
            status: status,
            totalRows: totalRows,
            processedRows: processedRows,
            succeededRows: succeededRows,
            failedRows: failedRows,
            duplicateRows: duplicateRows
        )
    }

    static func makeCustomerSegmentItem(
        segment: String = "premium",
        count: Int = 150
    ) -> CustomerSegmentItem {
        CustomerSegmentItem(segment: segment, count: count)
    }

    static func makeRevenueImportError(
        rowNum: Int = 1,
        code: String = "invalid_row",
        message: String = "Row failed validation"
    ) -> RevenueImportError {
        RevenueImportError(rowNum: rowNum, code: code, message: message)
    }

    static func makeCreateRevenueImportResponse(
        revenueImportId: String = "rev-import-123",
        status: String = "queued"
    ) -> CreateRevenueImportResponse {
        CreateRevenueImportResponse(revenueImportId: revenueImportId, status: status)
    }

    static func makeRevenueImportListItem(
        revenueImportId: String = "rev-import-123",
        tenantId: String = "tenant-123",
        status: String = "completed",
        totalRows: Int = 1000,
        processedRows: Int = 1000,
        succeededRows: Int = 950,
        failedRows: Int = 25,
        duplicateRows: Int = 25,
        createdAt: String = "2026-03-16T00:00:00Z",
        finishedAt: String? = "2026-03-16T00:05:00Z"
    ) -> RevenueImportListItem {
        RevenueImportListItem(
            revenueImportId: revenueImportId,
            tenantId: tenantId,
            status: status,
            totalRows: totalRows,
            processedRows: processedRows,
            succeededRows: succeededRows,
            failedRows: failedRows,
            duplicateRows: duplicateRows,
            createdAt: createdAt,
            finishedAt: finishedAt
        )
    }

    // MARK: - Configuration Creation

    @MainActor
    static func makeOperatorRuntimeConfig(
        apiBaseURL: String = "https://api.test.example.com",
        tenantId: String = "test-tenant-id",
        authHeader: String = "Bearer test-auth-token",
        operatorKey: String = "test-operator-key-123456789"
    ) -> OperatorRuntimeConfig {
        let defaults = UserDefaults(suiteName: "TestConfig-\(UUID().uuidString)")!
        let config = OperatorRuntimeConfig(defaults: defaults)
        config.apiBaseURL = apiBaseURL
        config.tenantId = tenantId
        config.authHeader = authHeader
        config.operatorKey = operatorKey
        return config
    }

    @MainActor
    static func makeInvalidConfig() -> OperatorRuntimeConfig {
        let defaults = UserDefaults(suiteName: "TestConfig-Invalid-\(UUID().uuidString)")!
        let config = OperatorRuntimeConfig(defaults: defaults)
        // Leave all values unset
        return config
    }

    @MainActor
    static func makePartialConfig() -> OperatorRuntimeConfig {
        let defaults = UserDefaults(suiteName: "TestConfig-Partial-\(UUID().uuidString)")!
        let config = OperatorRuntimeConfig(defaults: defaults)
        config.apiBaseURL = "https://api.example.com"
        // Missing other required fields
        return config
    }

    // MARK: - Cryptographic Data

    static func makeValidHMACSHA256Signature(
        data: Data,
        key: Data
    ) -> String {
        let signature = HMAC<SHA256>.authenticationCode(for: data, using: SymmetricKey(data: key))
        return Data(signature).map { String(format: "%02hhx", $0) }.joined()
    }

    static func makeSHA256Hash(of data: Data) -> String {
        let digest = SHA256.hash(data: data)
        return digest.map { String(format: "%02hhx", $0) }.joined()
    }

    static func makeRandomEncryptionKey() -> SymmetricKey {
        SymmetricKey(size: .bits256)
    }

    // MARK: - Request/Response Data

    static func makeValidJSONRequest() -> Data {
        let json: [String: Any] = [
            "method": "GET",
            "path": "/api/test",
            "headers": ["Content-Type": "application/json"],
            "timestamp": Date().timeIntervalSince1970
        ]
        return try! JSONSerialization.data(withJSONObject: json)
    }

    static func makeValidJSONResponse() -> Data {
        let json: [String: Any] = [
            "status": "success",
            "data": ["id": "test-123", "name": "Test Data"],
            "timestamp": Date().timeIntervalSince1970
        ]
        return try! JSONSerialization.data(withJSONObject: json)
    }

    static func makeErrorJSONResponse(
        code: String = "error",
        message: String = "An error occurred"
    ) -> Data {
        let json: [String: Any] = [
            "code": code,
            "message": message,
            "timestamp": Date().timeIntervalSince1970
        ]
        return try! JSONSerialization.data(withJSONObject: json)
    }

    // MARK: - Credential Data

    static func makeValidCredential(
        username: String = "testuser",
        password: String = "testpassword123"
    ) -> Data {
        let json: [String: Any] = [
            "username": username,
            "password": password,
            "createdAt": Date().timeIntervalSince1970
        ]
        return try! JSONSerialization.data(withJSONObject: json)
    }

    static func makeExpiredCredential() -> Data {
        let json: [String: Any] = [
            "username": "testuser",
            "password": "testpassword123",
            "expiresAt": Date().timeIntervalSince1970 - 3600 // 1 hour ago
        ]
        return try! JSONSerialization.data(withJSONObject: json)
    }

    // MARK: - Certificate Data

    static func makeSelfSignedCertificateData() -> Data {
        // Placeholder for self-signed certificate
        // In real tests, this would be a valid DER-encoded certificate
        return Data()
    }

    // MARK: - Token Data

    static func makeValidAuthToken() -> String {
        return "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlRlc3QgVXNlciIsImlhdCI6MTUxNjIzOTAyMn0.signature"
    }

    static func makeExpiredAuthToken() -> String {
        return "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlRlc3QgVXNlciIsImV4cCI6MX0.signature"
    }

    static func makeInvalidAuthToken() -> String {
        return "Bearer invalid_token_string"
    }

    static func makeRandomToken(length: Int = 32) -> String {
        let characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        return String((0..<length).map { _ in characters.randomElement()! })
    }
}

// MARK: - Test Data Builders

struct TestDataBuilder {
    var items: [String: Any] = [:]

    mutating func add(_ key: String, _ value: Any) -> Self {
        items[key] = value
        return self
    }

    mutating func addTimestamp() -> Self {
        items["timestamp"] = Date().timeIntervalSince1970
        return self
    }

    mutating func addId() -> Self {
        items["id"] = UUID().uuidString
        return self
    }

    func build() throws -> Data {
        try JSONSerialization.data(withJSONObject: items)
    }

    func buildString() throws -> String {
        let data = try build()
        return String(data: data, encoding: .utf8) ?? ""
    }
}

// MARK: - Batch Data Generators

enum BatchDataGenerator {
    static func generateManyCredentials(count: Int) -> [(account: String, password: Data)] {
        (0..<count).map { i in
            let account = "user-\(i)"
            let json: [String: Any] = [
                "username": account,
                "password": "password-\(i)",
                "createdAt": Date().timeIntervalSince1970
            ]
            let password = try! JSONSerialization.data(withJSONObject: json)
            return (account, password)
        }
    }

    static func generateManyRequests(count: Int, baseURL: String = "https://api.example.com") -> [URLRequest] {
        (0..<count).map { i in
            var request = URLRequest(url: URL(string: "\(baseURL)/endpoint-\(i)")!)
            request.httpMethod = i % 3 == 0 ? "POST" : i % 2 == 0 ? "PUT" : "GET"
            request.setValue("Bearer token-\(i)", forHTTPHeaderField: "Authorization")
            return request
        }
    }

    static func generateManyResponses(count: Int) -> [MockHTTPResponse] {
        (0..<count).map { i in
            let json: [String: Any] = [
                "id": "\(i)",
                "status": "success",
                "data": "Response \(i)"
            ]
            let data = try! JSONSerialization.data(withJSONObject: json)
            return MockHTTPResponse(data: data, statusCode: 200)
        }
    }
}

// MARK: - Performance Test Data

enum PerformanceTestData {
    static func largeDataset(itemCount: Int = 10000) -> Data {
        var items: [[String: Any]] = []
        for i in 0..<itemCount {
            items.append([
                "id": i,
                "name": "Item \(i)",
                "value": Double(i) * 1.5,
                "timestamp": Date().timeIntervalSince1970
            ])
        }
        return try! JSONSerialization.data(withJSONObject: items)
    }

    static func largeString(sizeInKB: Int = 1024) -> String {
        let baseString = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. "
        let repetitions = (sizeInKB * 1024) / baseString.count
        return String(repeating: baseString, count: repetitions)
    }

    static func deepJSON(depth: Int = 100) -> String {
        var json = ""
        for _ in 0..<depth {
            json += "{\"nested\":"
        }
        json += "\"value\""
        for _ in 0..<depth {
            json += "}"
        }
        return json
    }
}
