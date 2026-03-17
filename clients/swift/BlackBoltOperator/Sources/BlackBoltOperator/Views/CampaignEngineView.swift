import SwiftUI

struct CampaignEngineView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @ObservedObject var store: OperatorShellStore

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Campaign Runs")
                    .font(.title3)
                    .fontWeight(.semibold)
                Spacer()
                Button("Refresh Runs") {
                    Task { await store.reloadCampaignRuns(runtime: runtime) }
                }
                .disabled(!store.hasRequiredSettings(runtime: runtime) || store.isLoading)
            }

            GroupBox("Operator Controls") {
                Text("Campaign policy remains backend-owned. Use this screen to inspect run state and pause or resume runs when the API exposes that capability.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            if case .degraded(let error) = campaignRunsContentState {
                Text("Campaign run data is partially degraded: \(error.message)")
                    .font(.caption)
                    .foregroundColor(.orange)
            }

            GroupBox("Active + Recent Runs") {
                switch campaignRunsContentState {
                case .loading:
                    ProgressView("Loading campaign runs...")
                        .frame(maxWidth: .infinity, alignment: .leading)
                case .failed(let error):
                    VStack(alignment: .leading, spacing: 8) {
                        Text(error.message)
                            .font(.caption)
                            .foregroundColor(.red)
                        Button("Retry Runs") {
                            Task { await store.reloadCampaignRuns(runtime: runtime) }
                        }
                        .disabled(!store.hasRequiredSettings(runtime: runtime) || store.isLoading)
                    }
                case .empty:
                    Text("No campaign runs yet.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                case .degraded, .ready:
                    runList
                }
            }
            if let error = store.lastError, store.campaignRunsState == .failed(error) {
                HStack {
                    Text(error.message)
                        .font(.caption)
                        .foregroundColor(.red)
                    Spacer()
                    Button("Retry") {
                        Task { await store.reloadCampaignRuns(runtime: runtime) }
                    }
                    .disabled(!store.hasRequiredSettings(runtime: runtime) || store.isLoading)
                }
            }
            Spacer()
        }
        .padding(16)
    }

    private var campaignRunsContentState: OperatorContentState {
        store.contentState(for: store.campaignRunsState, hasContent: !store.campaignRuns.isEmpty)
    }

    @ViewBuilder
    private var runList: some View {
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
                    .disabled(!store.hasRequiredSettings(runtime: runtime) || store.isLoading)
                } else if run.status == "RUNNING" || run.status == "QUEUED" {
                    Button("Pause") {
                        Task { await store.setCampaignRunPaused(runtime: runtime, runId: run.id, paused: true) }
                    }
                    .disabled(!store.hasRequiredSettings(runtime: runtime) || store.isLoading)
                }
            }
        }
    }
}
