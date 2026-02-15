import SwiftUI

struct CustomersListView: View {
    @State private var rows: [CustomerRow] = []
    @State private var tenantId = "tenant-demo"
    @State private var segment = ""
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                TextField("Tenant ID", text: $tenantId)
                TextField("Segment (0_90,90_365,365_plus)", text: $segment)
                Button("Fetch") {
                    Task { await fetchCustomers() }
                }
            }
            if let errorMessage {
                Text(errorMessage).foregroundColor(.red)
            }
            List(rows) { row in
                VStack(alignment: .leading) {
                    Text(row.email).font(.headline)
                    Text("segment: \(row.segment)  name: \(row.displayName ?? "-")")
                        .font(.caption)
                }
            }
        }
        .padding()
    }

    private func fetchCustomers() async {
        do {
            var components = URLComponents(string: "http://localhost:3000/v1/tenants/\(tenantId)/customers")!
            if !segment.isEmpty {
                components.queryItems = [URLQueryItem(name: "segment", value: segment)]
            }

            var req = URLRequest(url: components.url!)
            req.addValue(tenantId, forHTTPHeaderField: "x-tenant-id")
            req.addValue("operator", forHTTPHeaderField: "x-user-id")
            let (data, _) = try await URLSession.shared.data(for: req)
            let decoded = try JSONDecoder().decode(CustomersPage.self, from: data)
            rows = decoded.items
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
