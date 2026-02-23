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
                if let selected = store.selectedApproval {
                    Text("Selected: \(selected.id)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                } else {
                    Text("Select an approval to edit")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            HStack(alignment: .top, spacing: 16) {
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
                .frame(minWidth: 280)
                .listStyle(.plain)

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

                    HStack {
                        Button("Save Draft") {
                            guard let selected = store.selectedApproval else { return }
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

                        Button("Approve") {
                            guard let selected = store.selectedApproval else { return }
                            Task { await store.approveSelectedApproval(runtime: runtime, approvalId: selected.id) }
                        }
                        .buttonStyle(.borderedProminent)

                        TextField("Reject reason", text: $rejectReason)
                            .textFieldStyle(.roundedBorder)
                            .frame(maxWidth: 260)

                        Button("Reject") {
                            guard let selected = store.selectedApproval else { return }
                            Task {
                                await store.rejectSelectedApproval(
                                    runtime: runtime,
                                    approvalId: selected.id,
                                    reason: rejectReason
                                )
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .topLeading)
            }
        }
        .padding()
        .task {
            await store.reloadApprovals(runtime: runtime)
        }
        .onChange(of: store.selectedApproval?.id) { _ in
            if let detail = store.selectedApproval {
                syncFromDetail(detail)
            }
        }
    }

    private func syncFromDetail(_ detail: OperatorApprovalDetail) {
        subject = detail.draft.subject
        bodyText = detail.draft.body
        segment = detail.draft.segment
        sendWindowAt = detail.draft.sendWindowAt ?? ""
    }
}
