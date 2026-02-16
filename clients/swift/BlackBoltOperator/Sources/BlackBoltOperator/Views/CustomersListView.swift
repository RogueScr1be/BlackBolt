import SwiftUI

struct CustomersListView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @State private var rows: [CustomerRow] = []
    @State private var segment = ""
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                TextField("Segment (0_90,90_365,365_plus)", text: $segment)
                Button("Fetch") {
                    Task { await fetchCustomers() }
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
            var req = try runtime.request(path: "/v1/tenants/\(runtime.tenantId)/customers")
            guard let url = req.url, var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
                throw URLError(.badURL)
            }
            if !segment.isEmpty {
                components.queryItems = [URLQueryItem(name: "segment", value: segment)]
            }
            req.url = components.url

            let (data, response) = try await URLSession.shared.data(for: req)
            try ensureSuccess(response: response, data: data)
            let decoded = try JSONDecoder().decode(CustomersPage.self, from: data)
            rows = decoded.items
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
