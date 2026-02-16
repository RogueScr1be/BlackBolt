import SwiftUI

@main
struct BlackBoltOperatorApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var lock = OperatorLock()
    @StateObject private var runtime = OperatorRuntimeConfig()
    private let lockEnabled = ProcessInfo.processInfo.environment["OPERATOR_LOCK_ENABLED"] == "1"

    var body: some Scene {
        WindowGroup {
            Group {
                if lockEnabled && lock.isLocked {
                    OperatorLockView(lock: lock)
                } else {
                    OperatorRootView()
                        .environmentObject(runtime)
                }
            }
            .preferredColorScheme(.dark)
            .frame(minWidth: 960, minHeight: 640)
            .onChange(of: scenePhase) { _, newPhase in
                lock.onScenePhaseChange(newPhase)
            }
        }
    }
}
