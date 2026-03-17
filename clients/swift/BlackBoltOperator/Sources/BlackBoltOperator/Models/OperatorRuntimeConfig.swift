import Foundation

@MainActor
final class OperatorRuntimeConfig: ObservableObject {
    private enum Keys {
        static let apiBaseURL = "operator.apiBaseURL"
        static let tenantId = "operator.tenantId"
        static let authHeader = "operator.authHeader"
        static let operatorKey = "operator.operatorKey"
        static let ackPrefix = "operator.ackAlerts."
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

    @Published var operatorKey: String {
        didSet { defaults.set(operatorKey, forKey: Keys.operatorKey) }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.apiBaseURL = defaults.string(forKey: Keys.apiBaseURL) ?? "https://blackbolt-api-production.up.railway.app"
        self.tenantId = defaults.string(forKey: Keys.tenantId) ?? "tenant-demo"
        self.authHeader = defaults.string(forKey: Keys.authHeader) ?? ""
        self.operatorKey = defaults.string(forKey: Keys.operatorKey) ?? ""
    }

    func apiContext() throws -> OperatorAPIContext {
        let base = apiBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !base.isEmpty, let baseURL = URL(string: base) else {
            throw OperatorAppError(
                code: "invalid_config",
                message: "Invalid API base URL. Update Settings and retry.",
                httpStatus: nil,
                path: nil
            )
        }
        return OperatorAPIContext(
            serverURL: baseURL,
            tenantId: tenantId.trimmingCharacters(in: .whitespacesAndNewlines),
            operatorKey: operatorKey.trimmingCharacters(in: .whitespacesAndNewlines),
            authorizationHeader: resolvedAuthorizationHeader()
        )
    }

    func resolvedAuthorizationHeader() -> String? {
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

    func acknowledgedAlertIDs() -> Set<String> {
        let key = "\(Keys.ackPrefix)\(tenantId)"
        let values = defaults.array(forKey: key) as? [String] ?? []
        return Set(values)
    }

    func markAlertAcknowledged(_ id: String) {
        var values = acknowledgedAlertIDs()
        values.insert(id)
        persistAcknowledgedAlertIDs(values)
    }

    func unacknowledgeAlert(_ id: String) {
        var values = acknowledgedAlertIDs()
        values.remove(id)
        persistAcknowledgedAlertIDs(values)
    }

    func clearAcknowledgedAlerts() {
        persistAcknowledgedAlertIDs(Set<String>())
    }

    private func persistAcknowledgedAlertIDs(_ ids: Set<String>) {
        let key = "\(Keys.ackPrefix)\(tenantId)"
        defaults.set(Array(ids).sorted(), forKey: key)
    }
}
