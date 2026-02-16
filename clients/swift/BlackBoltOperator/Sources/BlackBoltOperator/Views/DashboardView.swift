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
                        Task { await store.refresh(runtime: runtime) }
                    }
                    .disabled(store.isLoading)
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
                    if store.tenants.isEmpty {
                        Text("No tenants available")
                            .foregroundColor(.secondary)
                    } else {
                        ForEach(store.tenants) { tenant in
                            HStack {
                                Text(tenant.name)
                                Spacer()
                                Text("Health \(tenant.healthScore)")
                                Text("Actions \(tenant.actionRequiredCount)")
                            }
                        }
                    }
                }

                GroupBox("Live Revenue Feed") {
                    let feed = store.events.filter { $0.eventType == "revenue_event" }
                    if feed.isEmpty {
                        Text("No revenue activity yet")
                            .foregroundColor(.secondary)
                    } else {
                        ForEach(feed.prefix(6)) { item in
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
                }

                GroupBox("Action Required") {
                    if store.unresolvedAlerts.isEmpty {
                        Text("No open alerts.")
                            .foregroundColor(.secondary)
                    } else {
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

                if let error = store.errorMessage {
                    Text(error)
                        .foregroundColor(.red)
                }
            }
            .padding(16)
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
