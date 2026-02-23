import SwiftUI

struct ReviewQueueView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @ObservedObject var store: OperatorShellStore
    @State private var stateFilter: String = "all"

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Picker("State", selection: $stateFilter) {
                    Text("All").tag("all")
                    Text("New").tag("new")
                    Text("Classified").tag("classified")
                    Text("Awaiting").tag("awaiting_approval")
                    Text("Scheduled").tag("scheduled")
                    Text("Sent").tag("sent")
                }
                .pickerStyle(.segmented)

                Button("Reload") {
                    Task { await store.reloadReviewQueue(runtime: runtime, state: stateFilter) }
                }
            }

            if case .failed(let error) = store.reviewQueueState {
                Text(error.message)
                    .font(.caption)
                    .foregroundColor(.red)
            }

            List(store.reviewQueue) { item in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(item.state.replacingOccurrences(of: "_", with: " ").capitalized)
                            .font(.caption2)
                            .foregroundColor(.secondary)
                        Spacer()
                        Text(item.tenantId)
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }

                    Text("Review \(item.reviewId)")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                    Text("Rating: \(item.rating ?? 0) · Confidence: \(String(format: "%.2f", item.confidence))")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    if let service = item.serviceMentioned {
                        Text("Service: \(service)")
                            .font(.caption)
                    }
                    if let benefit = item.keyBenefit {
                        Text("Benefit: \(benefit)")
                            .font(.caption)
                    }
                    if let approvalId = item.approvalId {
                        Button("Open Approval") {
                            Task { await store.loadApprovalDetail(runtime: runtime, approvalId: approvalId) }
                        }
                        .font(.caption)
                    }
                }
                .padding(.vertical, 6)
            }
            .listStyle(.plain)
        }
        .padding()
        .task {
            await store.reloadReviewQueue(runtime: runtime, state: stateFilter)
        }
    }
}
