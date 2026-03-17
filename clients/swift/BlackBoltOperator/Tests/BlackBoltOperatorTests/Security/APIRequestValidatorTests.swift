import CryptoKit
import XCTest

@testable import BlackBoltOperator

final class APIRequestValidatorTests: XCTestCase {
    private let signingKey = SymmetricKey(data: Data("test-signing-key-32-characters".utf8))

    func testHexInitializerRejectsInvalidKey() {
        XCTAssertNil(APIRequestValidator(secretKeyHex: "not-hex"))
    }

    func testSignRequestAddsRequiredHeadersAndPreservesExistingHeaders() async throws {
        let validator = APIRequestValidator(secretKey: signingKey)
        var request = URLRequest(url: URL(string: "https://api.example.com/test")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data("payload".utf8)

        let signedRequest = try await validator.signRequest(request)

        XCTAssertNotNil(signedRequest.value(forHTTPHeaderField: "X-Signature"))
        XCTAssertNotNil(signedRequest.value(forHTTPHeaderField: "X-Timestamp"))
        XCTAssertNotNil(signedRequest.value(forHTTPHeaderField: "X-Nonce"))
        XCTAssertEqual(signedRequest.value(forHTTPHeaderField: "Content-Type"), "application/json")
    }

    func testValidateRequestAcceptsFreshSignedRequest() async throws {
        let validator = APIRequestValidator(secretKey: signingKey)
        var request = URLRequest(url: URL(string: "https://api.example.com/test")!)
        request.httpMethod = "POST"
        request.httpBody = Data("payload".utf8)

        let signedRequest = try await validator.signRequest(request)

        let isValid = try await validator.validateRequest(signedRequest)
        XCTAssertTrue(isValid)
    }

    func testValidateRequestRejectsMissingSignatureHeader() async throws {
        let validator = APIRequestValidator(secretKey: signingKey)
        let request = URLRequest(url: URL(string: "https://api.example.com/test")!)

        do {
            _ = try await validator.validateRequest(request)
            XCTFail("Expected missing signature failure")
        } catch let error as APIRequestValidationError {
            XCTAssertEqual(error, .missingRequiredHeader("X-Signature"))
        }
    }

    func testValidateRequestRejectsMutatedBody() async throws {
        let validator = APIRequestValidator(secretKey: signingKey)
        var request = URLRequest(url: URL(string: "https://api.example.com/test")!)
        request.httpMethod = "POST"
        request.httpBody = Data("original".utf8)

        var signedRequest = try await validator.signRequest(request)
        signedRequest.httpBody = Data("mutated".utf8)

        do {
            _ = try await validator.validateRequest(signedRequest)
            XCTFail("Expected invalid signature failure")
        } catch let error as APIRequestValidationError {
            XCTAssertEqual(error, .invalidSignature)
        }
    }

    func testValidateRequestRejectsReplayNonce() async throws {
        let validator = APIRequestValidator(secretKey: signingKey)
        var request = URLRequest(url: URL(string: "https://api.example.com/test")!)
        request.httpMethod = "POST"
        request.httpBody = Data("payload".utf8)

        let signedRequest = try await validator.signRequest(request)

        let isValid = try await validator.validateRequest(signedRequest)
        XCTAssertTrue(isValid)

        do {
            _ = try await validator.validateRequest(signedRequest)
            XCTFail("Expected replay nonce failure")
        } catch let error as APIRequestValidationError {
            XCTAssertEqual(error, .invalidNonce)
        }
    }

    func testValidateRequestRejectsExpiredTimestamp() async throws {
        let validator = APIRequestValidator(secretKey: signingKey, timestampTolerance: 0.5)
        let request = URLRequest(url: URL(string: "https://api.example.com/test")!)
        let signedRequest = try await validator.signRequest(request)

        try await Task.sleep(nanoseconds: 1_000_000_000)

        do {
            _ = try await validator.validateRequest(signedRequest)
            XCTFail("Expected expired timestamp failure")
        } catch let error as APIRequestValidationError {
            XCTAssertEqual(error, .timestampExpired)
        }
    }
}
