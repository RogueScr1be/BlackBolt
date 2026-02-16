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

                if let kpis = store.payload?.kpis {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 3), spacing: 12) {
                        KPIBox(title: "Revenue (month)", value: "\(kpis.revenueMonth)")
                        KPIBox(title: "Attributed bookings", value: "\(kpis.attributedBookingsMonth)")
                        KPIBox(title: "5-star reviews", value: "\(kpis.new5starReviewsMonth)")
                        KPIBox(title: "Email conversion", value: String(format: "%.2f%%", kpis.emailConversionRate * 100))
                        KPIBox(title: "Portfolio health", value: "\(kpis.portfolioHealthScore)")
                        KPIBox(title: "Action required", value: "\(kpis.actionRequiredCount)")
                    }
                }

                GroupBox("Tenant Grid") {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(runtime.tenantId)
                            .fontWeight(.semibold)
                        Text("Single-operator 1.0 focus tenant")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                GroupBox("Live Revenue Feed") {
                    if let feed = store.payload?.activityFeed.filter({ $0.eventType == "revenue_event" }), !feed.isEmpty {
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
                    } else {
                        Text("No revenue activity yet")
                            .foregroundColor(.secondary)
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
