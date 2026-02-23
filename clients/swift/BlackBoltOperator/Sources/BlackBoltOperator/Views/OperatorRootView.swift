import SwiftUI

enum OperatorSection: String, CaseIterable, Identifiable {
    case dashboard = "Dashboard"
    case imports = "Imports"
    case tenants = "Tenants"
    case campaignEngine = "Campaign Engine"
    case reviewQueue = "Review Queue"
    case approvals = "Approvals"
    case alerts = "Alerts"
    case analytics = "Analytics"
    case reports = "Reports"
    case settings = "Settings"

    var id: String { rawValue }
}

struct OperatorRootView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @StateObject private var store = OperatorShellStore()
    @State private var selection: OperatorSection? = .dashboard
    @State private var didInitialRefresh = false

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
                    } else if section == .approvals, pendingApprovalCount > 0 {
                        Text("\(pendingApprovalCount)")
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.blue.opacity(0.22))
                            .cornerRadius(10)
                    }
                }
                .tag(section)
            }
            .navigationTitle("Operator")
        } content: {
            VStack(spacing: 0) {
                HStack {
                    Spacer()
                    Text("Selected: \(activeSection.rawValue)")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
                .padding(.horizontal, 10)
                .padding(.top, 6)

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
                    switch activeSection {
                    case .dashboard:
                        DashboardView(store: store)
                    case .imports:
                        ImportsListView(store: store)
                    case .tenants:
                        TenantsView(store: store)
                    case .campaignEngine:
                        CampaignEngineView(store: store)
                    case .reviewQueue:
                        ReviewQueueView(store: store)
                            .environmentObject(runtime)
                    case .approvals:
                        ApprovalsView(store: store)
                            .environmentObject(runtime)
                    case .alerts:
                        AlertsHubView(store: store)
                    case .analytics:
                        AnalyticsView(store: store)
                    case .reports:
                        ReportsView(store: store)
                    case .settings:
                        OperatorSettingsView(store: store)
                            .environmentObject(runtime)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .navigationTitle(activeSection.rawValue)
        } detail: {
            EmptyView()
        }
        .task {
            if didInitialRefresh {
                return
            }
            didInitialRefresh = true
            store.reconcileConfig(runtime: runtime)
            if store.connectionState != .invalidConfig {
                await store.refresh(runtime: runtime)
            }
        }
    }

    private var unresolvedAlertCount: Int {
        store.unresolvedAlerts.count
    }

    private var pendingApprovalCount: Int {
        store.approvalQueue.filter { $0.state == "awaiting_approval" }.count
    }

    private var activeSection: OperatorSection {
        selection ?? .dashboard
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
