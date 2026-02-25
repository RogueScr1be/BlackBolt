import SwiftUI

struct CampaignEngineView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @ObservedObject var store: OperatorShellStore

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Runs")
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

            GroupBox("Campaign Runs") {
                if store.campaignRuns.isEmpty {
                    Text("No campaign runs yet.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                } else {
                    ForEach(store.campaignRuns.prefix(12)) { run in
                        HStack(spacing: 8) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(run.id)
                                    .font(.caption.monospaced())
                                Text("status: \(run.status) queued/sent/failed: \(run.messagesQueued)/\(run.messagesSent)/\(run.messagesFailed)")
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                                if let error = run.lastErrorMessage, !error.isEmpty {
                                    Text(error)
                                        .font(.caption2)
                                        .foregroundColor(.red)
                                }
                            }
                            Spacer()
                            if run.status == "PAUSED" {
                                Button("Resume") {
                                    Task { await store.setCampaignRunPaused(runtime: runtime, runId: run.id, paused: false) }
                                }
                                .disabled(store.connectionState == .invalidConfig || store.isLoading)
                            } else if run.status == "RUNNING" || run.status == "QUEUED" {
                                Button("Pause") {
                                    Task { await store.setCampaignRunPaused(runtime: runtime, runId: run.id, paused: true) }
                                }
                                .disabled(store.connectionState == .invalidConfig || store.isLoading)
                            }
                        }
                    }
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
