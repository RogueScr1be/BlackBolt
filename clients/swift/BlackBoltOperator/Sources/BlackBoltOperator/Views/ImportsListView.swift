import SwiftUI
import UniformTypeIdentifiers

struct ImportsListView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @ObservedObject var store: OperatorShellStore
    @State private var isImportPickerPresented = false
    @State private var selectedImportId: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Button("Upload Revenue CSV") {
                    isImportPickerPresented = true
                }
                .disabled(store.isLoading || !store.hasRequiredSettings(runtime: runtime))

                Button("Refresh Imports") {
                    Task { await store.listRevenueImports(runtime: runtime) }
                }
                .disabled(store.isLoading || !store.hasRequiredSettings(runtime: runtime))

                Spacer()
                Text("Tenant: \(runtime.tenantId)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            HStack(alignment: .top, spacing: 14) {
                GroupBox("Recent Revenue Imports") {
                    if case .failed(let stateError) = store.revenueImportsState {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(stateError.message)
                                .font(.caption)
                                .foregroundColor(.red)
                            Button("Retry") {
                                Task { await store.listRevenueImports(runtime: runtime) }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    } else if store.revenueImports.isEmpty {
                        Text("No revenue imports yet.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        List(store.revenueImports, selection: $selectedImportId) { item in
                            VStack(alignment: .leading, spacing: 3) {
                                Text(item.revenueImportId)
                                    .font(.caption)
                                    .lineLimit(1)
                                Text("\(item.status.uppercased())  \(item.processedRows)/\(item.totalRows) rows")
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                                Text("ok \(item.succeededRows)  fail \(item.failedRows)  dup \(item.duplicateRows)")
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                            }
                            .tag(item.revenueImportId)
                        }
                    }
                }

                GroupBox("Import Detail") {
                    if let selectedImportId {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text(selectedImportId)
                                    .font(.caption)
                                    .lineLimit(1)
                                Spacer()
                                Button("Refresh Status") {
                                    Task { await store.getRevenueImportStatus(runtime: runtime, importId: selectedImportId) }
                                }
                            }

                            if let status = store.revenueImportStatus, status.revenueImportId == selectedImportId {
                                Text("Status: \(status.status.uppercased())")
                                    .font(.caption)
                                Text("Rows: \(status.processedRows)/\(status.totalRows)  ok \(status.succeededRows)  fail \(status.failedRows)  dup \(status.duplicateRows)")
                                    .font(.caption2)
                                    .foregroundColor(.secondary)

                                if status.errors.isEmpty {
                                    Text("No row-level errors.")
                                        .font(.caption2)
                                        .foregroundColor(.secondary)
                                } else {
                                    List(status.errors.prefix(20)) { item in
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text("Row \(item.rowNum) • \(item.code)")
                                                .font(.caption2)
                                                .fontWeight(.semibold)
                                            Text(item.message)
                                                .font(.caption2)
                                                .foregroundColor(.secondary)
                                        }
                                    }
                                }
                            } else if case .failed(let stateError) = store.revenueImportStatusState {
                                Text(stateError.message)
                                    .font(.caption)
                                    .foregroundColor(.red)
                            } else {
                                Text("Select an import to load status details.")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        Text("Select a revenue import to inspect row errors.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
        .padding()
        .onAppear {
            Task { await store.listRevenueImports(runtime: runtime) }
        }
        .onChange(of: selectedImportId) {
            guard let selectedImportId else { return }
            Task { await store.getRevenueImportStatus(runtime: runtime, importId: selectedImportId) }
        }
        .fileImporter(
            isPresented: $isImportPickerPresented,
            allowedContentTypes: [.commaSeparatedText, .plainText],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let urls):
                guard let fileURL = urls.first else { return }
                Task { await store.createRevenueImport(runtime: runtime, fileURL: fileURL) }
            case .failure:
                break
            }
        }
    }
}
