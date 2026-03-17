import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @ObservedObject var store: OperatorShellStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("Tenant: \(runtime.tenantId)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                    Button("Refresh") {
                        Task { await store.reloadDashboard(runtime: runtime) }
                    }
                    .disabled(store.isLoading || !store.hasRequiredSettings(runtime: runtime))
                }

                if store.connectionState == .invalidConfig {
                    GroupBox("Connection Setup Required") {
                        Text("Set API Base URL, Tenant ID, and Operator Key in Settings before refresh.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }

                switch dashboardContentState {
                case .loading:
                    ProgressView("Loading dashboard summary...")
                case .failed(let sectionError):
                    HStack {
                        Text(sectionError.message)
                            .font(.caption)
                            .foregroundColor(.red)
                        Spacer()
                        Button("Retry Dashboard") {
                            Task { await store.reloadDashboard(runtime: runtime) }
                        }
                        .disabled(store.isLoading || !store.hasRequiredSettings(runtime: runtime))
                    }
                case .empty:
                    Text("No dashboard summary returned yet.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                case .degraded(let sectionError):
                    Text("Dashboard summary is showing the last successful payload. Latest refresh failed: \(sectionError.message)")
                        .font(.caption)
                        .foregroundColor(.orange)
                case .ready:
                    EmptyView()
                }

                if let dashboard = store.dashboard {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 3), spacing: 12) {
                        KPIBox(title: "Revenue (month)", value: "\(dashboard.kpis.revenueMonth)")
                        KPIBox(title: "Attributed bookings", value: "\(dashboard.kpis.attributedBookingsMonth)")
                        KPIBox(title: "5-star reviews", value: "\(dashboard.kpis.new5starReviewsMonth)")
                        KPIBox(title: "Email conversion", value: String(format: "%.2f%%", dashboard.kpis.emailConversionRate * 100))
                        KPIBox(title: "Portfolio health", value: "\(dashboard.kpis.portfolioHealthScore)")
                        KPIBox(title: "Action required", value: "\(dashboard.kpis.actionRequiredCount)")
                    }

                    if let segments = store.customerSegments {
                        GroupBox("Customers + Segments") {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Total customers: \(segments.total)")
                                    .font(.caption)
                                HStack {
                                    ForEach(segments.items) { item in
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(item.segment)
                                                .font(.caption2)
                                                .foregroundColor(.secondary)
                                            Text("\(item.count)")
                                                .font(.caption.monospacedDigit())
                                        }
                                        if item.id != segments.items.last?.id {
                                            Spacer()
                                        }
                                    }
                                }
                            }
                        }
                    }

                    GroupBox("Import Health") {
                        if let latestImport = store.revenueImports.first {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Latest status: \(latestImport.status.uppercased())")
                                    .font(.caption)
                                Text("Rows \(latestImport.processedRows)/\(latestImport.totalRows) • ok \(latestImport.succeededRows) • fail \(latestImport.failedRows) • dup \(latestImport.duplicateRows)")
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                            }
                        } else {
                            Text("No revenue imports found yet.")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }

                    GroupBox("Dashboard Widgets") {
                        HStack {
                            Text("Open alerts: \(dashboard.widgets.openAlerts)")
                            Spacer()
                            Text("Events 24h: \(dashboard.widgets.eventsLast24h)")
                            Spacer()
                            Text("Updated: \(dashboard.widgets.lastUpdatedAt)")
                                .font(.caption2)
                        }
                    }
                }

                GroupBox("Tenant Grid") {
                    switch tenantGridState {
                    case .loading:
                        ProgressView("Loading tenant status...")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    case .failed(let error):
                        Text(error.message)
                            .font(.caption)
                            .foregroundColor(.red)
                    case .empty:
                        Text("No tenants available.")
                            .foregroundColor(.secondary)
                    case .degraded(let error):
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Tenant status is degraded: \(error.message)")
                                .font(.caption)
                                .foregroundColor(.orange)
                            tenantGrid
                        }
                    case .ready:
                        tenantGrid
                    }
                }

                GroupBox("Live Revenue Feed") {
                    switch revenueFeedState {
                    case .loading:
                        ProgressView("Loading revenue activity...")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    case .failed(let error):
                        Text(error.message)
                            .font(.caption)
                            .foregroundColor(.red)
                    case .empty:
                        Text("No revenue activity yet.")
                            .foregroundColor(.secondary)
                    case .degraded(let error):
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Revenue activity is partially degraded: \(error.message)")
                                .font(.caption)
                                .foregroundColor(.orange)
                            revenueFeed
                        }
                    case .ready:
                        revenueFeed
                    }
                }

                GroupBox("Action Required") {
                    switch alertContentState {
                    case .loading:
                        ProgressView("Loading alerts...")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    case .failed(let error):
                        Text(error.message)
                            .font(.caption)
                            .foregroundColor(.red)
                    case .empty:
                        Text("No open alerts.")
                            .foregroundColor(.secondary)
                    case .degraded(let error):
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Alert feed is partially degraded: \(error.message)")
                                .font(.caption)
                                .foregroundColor(.orange)
                            alertList
                        }
                    case .ready:
                        alertList
                    }
                }

                if let error = store.lastError {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(error.message)
                            .foregroundColor(.red)
                        if let path = error.path {
                            Text("Request: \(path)")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                        if let status = error.httpStatus {
                            Text("HTTP status: \(status)")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }
            .padding(16)
        }
    }

    private var dashboardContentState: OperatorContentState {
        store.contentState(for: store.dashboardState, hasContent: store.dashboard != nil)
    }

    private var tenantGridState: OperatorContentState {
        store.contentState(for: store.tenantsState, hasContent: !store.tenants.isEmpty)
    }

    private var revenueFeedItems: [OperatorActivityEvent] {
        store.events.filter { $0.eventType == "revenue_event" }
    }

    private var revenueFeedState: OperatorContentState {
        store.contentState(for: store.eventsState, hasContent: !revenueFeedItems.isEmpty)
    }

    private var alertContentState: OperatorContentState {
        store.contentState(for: store.alertsState, hasContent: !store.unresolvedAlerts.isEmpty)
    }

    @ViewBuilder
    private var tenantGrid: some View {
        ForEach(store.tenants) { tenant in
            HStack {
                Text(tenant.name)
                Spacer()
                Text("Health \(tenant.healthScore)")
                Text("Actions \(tenant.actionRequiredCount)")
            }
        }
    }

    @ViewBuilder
    private var revenueFeed: some View {
        ForEach(revenueFeedItems.prefix(6)) { item in
            HStack {
                Text(item.createdAt)
                    .font(.caption2)
                    .foregroundColor(.secondary)
                Spacer()
                Text("\(item.amountCents ?? 0) cents")
                    .font(.body.monospacedDigit())
            }
        }
    }

    @ViewBuilder
    private var alertList: some View {
        ForEach(store.unresolvedAlerts.prefix(8)) { alert in
            VStack(alignment: .leading, spacing: 3) {
                Text("[\(alert.severity.uppercased())] \(alert.title)")
                    .font(.headline)
                Text(alert.suggestedAction)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct KPIBox: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundColor(.secondary)
            Text(value)
                .font(.title3.monospacedDigit())
                .fontWeight(.semibold)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color.white.opacity(0.05))
        .cornerRadius(8)
    }
}
