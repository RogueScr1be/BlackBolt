import XCTest

@testable import BlackBoltOperator

final class HTTPErrorHandlingTests: XCTestCase {
    // MARK: - HTTP Status Code Error Mapping Tests

    func testMap400BadRequest() {
        let error = OperatorAppError(
            code: "bad_request",
            message: "Bad request",
            httpStatus: 400,
            path: "/api/test"
        )

        XCTAssertEqual(error.httpStatus, 400)
        XCTAssertEqual(error.code, "bad_request")
    }

    func testMap401Unauthorized() {
        let error = OperatorAppError(
            code: "invalid_operator_key",
            message: "Invalid operator key",
            httpStatus: 401,
            path: "/api/test"
        )

        XCTAssertEqual(error.httpStatus, 401)
    }

    func testMap403Forbidden() {
        let error = OperatorAppError(
            code: "forbidden",
            message: "Access forbidden",
            httpStatus: 403,
            path: "/api/test"
        )

        XCTAssertEqual(error.httpStatus, 403)
    }

    func testMap404NotFound() {
        let error = OperatorAppError(
            code: "not_found",
            message: "Resource not found",
            httpStatus: 404,
            path: "/api/test"
        )

        XCTAssertEqual(error.httpStatus, 404)
    }

    func testMap409Conflict() {
        let error = OperatorAppError(
            code: "conflict",
            message: "Resource conflict",
            httpStatus: 409,
            path: "/api/test"
        )

        XCTAssertEqual(error.httpStatus, 409)
    }

    func testMap429TooManyRequests() {
        let error = OperatorAppError(
            code: "rate_limited",
            message: "Too many requests",
            httpStatus: 429,
            path: "/api/test"
        )

        XCTAssertEqual(error.httpStatus, 429)
    }

    func testMap500InternalServerError() {
        let error = OperatorAppError(
            code: "server_error",
            message: "Internal server error",
            httpStatus: 500,
            path: "/api/test"
        )

        XCTAssertEqual(error.httpStatus, 500)
    }

    func testMap502BadGateway() {
        let error = OperatorAppError(
            code: "bad_gateway",
            message: "Bad gateway",
            httpStatus: 502,
            path: "/api/test"
        )

        XCTAssertEqual(error.httpStatus, 502)
    }

    func testMap503ServiceUnavailable() {
        let error = OperatorAppError(
            code: "service_unavailable",
            message: "Service unavailable",
            httpStatus: 503,
            path: "/api/test"
        )

        XCTAssertEqual(error.httpStatus, 503)
    }

    // MARK: - Network Error Tests

    func testNetworkTimeout() {
        let error = OperatorAppError(
            code: "network_unreachable",
            message: "Request timed out",
            httpStatus: nil,
            path: "/api/test"
        )

        XCTAssertNil(error.httpStatus)
        XCTAssertEqual(error.code, "network_unreachable")
    }

    func testNetworkConnectionLost() {
        let error = OperatorAppError(
            code: "network_unreachable",
            message: "Network connection lost",
            httpStatus: nil,
            path: "/api/test"
        )

        XCTAssertEqual(error.code, "network_unreachable")
    }

    func testNetworkCannotFindHost() {
        let error = OperatorAppError(
            code: "network_unreachable",
            message: "Cannot find host",
            httpStatus: nil,
            path: "/api/test"
        )

        XCTAssertEqual(error.code, "network_unreachable")
    }

    // MARK: - Error Identification Tests

    func testAuthenticationError() {
        let error = OperatorAppError(
            code: "invalid_operator_key",
            message: "Invalid authentication credentials",
            httpStatus: 401,
            path: "/api/test"
        )

        let isAuthError = error.httpStatus == 401
        XCTAssertTrue(isAuthError)
    }

    func testAuthorizationError() {
        let error = OperatorAppError(
            code: "forbidden",
            message: "Not authorized for this resource",
            httpStatus: 403,
            path: "/api/test"
        )

        let isAuthzError = error.httpStatus == 403
        XCTAssertTrue(isAuthzError)
    }

    func testNotFoundError() {
        let error = OperatorAppError(
            code: "not_found",
            message: "Resource does not exist",
            httpStatus: 404,
            path: "/api/test"
        )

        let isNotFoundError = error.httpStatus == 404
        XCTAssertTrue(isNotFoundError)
    }

    func testServerError() {
        let error = OperatorAppError(
            code: "server_error",
            message: "Server encountered an error",
            httpStatus: 500,
            path: "/api/test"
        )

        let isServerError = (500...599).contains(error.httpStatus ?? 0)
        XCTAssertTrue(isServerError)
    }

    // MARK: - Error Message Tests

    func testErrorMessageIsNotEmpty() {
        let error = OperatorAppError(
            code: "test_error",
            message: "This is an error message",
            httpStatus: 400,
            path: "/api/test"
        )

        XCTAssertFalse(error.message.isEmpty)
    }

    func testErrorCodeIsNotEmpty() {
        let error = OperatorAppError(
            code: "error_code",
            message: "Some message",
            httpStatus: 400,
            path: "/api/test"
        )

        XCTAssertFalse(error.code.isEmpty)
    }

    // MARK: - Error Path Tests

    func testErrorIncludesPath() {
        let path = "/api/users/123"
        let error = OperatorAppError(
            code: "test_error",
            message: "Error message",
            httpStatus: 400,
            path: path
        )

        XCTAssertEqual(error.path, path)
    }

    func testErrorWithoutPath() {
        let error = OperatorAppError(
            code: "test_error",
            message: "Error message",
            httpStatus: 400,
            path: nil
        )

        XCTAssertNil(error.path)
    }

    // MARK: - Error Identifier Tests

    func testErrorIDGeneration() {
        let error = OperatorAppError(
            code: "error1",
            message: "Message 1",
            httpStatus: 400,
            path: "/path1"
        )

        let id = error.id
        XCTAssertFalse(id.isEmpty)
        XCTAssertTrue(id.contains("error1"))
    }

    func testErrorIDUniqueness() {
        let error1 = OperatorAppError(
            code: "error",
            message: "Message",
            httpStatus: 400,
            path: "/path1"
        )

        let error2 = OperatorAppError(
            code: "error",
            message: "Message",
            httpStatus: 500,
            path: "/path2"
        )

        XCTAssertNotEqual(error1.id, error2.id)
    }

    // MARK: - Error Handling Suggestions Tests

    func testRecoverySuggestionForAuthError() {
        let error = OperatorAppError(
            code: "invalid_operator_key",
            message: "Invalid operator key. Update Settings and retry.",
            httpStatus: 401,
            path: "/api/test"
        )

        XCTAssertTrue(error.message.contains("Settings"))
    }

    func testRecoverySuggestionForNetworkError() {
        let error = OperatorAppError(
            code: "network_unreachable",
            message: "Cannot reach API. Check network connectivity.",
            httpStatus: nil,
            path: "/api/test"
        )

        XCTAssertTrue(error.message.contains("network"))
    }

    // MARK: - Error Classification Tests

    func testClassifyClientError() {
        let statusCodes = [400, 401, 403, 404, 409, 429]

        for code in statusCodes {
            let isClientError = (400...499).contains(code)
            XCTAssertTrue(isClientError)
        }
    }

    func testClassifyServerError() {
        let statusCodes = [500, 502, 503, 504]

        for code in statusCodes {
            let isServerError = (500...599).contains(code)
            XCTAssertTrue(isServerError)
        }
    }

    // MARK: - Error Equatable Tests

    func testErrorEquality() {
        let error1 = OperatorAppError(
            code: "error",
            message: "Message",
            httpStatus: 400,
            path: "/api"
        )

        let error2 = OperatorAppError(
            code: "error",
            message: "Message",
            httpStatus: 400,
            path: "/api"
        )

        XCTAssertEqual(error1, error2)
    }

    func testErrorInequality() {
        let error1 = OperatorAppError(
            code: "error1",
            message: "Message 1",
            httpStatus: 400,
            path: "/api"
        )

        let error2 = OperatorAppError(
            code: "error2",
            message: "Message 2",
            httpStatus: 500,
            path: "/other"
        )

        XCTAssertNotEqual(error1, error2)
    }
}
