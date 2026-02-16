import SwiftUI

@main
struct BlackBoltOperatorApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var lock = OperatorLock()
    @StateObject private var runtime = OperatorRuntimeConfig()

    var body: some Scene {
        WindowGroup {
            Group {
                // Temporary 1.0 visibility bypass; re-enable lock after UI validation.
                OperatorRootView()
                    .environmentObject(runtime)
            }
            .frame(minWidth: 960, minHeight: 640)
            .onChange(of: scenePhase) { _, newPhase in
                lock.onScenePhaseChange(newPhase)
            }
        }
    }
}
