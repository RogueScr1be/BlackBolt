import SwiftUI

struct CampaignEngineView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @ObservedObject var store: OperatorShellStore

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Campaign list")
                .font(.title3)
                .fontWeight(.semibold)

            GroupBox("Trigger Builder") {
                Text("Locked trigger: newly ingested 5-star genuine positive review")
                    .font(.caption)
            }

            GroupBox("Audience Selector") {
                Text("Default: last_seen_90_365")
                    .font(.caption)
                Text("Optional: volume=365_plus, gentle=0_90")
                    .font(.caption)
            }

            GroupBox("Sequence Panel") {
                Text("Constrained template structure with deterministic variant rotation")
                    .font(.caption)
                Text("Subject/opening/CTA are hash(reviewId) % N")
                    .font(.caption)
            }

            GroupBox("Auto-Approval Threshold") {
                Text("Default: >= 0.8")
                    .font(.caption)
                Text("Strict vertical: >= 0.9")
                    .font(.caption)
                Text("Risk flags always route to manual lane")
                    .font(.caption)
            }

            GroupBox("Recent Workflow Activity") {
                ForEach(store.events.prefix(8)) { item in
                    Text("\(item.eventType): \(item.summary)")
                        .font(.caption)
                }
            }
            if let error = store.lastError {
                HStack {
                    Text(error.message)
                        .font(.caption)
                        .foregroundColor(.red)
                    Spacer()
                    Button("Retry") {
                        Task { await store.refresh(runtime: runtime) }
                    }
                    .disabled(store.connectionState == .invalidConfig || store.isLoading)
                }
            }
            Spacer()
        }
        .padding(16)
    }
}
