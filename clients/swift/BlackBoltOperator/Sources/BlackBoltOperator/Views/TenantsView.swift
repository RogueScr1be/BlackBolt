import SwiftUI

struct TenantsView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @ObservedObject var store: OperatorShellStore

    var body: some View {
        HStack(spacing: 16) {
            List {
                Section("Tenants") {
                    Text(runtime.tenantId)
                }
                Section("Filters") {
                    Text("Sort: Health score")
                    Text("Filter: Action required")
                }
            }
            .frame(minWidth: 220, maxWidth: 260)

            VStack(alignment: .leading, spacing: 12) {
                Text("Tenant Detail")
                    .font(.title3)
                    .fontWeight(.semibold)

                if let health = store.payload?.health {
                    Text("Deliverability: \(health.deliverability)")
                    Text("Review Velocity: \(health.reviewVelocity)")
                    Text("Engagement Trend: \(health.engagementTrend)")
                    Text("Worker Liveness: \(health.workerLiveness)")
                }

                GroupBox("Revenue Timeline") {
                    ForEach(store.payload?.activityFeed.filter({ $0.eventType == "revenue_event" }).prefix(5) ?? []) { item in
                        HStack {
                            Text(item.createdAt)
                                .font(.caption2)
                            Spacer()
                            Text("\(item.amountCents ?? 0) cents")
                                .font(.body.monospacedDigit())
                        }
                    }
                }

                GroupBox("Review Trigger Log") {
                    ForEach(store.payload?.activityFeed.filter({ $0.eventType == "review_ingested" }).prefix(5) ?? []) { item in
                        Text(item.summary)
                            .font(.caption)
                    }
                }

                GroupBox("Campaign Performance") {
                    Text("Campaign rollups are available in Campaign Engine and Analytics.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                GroupBox("Automation Settings") {
                    Text("Default segment mode: last_seen_90_365")
                        .font(.caption)
                    Text("Auto-send threshold: 0.8 (0.9 strict vertical)")
                        .font(.caption)
                }
                Spacer()
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .padding(16)
    }
}
