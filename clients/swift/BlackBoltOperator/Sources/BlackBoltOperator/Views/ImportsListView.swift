import SwiftUI

struct ImportsListView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @State private var rows: [ImportStatusRow] = []
    @State private var importId = ""
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                TextField("Import ID", text: $importId)
                Button("Fetch") {
                    Task { await fetchImport() }
                }
            }
            Text("Tenant: \(runtime.tenantId)")
                .font(.caption)
                .foregroundColor(.secondary)
            if let errorMessage {
                Text(errorMessage).foregroundColor(.red)
            }
            List(rows) { row in
                VStack(alignment: .leading) {
                    Text(row.importId).font(.headline)
                    Text("status: \(row.status)  processed: \(row.processedRows)/\(row.totalRows)  failed: \(row.failedRows)")
                        .font(.caption)
                }
            }
        }
        .padding()
    }

    private func fetchImport() async {
        guard !importId.isEmpty else { return }
        do {
            let req = try runtime.request(path: "/v1/imports/\(importId)")
            let (data, response) = try await URLSession.shared.data(for: req)
            try ensureSuccess(response: response, data: data)
            let decoded = try JSONDecoder().decode(ImportStatusRow.self, from: data)
            rows = [decoded]
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func ensureSuccess(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        guard (200 ... 299).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw NSError(
                domain: "OperatorHTTPError",
                code: http.statusCode,
                userInfo: [NSLocalizedDescriptionKey: "HTTP \(http.statusCode): \(body)"]
            )
        }
    }
}
