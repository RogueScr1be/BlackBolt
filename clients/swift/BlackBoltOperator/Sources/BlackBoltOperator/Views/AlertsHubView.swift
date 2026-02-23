import SwiftUI

struct AlertsHubView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @ObservedObject var store: OperatorShellStore

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let status = store.interventionStatusMessage {
                Text(status)
                    .font(.caption)
                    .foregroundColor(status.contains("failed") ? .red : .green)
            }

            if let error = store.lastError {
                HStack {
                    Text(error.message)
                        .font(.caption)
                        .foregroundColor(.red)
                    Spacer()
                    Button("Retry") {
                        Task { await store.reloadAlerts(runtime: runtime) }
                    }
                    .disabled(!store.hasRequiredSettings(runtime: runtime) || store.isLoading)
                }
            }

            if case .failed(let sectionError) = store.alertsState {
                HStack {
                    Text(sectionError.message)
                        .font(.caption)
                        .foregroundColor(.red)
                    Spacer()
                    Button("Retry Alerts") {
                        Task { await store.reloadAlerts(runtime: runtime) }
                    }
                    .disabled(!store.hasRequiredSettings(runtime: runtime) || store.isLoading)
                }
            }

            List {
                if store.unresolvedAlerts.isEmpty {
                    Text("No unresolved alerts")
                        .foregroundColor(.secondary)
                } else {
                    ForEach(sortedAlerts) { alert in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(alert.severity.uppercased())
                                    .font(.caption)
                                    .fontWeight(.bold)
                                Text(alert.title)
                                    .font(.headline)
                                Spacer()
                                Text(alert.type)
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                            }

                            Text(alert.suggestedAction)
                                .font(.caption)

                            HStack {
                                if alert.executeCapability != "none" {
                                    Button("Execute") {
                                        Task {
                                            await store.executeIntervention(
                                                runtime: runtime,
                                                capability: alert.executeCapability,
                                                alertID: alert.id
                                            )
                                        }
                                    }
                                    .disabled(!store.hasRequiredSettings(runtime: runtime) || store.isLoading)
                                }
                                if alert.executeCapability != "ack-alert" {
                                    Button("Acknowledge") {
                                        Task {
                                            await store.executeIntervention(
                                                runtime: runtime,
                                                capability: "ack-alert",
                                                alertID: alert.id
                                            )
                                        }
                                    }
                                    .disabled(!store.hasRequiredSettings(runtime: runtime) || store.isLoading)
                                }
                            }
                            if !store.hasRequiredSettings(runtime: runtime) {
                                Text("Configure API Base URL, Tenant ID, and Operator Key in Settings.")
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
        }
    }

    private var sortedAlerts: [OperatorAlertListItem] {
        store.unresolvedAlerts.sorted { lhs, rhs in
            severityRank(lhs.severity) > severityRank(rhs.severity)
        }
    }

    private func severityRank(_ value: String) -> Int {
        switch value {
        case "critical":
            return 3
        case "warning":
            return 2
        default:
            return 1
        }
    }
}
