import Foundation

@MainActor
final class OperatorShellStore: ObservableObject {
    @Published var payload: CommandCenterPayload?
    @Published var report: MonthlyReportPayload?
    @Published var isLoading = false
    @Published var errorMessage: String?

    func refresh(runtime: OperatorRuntimeConfig) async {
        isLoading = true
        defer { isLoading = false }

        do {
            let request = try runtime.request(path: "/v1/tenants/\(runtime.tenantId)/operator/command-center")
            payload = try await OperatorHTTP.fetchJSON(request, as: CommandCenterPayload.self)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func executeIntervention(runtime: OperatorRuntimeConfig, capability: String, alertID: String?) async {
        do {
            switch capability {
            case "retry-gbp-ingestion":
                _ = try await post(runtime: runtime, path: "/v1/tenants/\(runtime.tenantId)/interventions/retry-gbp-ingestion", body: nil)
            case "resume-postmark":
                _ = try await post(runtime: runtime, path: "/v1/tenants/\(runtime.tenantId)/interventions/resume-postmark", body: nil)
            case "ack-alert":
                guard let alertID else { return }
                let json = "{\"alert_id\":\"\(alertID)\"}"
                _ = try await post(runtime: runtime, path: "/v1/tenants/\(runtime.tenantId)/interventions/ack-alert", body: json)
            default:
                break
            }
            await refresh(runtime: runtime)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadMonthlyReport(runtime: OperatorRuntimeConfig, month: String) async {
        do {
            let request = try runtime.request(path: "/v1/tenants/\(runtime.tenantId)/reports/monthly?month=\(month)")
            report = try await OperatorHTTP.fetchJSON(request, as: MonthlyReportPayload.self)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    var criticalAlerts: [CommandCenterAlert] {
        payload?.alerts.filter { $0.resolvedAt == nil && $0.severity == "critical" } ?? []
    }

    var unresolvedAlerts: [CommandCenterAlert] {
        payload?.alerts.filter { $0.resolvedAt == nil } ?? []
    }

    private func post(runtime: OperatorRuntimeConfig, path: String, body: String?) async throws -> Data {
        var request = try runtime.request(path: path, method: "POST")
        if let body {
            request.httpBody = Data(body.utf8)
            request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return try await OperatorHTTP.perform(request)
    }
}
