import SwiftUI

struct TenantsView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @ObservedObject var store: OperatorShellStore

    var body: some View {
        HStack(spacing: 16) {
            GroupBox("Tenant Roster") {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Button("Refresh") {
                            Task { await store.refresh(runtime: runtime) }
                        }
                        .disabled(store.isLoading || !store.hasRequiredSettings(runtime: runtime))
                        Spacer()
                        Text("Current tenant scope: \(runtime.tenantId)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    switch tenantListState {
                    case .loading:
                        ProgressView("Loading tenants...")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    case .failed(let error):
                        Text(error.message)
                            .font(.caption)
                            .foregroundColor(.red)
                    case .empty:
                        Text("No tenants available for this operator scope.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    case .degraded(let error):
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Tenant list is partially degraded: \(error.message)")
                                .font(.caption)
                                .foregroundColor(.orange)
                            tenantList
                        }
                    case .ready:
                        tenantList
                    }
                }
            }
            .frame(minWidth: 220, maxWidth: 300)

            VStack(alignment: .leading, spacing: 12) {
                Text("Tenant Detail")
                    .font(.title3)
                    .fontWeight(.semibold)

                if case .degraded(let error) = tenantDataState {
                    Text("Tenant detail is partially degraded: \(error.message)")
                        .font(.caption)
                        .foregroundColor(.orange)
                }

                if let detail = store.tenantDetail {
                    Text("Name: \(detail.name)")
                    Text("Slug: \(detail.slug)")
                    Text("Health score: \(detail.healthScore)")
                    Text("Action required: \(detail.actionRequiredCount)")
                    Text("Created: \(detail.createdAt)")
                } else if case .loading = tenantDataState {
                    ProgressView("Loading tenant detail...")
                } else if case .failed(let error) = tenantDataState {
                    Text(error.message)
                        .font(.caption)
                        .foregroundColor(.red)
                } else {
                    Text("Tenant detail is not available yet.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                GroupBox("Revenue Timeline") {
                    switch tenantMetricsState {
                    case .loading:
                        ProgressView("Loading tenant metrics...")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    case .failed(let error):
                        Text(error.message)
                            .font(.caption)
                            .foregroundColor(.red)
                    case .empty:
                        Text("No metrics available yet.")
                            .foregroundColor(.secondary)
                    case .degraded(let error):
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Metrics are partially degraded: \(error.message)")
                                .font(.caption)
                                .foregroundColor(.orange)
                            metricsTimeline
                        }
                    case .ready:
                        metricsTimeline
                    }
                }

                GroupBox("Review Trigger Log") {
                    switch reviewEventsState {
                    case .loading:
                        ProgressView("Loading review events...")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    case .failed(let error):
                        Text(error.message)
                            .font(.caption)
                            .foregroundColor(.red)
                    case .empty:
                        Text("No review ingestion activity yet.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    case .degraded(let error):
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Review activity is partially degraded: \(error.message)")
                                .font(.caption)
                                .foregroundColor(.orange)
                            reviewEventList
                        }
                    case .ready:
                        reviewEventList
                    }
                }

                GroupBox("Readiness") {
                    if let detail = store.tenantDetail {
                        Text("Health score: \(detail.healthScore)")
                            .font(.caption)
                        Text("Action required: \(detail.actionRequiredCount)")
                            .font(.caption)
                        Text(store.lastError == nil ? "Operator data is current." : "Operator data is degraded. Review failed sections before acting.")
                            .font(.caption)
                            .foregroundColor(store.lastError == nil ? .secondary : .orange)
                    } else {
                        Text("Readiness becomes available once tenant detail loads.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                Spacer()
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .padding(16)
    }

    private var tenantListState: OperatorContentState {
        store.contentState(for: store.tenantsState, hasContent: !store.tenants.isEmpty)
    }

    private var tenantDataState: OperatorContentState {
        store.contentState(for: store.tenantsState, hasContent: store.tenantDetail != nil)
    }

    private var tenantMetricsState: OperatorContentState {
        store.contentState(for: store.tenantsState, hasContent: store.tenantMetrics != nil)
    }

    private var reviewTriggerEvents: [OperatorActivityEvent] {
        store.events.filter { $0.eventType == "review_ingested" }
    }

    private var reviewEventsState: OperatorContentState {
        store.contentState(for: store.eventsState, hasContent: !reviewTriggerEvents.isEmpty)
    }

    @ViewBuilder
    private var tenantList: some View {
        List(store.tenants) { tenant in
            VStack(alignment: .leading, spacing: 4) {
                Text(tenant.name)
                Text(tenant.slug)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .listStyle(.plain)
    }

    @ViewBuilder
    private var metricsTimeline: some View {
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

    @ViewBuilder
    private var reviewEventList: some View {
        ForEach(reviewTriggerEvents.prefix(5)) { item in
            Text(item.summary)
                .font(.caption)
        }
    }
}
