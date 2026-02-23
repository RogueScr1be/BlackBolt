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

            Text("Settings save automatically.")
                .font(.caption)
                .foregroundColor(.secondary)

            GroupBox("Onboarding") {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Run `npm run tenant:seed -- --name=\"Your Tenant\" --slug=your-tenant` to generate tenant id and operator key.")
                        .font(.caption)
                    Text("Use tenantId as x-tenant-id and operatorKey as x-operator-key.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            GroupBox("Bootstrap Status") {
                if let status = store.bootstrapStatus {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(status.overallReady ? "Ready" : "Setup incomplete")
                            .font(.caption)
                            .foregroundColor(status.overallReady ? .green : .orange)
                        BootstrapCheckRow(title: "Operator auth", check: status.checks.operatorAuth)
                        BootstrapCheckRow(title: "GBP integration", check: status.checks.gbpIntegration)
                        BootstrapCheckRow(title: "Postmark webhook", check: status.checks.postmarkWebhook)
                        BootstrapCheckRow(title: "Review scheduler", check: status.checks.reviewScheduler)
                        BootstrapCheckRow(title: "Send mode", check: status.checks.sendMode)

                        if !status.missing.isEmpty {
                            Text("Missing required checks: \(status.missing.joined(separator: ", "))")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                } else {
                    Text("Run Smoke Test or press Refresh Bootstrap to load readiness checks.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            HStack {
                Button("Smoke Test") {
                    Task { await store.runSmokeTest(runtime: runtime) }
                }
                .disabled(!store.hasRequiredSettings(runtime: runtime) || store.isLoading)

                Button("Refresh Bootstrap") {
                    Task { await store.loadBootstrapStatus(runtime: runtime) }
                }
                .disabled(!store.hasRequiredSettings(runtime: runtime) || store.isLoading)

                if let smoke = store.smoke {
                    Text(smoke.overallPassed ? "Smoke passed" : "Smoke failed")
                        .font(.caption)
                        .foregroundColor(smoke.overallPassed ? .green : .red)
                }
            }

            GroupBox("Diagnostics") {
                VStack(alignment: .leading, spacing: 4) {
                    if let smoke = store.smoke {
                        Text("Last smoke: \(smoke.overallPassed ? "passed" : "failed")")
                            .font(.caption)
                    } else {
                        Text("Last smoke: not run yet")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    if let failure = store.latestFailedDiagnostic {
                        Text("Latest failed endpoint: \(failure.path)")
                            .font(.caption)
                        Text("Status: \(failure.statusCode.map(String.init) ?? "n/a") at \(failure.timestamp.formatted(date: .omitted, time: .standard))")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    } else {
                        Text("Latest failed endpoint: none")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
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
        .onAppear {
            store.reconcileConfig(runtime: runtime)
            if store.hasRequiredSettings(runtime: runtime) {
                Task { await store.loadBootstrapStatus(runtime: runtime) }
            }
        }
        .onChange(of: runtime.apiBaseURL) {
            store.reconcileConfig(runtime: runtime)
            if store.hasRequiredSettings(runtime: runtime) {
                Task { await store.loadBootstrapStatus(runtime: runtime) }
            }
        }
        .onChange(of: runtime.tenantId) {
            store.reconcileConfig(runtime: runtime)
            if store.hasRequiredSettings(runtime: runtime) {
                Task { await store.loadBootstrapStatus(runtime: runtime) }
            }
        }
        .onChange(of: runtime.operatorKey) {
            store.reconcileConfig(runtime: runtime)
            if store.hasRequiredSettings(runtime: runtime) {
                Task { await store.loadBootstrapStatus(runtime: runtime) }
            }
        }
        .onChange(of: runtime.authHeader) {
            if store.hasRequiredSettings(runtime: runtime) {
                Task { await store.loadBootstrapStatus(runtime: runtime) }
            }
        }
    }

    private var buildSHA: String {
        if let value = Bundle.main.object(forInfoDictionaryKey: "BlackBoltBuildSHA") as? String, !value.isEmpty {
            return value
        }
        return ProcessInfo.processInfo.environment["BUILD_SHA"] ?? "unknown"
    }
}

private struct BootstrapCheckRow: View {
    let title: String
    let check: BootstrapStatusCheck

    var body: some View {
        HStack(alignment: .top, spacing: 6) {
            Text(check.ready ? "OK" : "Missing")
                .font(.caption2.weight(.semibold))
                .foregroundColor(check.ready ? .green : .orange)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption)
                Text(check.message)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
    }
}
