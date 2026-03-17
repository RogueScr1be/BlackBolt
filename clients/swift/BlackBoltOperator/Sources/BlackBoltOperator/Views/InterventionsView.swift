import SwiftUI

struct InterventionsView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig

    @State private var postmarkSummary: PostmarkOperatorSummary?
    @State private var gbpSummary: GbpOperatorSummary?
    @State private var statusMessage: String?
    @State private var errorMessage: String?
    @State private var isBusy = false

    private let apiService: any OperatorAPIServicing

    init(apiService: any OperatorAPIServicing = GeneratedOperatorAPIService()) {
        self.apiService = apiService
    }

    var body: some View {
        List {
            Section {
                Text("Apply targeted actions only when required.")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text("Tenant: \(runtime.tenantId)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Section("Automation Controls") {
                HStack {
                    Button("Retry GBP Ingestion") {
                        Task { await retryGbpIngestion() }
                    }
                    .disabled(isBusy)

                    Button("Resume Postmark Sends") {
                        Task { await resumePostmarkSends() }
                    }
                    .disabled(isBusy)
                }
                Text("Pause controls stay policy-driven in 1.0 and are triggered automatically by safety invariants.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Section("Acknowledge Alerts (Local)") {
                if unresolvedAlerts.isEmpty {
                    Text("No unresolved alerts.")
                        .foregroundColor(.secondary)
                } else {
                    ForEach(unresolvedAlerts) { alert in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(alert.title)
                                    .font(.headline)
                                Text(alert.message)
                                    .font(.caption)
                                Text("Source: \(alert.source)")
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Button("Acknowledge") {
                                runtime.markAlertAcknowledged(alert.id)
                            }
                        }
                    }
                    Button("Clear Acknowledged") {
                        runtime.clearAcknowledgedAlerts()
                    }
                    .disabled(isBusy)
                }
            }

            if let statusMessage {
                Section {
                    Text(statusMessage)
                        .foregroundColor(.green)
                }
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundColor(.red)
                }
            }
        }
        .task {
            await refreshContext()
        }
        .refreshable {
            await refreshContext()
        }
    }

    private var unresolvedAlerts: [OperatorAlert] {
        let all = buildAlerts()
        let acknowledged = runtime.acknowledgedAlertIDs()
        return all.filter { !acknowledged.contains($0.id) }
    }

    private func buildAlerts() -> [OperatorAlert] {
        var items: [OperatorAlert] = []

        if let postmarkSummary, postmarkSummary.paused {
            items.append(
                OperatorAlert(
                    id: "postmark-paused",
                    severity: .warning,
                    title: "Postmark send path paused",
                    message: postmarkSummary.pauseReason ?? "Paused by policy.",
                    source: "Postmark"
                )
            )
        }

        if let postmarkSummary, postmarkSummary.invariants.sendStateBreach.active {
            items.append(
                OperatorAlert(
                    id: "postmark-invariant-\(postmarkSummary.invariants.sendStateBreach.code ?? "unknown")",
                    severity: .critical,
                    title: "Postmark invariant breach",
                    message: postmarkSummary.invariants.sendStateBreach.message ?? "Invariant breach detected.",
                    source: "Postmark"
                )
            )
        }

        if let gbpSummary {
            for alert in gbpSummary.alerts where alert.resolvedAt == nil {
                items.append(
                    OperatorAlert(
                        id: "gbp-\(alert.id)",
                        severity: .warning,
                        title: alert.code,
                        message: alert.message,
                        source: "GBP"
                    )
                )
            }
        }

        return items
    }

    private func refreshContext() async {
        isBusy = true
        defer { isBusy = false }

        do {
            let context = try runtime.apiContext()
            async let gbpTask = apiService.gbpSummary(context: context, tenantId: context.tenantId)
            async let postmarkTask = apiService.postmarkSummary(context: context, tenantId: context.tenantId)
            let (gbp, postmark) = try await (gbpTask, postmarkTask)
            gbpSummary = gbp
            postmarkSummary = postmark
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func retryGbpIngestion() async {
        isBusy = true
        defer { isBusy = false }
        do {
            let context = try runtime.apiContext()
            try await apiService.retryGbpIngestion(context: context, tenantId: context.tenantId)
            statusMessage = "GBP ingestion retriggered."
            errorMessage = nil
            await refreshContext()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func resumePostmarkSends() async {
        isBusy = true
        defer { isBusy = false }
        do {
            let context = try runtime.apiContext()
            let response = try await apiService.resumePostmarkSends(
                context: context,
                tenantId: context.tenantId,
                checklistAck: true
            )
            if response.resumed == true {
                statusMessage = "Postmark send path resumed."
            } else {
                statusMessage = response.reason ?? "Resume request accepted but not resumed."
            }
            errorMessage = nil
            await refreshContext()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
