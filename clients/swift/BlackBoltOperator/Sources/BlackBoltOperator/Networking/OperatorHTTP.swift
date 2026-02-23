import Foundation

enum OperatorHTTP {
    static func fetchJSON<T: Decodable>(_ request: URLRequest, as type: T.Type) async throws -> T {
        let (data, _) = try await performWithStatus(request)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(T.self, from: data)
    }

    static func perform(_ request: URLRequest) async throws -> Data {
        let (data, _) = try await performWithStatus(request)
        return data
    }

    static func performWithStatus(_ request: URLRequest) async throws -> (Data, Int) {
        let (data, response) = try await performRaw(request)
        guard let http = response as? HTTPURLResponse else {
            throw OperatorAppError(
                code: "bad_server_response",
                message: "Invalid response from API server.",
                httpStatus: nil,
                path: request.url?.path
            )
        }
        guard (200 ... 299).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw mapHTTPError(status: http.statusCode, body: body, request: request)
        }
        return (data, http.statusCode)
    }

    private static func performRaw(_ request: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await URLSession.shared.data(for: request)
        } catch {
            throw mapTransportError(error, request: request)
        }
    }

    private static func mapTransportError(_ error: Error, request: URLRequest) -> OperatorAppError {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain {
            switch nsError.code {
            case NSURLErrorNotConnectedToInternet,
                 NSURLErrorCannotFindHost,
                 NSURLErrorCannotConnectToHost,
                 NSURLErrorNetworkConnectionLost,
                 NSURLErrorTimedOut:
                return OperatorAppError(
                    code: "network_unreachable",
                    message: "Cannot reach API base URL. Check API URL and network connectivity.",
                    httpStatus: nil,
                    path: request.url?.path
                )
            default:
                break
            }
        }

        return OperatorAppError(
            code: "network_error",
            message: nsError.localizedDescription,
            httpStatus: nil,
            path: request.url?.path
        )
    }

    private static func mapHTTPError(status: Int, body: String, request: URLRequest) -> OperatorAppError {
        let path = request.url?.path
        switch status {
        case 401:
            return OperatorAppError(
                code: "invalid_operator_key",
                message: "Invalid operator key (X-Operator-Key). Update Settings and retry.",
                httpStatus: status,
                path: path
            )
        case 404:
            return OperatorAppError(
                code: "endpoint_not_found",
                message: "Endpoint not available on selected API base URL.",
                httpStatus: status,
                path: path
            )
        case 503:
            return OperatorAppError(
                code: "operator_auth_unavailable",
                message: "Operator authentication is unavailable on API. Verify tenant credentials and server auth config.",
                httpStatus: status,
                path: path
            )
        default:
            let fallbackBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
            return OperatorAppError(
                code: "http_error",
                message: fallbackBody.isEmpty ? "HTTP \(status) returned by API." : "HTTP \(status): \(fallbackBody)",
                httpStatus: status,
                path: path
            )
        }
    }
}
