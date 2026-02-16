import SwiftUI

struct TenantsView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @ObservedObject var store: OperatorShellStore

    var body: some View {
        HStack(spacing: 16) {
            List(store.tenants) { tenant in
                VStack(alignment: .leading, spacing: 4) {
                    Text(tenant.name)
                    Text(tenant.slug)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .frame(minWidth: 220, maxWidth: 260)

            VStack(alignment: .leading, spacing: 12) {
                Text("Tenant Detail")
                    .font(.title3)
                    .fontWeight(.semibold)

                if let detail = store.tenantDetail {
                    Text("Name: \(detail.name)")
                    Text("Slug: \(detail.slug)")
                    Text("Health score: \(detail.healthScore)")
                    Text("Action required: \(detail.actionRequiredCount)")
                    Text("Created: \(detail.createdAt)")
                }

                GroupBox("Revenue Timeline") {
                    if let metrics = store.tenantMetrics {
                        ForEach(metrics.revenueSeries.prefix(6)) { point in
                            HStack {
                                Text(point.date)
                                Spacer()
                                Text("\(point.amountCents) cents")
                                    .font(.body.monospacedDigit())
                            }
                        }
                        if metrics.revenueSeries.isEmpty {
                            Text("No metrics yet")
                                .foregroundColor(.secondary)
                        }
                    }
                }

                GroupBox("Review Trigger Log") {
                    ForEach(store.events.filter({ $0.eventType == "review_ingested" }).prefix(5)) { item in
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
