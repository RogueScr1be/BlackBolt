import Foundation

@MainActor
final class OperatorRuntimeConfig: ObservableObject {
    private enum Keys {
        static let apiBaseURL = "operator.apiBaseURL"
        static let tenantId = "operator.tenantId"
        static let authHeader = "operator.authHeader"
    }

    private let defaults: UserDefaults

    @Published var apiBaseURL: String {
        didSet { defaults.set(apiBaseURL, forKey: Keys.apiBaseURL) }
    }

    @Published var tenantId: String {
        didSet { defaults.set(tenantId, forKey: Keys.tenantId) }
    }

    @Published var authHeader: String {
        didSet { defaults.set(authHeader, forKey: Keys.authHeader) }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.apiBaseURL = defaults.string(forKey: Keys.apiBaseURL) ?? "https://blackbolt-api-production.up.railway.app"
        self.tenantId = defaults.string(forKey: Keys.tenantId) ?? "tenant-demo"
        self.authHeader = defaults.string(forKey: Keys.authHeader) ?? ""
    }

    func request(path: String, method: String = "GET") throws -> URLRequest {
        let base = apiBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !base.isEmpty, let baseURL = URL(string: base) else {
            throw URLError(.badURL)
        }

        let normalizedPath = path.hasPrefix("/") ? String(path.dropFirst()) : path
        let url = baseURL.appendingPathComponent(normalizedPath)
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.addValue(tenantId, forHTTPHeaderField: "x-tenant-id")
        req.addValue("operator", forHTTPHeaderField: "x-user-id")
        if let auth = resolvedAuthorizationHeader() {
            req.addValue(auth, forHTTPHeaderField: "Authorization")
        }
        return req
    }

    private func resolvedAuthorizationHeader() -> String? {
        let raw = authHeader.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.isEmpty || raw == "-" {
            return nil
        }
        if raw.contains(" ") {
            return raw
        }
        let encoded = Data(raw.utf8).base64EncodedString()
        return "Basic \(encoded)"
    }
}
