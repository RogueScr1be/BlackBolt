import SwiftUI

struct ImportsListView: View {
    @State private var rows: [ImportStatusRow] = []
    @State private var tenantId = "tenant-demo"
    @State private var importId = ""
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                TextField("Tenant ID", text: $tenantId)
                TextField("Import ID", text: $importId)
                Button("Fetch") {
                    Task { await fetchImport() }
                }
            }
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
            let url = URL(string: "http://localhost:3000/v1/imports/\(importId)")!
            var req = URLRequest(url: url)
            req.addValue(tenantId, forHTTPHeaderField: "x-tenant-id")
            req.addValue("operator", forHTTPHeaderField: "x-user-id")
            let (data, _) = try await URLSession.shared.data(for: req)
            let decoded = try JSONDecoder().decode(ImportStatusRow.self, from: data)
            rows = [decoded]
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
