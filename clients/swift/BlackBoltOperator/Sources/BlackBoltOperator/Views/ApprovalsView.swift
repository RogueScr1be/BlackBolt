import SwiftUI

struct ApprovalsView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @ObservedObject var store: OperatorShellStore
    @State private var subject: String = ""
    @State private var bodyText: String = ""
    @State private var segment: String = "last_seen_90_365"
    @State private var sendWindowAt: String = ""
    @State private var rejectReason: String = "Rejected by operator"

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Button("Reload") {
                    Task { await store.reloadApprovals(runtime: runtime) }
                }
                .disabled(store.isLoading || !store.hasRequiredSettings(runtime: runtime))
                if let selected = store.selectedApproval {
                    Text("Selected: \(selected.id)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                } else {
                    Text("Select an approval to inspect or edit")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            if case .degraded(let error) = approvalsContentState {
                Text("Approvals list is partially degraded: \(error.message)")
                    .font(.caption)
                    .foregroundColor(.orange)
            }

            HStack(alignment: .top, spacing: 16) {
                GroupBox("Approval Queue") {
                    switch approvalsContentState {
                    case .loading:
                        ProgressView("Loading approvals...")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    case .failed(let error):
                        Text(error.message)
                            .font(.caption)
                            .foregroundColor(.red)
                    case .empty:
                        Text("No approvals are awaiting review.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    case .degraded, .ready:
                        approvalsList
                    }
                }
                .frame(minWidth: 280)

                GroupBox("Approval Detail") {
                    if let selected = store.selectedApproval {
                        VStack(alignment: .leading, spacing: 10) {
                            TextField("Subject", text: $subject)
                                .textFieldStyle(.roundedBorder)

                            TextEditor(text: $bodyText)
                                .frame(minHeight: 140)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 6)
                                        .stroke(Color.secondary.opacity(0.3))
                                )

                            HStack {
                                Picker("Segment", selection: $segment) {
                                    Text("last_seen_90_365").tag("last_seen_90_365")
                                    Text("volume").tag("volume")
                                    Text("gentle").tag("gentle")
                                }
                                .frame(width: 220)

                                TextField("Send window (ISO)", text: $sendWindowAt)
                                    .textFieldStyle(.roundedBorder)
                            }

                            GroupBox("Counts") {
                                Text("Queued: \(selected.counts.queued)")
                                    .font(.caption)
                                Text("Paused: \(selected.counts.paused)")
                                    .font(.caption)
                                Text("Sent: \(selected.counts.sent)")
                                    .font(.caption)
                                Text("Failed: \(selected.counts.failed)")
                                    .font(.caption)
                                Text("Total: \(selected.counts.total)")
                                    .font(.caption)
                            }

                            HStack {
                                Button("Save Draft") {
                                    Task {
                                        await store.patchApprovalDraft(
                                            runtime: runtime,
                                            approvalId: selected.id,
                                            subject: subject,
                                            body: bodyText,
                                            segment: segment,
                                            sendWindowAt: sendWindowAt
                                        )
                                    }
                                }
                                .disabled(actionButtonsDisabled)

                                Button("Approve") {
                                    Task { await store.approveSelectedApproval(runtime: runtime, approvalId: selected.id) }
                                }
                                .buttonStyle(.borderedProminent)
                                .disabled(actionButtonsDisabled)

                                TextField("Reject reason", text: $rejectReason)
                                    .textFieldStyle(.roundedBorder)
                                    .frame(maxWidth: 260)

                                Button("Reject") {
                                    Task {
                                        await store.rejectSelectedApproval(
                                            runtime: runtime,
                                            approvalId: selected.id,
                                            reason: rejectReason
                                        )
                                    }
                                }
                                .disabled(actionButtonsDisabled)
                            }
                        }
                    } else if case .loading = approvalsContentState {
                        ProgressView("Loading selected approval...")
                    } else {
                        Text("Choose an approval from the queue to review the draft and take action.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .topLeading)
            }
        }
        .padding()
        .task {
            await store.reloadApprovals(runtime: runtime)
        }
        .onChange(of: store.selectedApproval?.id) {
            if let detail = store.selectedApproval {
                syncFromDetail(detail)
            }
        }
    }

    private var approvalsContentState: OperatorContentState {
        store.contentState(for: store.approvalsState, hasContent: !store.approvalQueue.isEmpty)
    }

    private var actionButtonsDisabled: Bool {
        store.selectedApproval == nil || store.isLoading || !store.hasRequiredSettings(runtime: runtime)
    }

    @ViewBuilder
    private var approvalsList: some View {
        List(store.approvalQueue) { item in
            Button {
                Task {
                    await store.loadApprovalDetail(runtime: runtime, approvalId: item.id)
                    if let detail = store.selectedApproval {
                        syncFromDetail(detail)
                    }
                }
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.subject)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .lineLimit(1)
                    Text(item.state.replacingOccurrences(of: "_", with: " ").capitalized)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
        }
        .listStyle(.plain)
    }

    private func syncFromDetail(_ detail: OperatorApprovalDetail) {
        subject = detail.draft.subject
        bodyText = detail.draft.body
        segment = detail.draft.segment
        sendWindowAt = detail.draft.sendWindowAt ?? ""
    }
}
