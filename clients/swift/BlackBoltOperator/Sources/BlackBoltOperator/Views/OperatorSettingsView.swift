import SwiftUI

struct OperatorSettingsView: View {
    @EnvironmentObject var runtime: OperatorRuntimeConfig
    @ObservedObject var store: OperatorShellStore

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Operator Settings")
                .font(.title3)
                .fontWeight(.semibold)

            Form {
                TextField("API Base URL", text: $runtime.apiBaseURL)
                TextField("Tenant ID", text: $runtime.tenantId)
                TextField("Operator Key (X-Operator-Key)", text: $runtime.operatorKey)
                TextField("Auth Header or user:pass", text: $runtime.authHeader)
            }
            .formStyle(.grouped)

            GroupBox("Onboarding") {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Run `npm run tenant:seed -- --name=\"Your Tenant\" --slug=your-tenant` to generate tenant id and operator key.")
                        .font(.caption)
                    Text("Use tenantId as x-tenant-id and operatorKey as x-operator-key.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            HStack {
                Button("Smoke Test") {
                    Task { await store.runSmokeTest(runtime: runtime) }
                }
                .disabled(store.connectionState == .invalidConfig || store.isLoading)

                if let smoke = store.smoke {
                    Text(smoke.overallPassed ? "Smoke passed" : "Smoke failed")
                        .font(.caption)
                        .foregroundColor(smoke.overallPassed ? .green : .red)
                }
            }

            GroupBox("Build Info") {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Build SHA: \(buildSHA)")
                        .font(.caption)
                    Text("Current API Base URL: \(runtime.apiBaseURL)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(20)
        .frame(minWidth: 580, minHeight: 300)
    }

    private var buildSHA: String {
        if let value = Bundle.main.object(forInfoDictionaryKey: "BlackBoltBuildSHA") as? String, !value.isEmpty {
            return value
        }
        return ProcessInfo.processInfo.environment["BUILD_SHA"] ?? "unknown"
    }
}
