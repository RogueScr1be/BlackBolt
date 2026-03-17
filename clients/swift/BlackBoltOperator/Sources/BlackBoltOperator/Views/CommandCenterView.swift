import SwiftUI

struct CommandCenterView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig

    @State private var commandCenter: CommandCenterPayload?
    @State private var revenue: RevenueSummaryResponse?
    @State private var gbpSummary: GbpOperatorSummary?
    @State private var postmarkSummary: PostmarkOperatorSummary?
    @State private var alerts: [OperatorAlert] = []
    @State private var errorMessage: String?
    @State private var isLoading = false

    private let apiService: any OperatorAPIServicing

    init(apiService: any OperatorAPIServicing = GeneratedOperatorAPIService()) {
        self.apiService = apiService
    }

    var body: some View {
        List {
            Section {
                HStack {
                    Text("What needs me now")
                        .font(.title3)
                        .fontWeight(.semibold)
                    Spacer()
                    Button("Refresh") {
                        Task { await loadCommandCenter() }
                    }
                    .disabled(isLoading)
                }
                Text("Tenant: \(runtime.tenantId)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Section {
                if activeAlerts.isEmpty {
                    Text("No active operator alerts.")
                        .foregroundColor(.secondary)
                } else {
                    ForEach(activeAlerts.prefix(6)) { alert in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(severityTitle(alert.severity))
                                    .font(.caption)
                                    .foregroundColor(severityColor(alert.severity))
                                Text(alert.title)
                                    .font(.headline)
                            }
                            Text(alert.message)
                                .font(.caption)
                            Text("Source: \(alert.source)")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            } header: {
                Text("Alerts")
            }

            Section("Revenue") {
                if let revenue {
                    metricRow("Attributed total", "\(revenue.rollup.direct.amountCents + revenue.rollup.assisted.amountCents) cents")
                    metricRow("Direct", "\(revenue.rollup.direct.amountCents) cents")
                    metricRow("Assisted", "\(revenue.rollup.assisted.amountCents) cents")
                    metricRow("Top campaigns", "\(revenue.topCampaigns.count)")
                } else {
                    Text("Revenue summary unavailable")
                        .foregroundColor(.secondary)
                }
            }

            Section("Health") {
                metricRow("Deliverability", commandCenter?.health.deliverability ?? "Unknown")
                metricRow("Review velocity", commandCenter?.health.reviewVelocity ?? "Unknown")
                metricRow("Worker liveness", commandCenter?.health.workerLiveness ?? "Unknown")
                metricRow("GBP", gbpSummary?.gbpIntegrationStatus ?? "Unknown")
                metricRow("Postmark paused", (postmarkSummary?.paused ?? false) ? "Yes" : "No")
                metricRow("Resume checklist ack", (postmarkSummary?.resumeChecklistAck ?? false) ? "Ready" : "Pending")
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundColor(.red)
                }
            }
        }
        .refreshable {
            await loadCommandCenter()
        }
        .task {
            await loadCommandCenter()
        }
    }

    private var activeAlerts: [OperatorAlert] {
        let acknowledged = runtime.acknowledgedAlertIDs()
        return alerts.filter { !acknowledged.contains($0.id) }
    }

    private func metricRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .foregroundColor(.secondary)
            Spacer()
            Text(value)
                .font(.body.monospacedDigit())
        }
    }

    private func loadCommandCenter() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let context = try runtime.apiContext()
            async let commandCenterTask = apiService.commandCenter(context: context, tenantId: context.tenantId)
            async let revenueTask = apiService.revenueSummary(context: context, tenantId: context.tenantId)
            async let gbpTask = apiService.gbpSummary(context: context, tenantId: context.tenantId)
            async let postmarkTask = apiService.postmarkSummary(context: context, tenantId: context.tenantId)

            let (commandCenterResp, revenueResp, gbpResp, postmarkResp) = try await (
                commandCenterTask,
                revenueTask,
                gbpTask,
                postmarkTask
            )

            commandCenter = commandCenterResp
            revenue = revenueResp
            gbpSummary = gbpResp
            postmarkSummary = postmarkResp
            alerts = buildAlerts(commandCenter: commandCenterResp, gbp: gbpResp, postmark: postmarkResp)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func buildAlerts(
        commandCenter: CommandCenterPayload,
        gbp: GbpOperatorSummary,
        postmark: PostmarkOperatorSummary
    ) -> [OperatorAlert] {
        var items = commandCenter.alerts.map { alert in
            OperatorAlert(
                id: alert.id,
                severity: mapSeverity(alert.severity),
                title: alert.title,
                message: alert.suggestedAction,
                source: "Command Center"
            )
        }

        if postmark.paused {
            items.append(
                OperatorAlert(
                    id: "postmark-paused",
                    severity: .warning,
                    title: "Postmark send path paused",
                    message: postmark.pauseReason ?? "Tenant send path is paused.",
                    source: "Postmark"
                )
            )
        }

        if postmark.invariants.sendStateBreach.active {
            let severity = mapSeverity(postmark.invariants.sendStateBreach.severity)
            items.append(
                OperatorAlert(
                    id: "postmark-invariant-\(postmark.invariants.sendStateBreach.code ?? "unknown")",
                    severity: severity,
                    title: "Postmark invariant breach",
                    message: postmark.invariants.sendStateBreach.message ?? "Invariant breach detected.",
                    source: "Postmark"
                )
            )
        }

        for alert in gbp.alerts where alert.resolvedAt == nil {
            items.append(
                OperatorAlert(
                    id: "gbp-\(alert.id)",
                    severity: mapSeverity(alert.severity),
                    title: alert.code,
                    message: alert.message,
                    source: "GBP"
                )
            )
        }

        return items.sorted { lhs, rhs in
            severityRank(lhs.severity) > severityRank(rhs.severity)
        }
    }

    private func mapSeverity(_ raw: String?) -> OperatorAlert.Severity {
        switch raw?.lowercased() {
        case "critical", "high":
            return .critical
        case "warning", "medium":
            return .warning
        default:
            return .info
        }
    }

    private func severityRank(_ severity: OperatorAlert.Severity) -> Int {
        switch severity {
        case .critical:
            return 3
        case .warning:
            return 2
        case .info:
            return 1
        }
    }

    private func severityColor(_ severity: OperatorAlert.Severity) -> Color {
        switch severity {
        case .critical:
            return .red
        case .warning:
            return .orange
        case .info:
            return .blue
        }
    }

    private func severityTitle(_ severity: OperatorAlert.Severity) -> String {
        switch severity {
        case .critical:
            return "Critical"
        case .warning:
            return "Warning"
        case .info:
            return "Info"
        }
    }
}
