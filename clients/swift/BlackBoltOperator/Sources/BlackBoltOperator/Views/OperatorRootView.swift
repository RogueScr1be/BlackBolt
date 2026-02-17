import SwiftUI

private enum OperatorSection: String, CaseIterable, Identifiable {
    case dashboard = "Dashboard"
    case tenants = "Tenants"
    case campaignEngine = "Campaign Engine"
    case alerts = "Alerts"
    case analytics = "Analytics"
    case reports = "Reports"
    case settings = "Settings"

    var id: String { rawValue }
}

struct OperatorRootView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @StateObject private var store = OperatorShellStore()
    @State private var selection: OperatorSection = .dashboard

    var body: some View {
        NavigationSplitView {
            List(OperatorSection.allCases, selection: $selection) { section in
                HStack {
                    Text(section.rawValue)
                    Spacer()
                    if section == .alerts, unresolvedAlertCount > 0 {
                        Text("\(unresolvedAlertCount)")
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.red.opacity(0.25))
                            .cornerRadius(10)
                    }
                }
            }
            .navigationTitle("Operator")
        } content: {
            VStack(spacing: 0) {
                if let lastError = store.lastError {
                    HStack(spacing: 10) {
                        Text(statusLabel(for: store.connectionState))
                            .font(.caption)
                            .fontWeight(.bold)
                        Text(lastError.message)
                            .font(.caption)
                        Spacer()
                        Button("Open Settings") { selection = .settings }
                        Button("Retry") {
                            Task { await store.refresh(runtime: runtime) }
                        }
                        .disabled(store.isLoading || store.connectionState == .invalidConfig)
                    }
                    .padding(10)
                    .background(Color.orange.opacity(0.2))
                }

                if let critical = store.criticalAlerts.first {
                    HStack {
                        Text("CRITICAL ALERT")
                            .font(.caption)
                            .fontWeight(.bold)
                        Text(critical.title)
                        Spacer()
                        Button("Open Alerts") { selection = .alerts }
                    }
                    .padding(10)
                    .background(Color.red.opacity(0.18))
                }

                Group {
                    switch selection {
                    case .dashboard:
                        DashboardView(store: store)
                    case .tenants:
                        TenantsView(store: store)
                    case .campaignEngine:
                        CampaignEngineView(store: store)
                    case .alerts:
                        AlertsHubView(store: store)
                    case .analytics:
                        AnalyticsView(store: store)
                    case .reports:
                        ReportsView(store: store)
                    case .settings:
                        OperatorSettingsView()
                            .environmentObject(runtime)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .navigationTitle(selection.rawValue)
        } detail: {
            EmptyView()
        }
        .task {
            await store.refresh(runtime: runtime)
        }
    }

    private var unresolvedAlertCount: Int {
        store.unresolvedAlerts.count
    }

    private func statusLabel(for state: OperatorConnectionState) -> String {
        switch state {
        case .ready:
            return "READY"
        case .invalidConfig:
            return "NOT CONFIGURED"
        case .networkError:
            return "NETWORK"
        case .authError:
            return "AUTH"
        case .serverError:
            return "SERVER"
        }
    }
}
