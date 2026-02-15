import SwiftUI

@MainActor
final class OperatorLock: ObservableObject {
    enum LockMode {
        case setPasscode
        case unlock
    }

    @Published var isLocked = true
    @Published var mode: LockMode = .setPasscode
    @Published var errorMessage: String?
    @Published var passcodeInput = ""
    @Published var confirmInput = ""

    init() {
        do {
            if try Keychain.readPasscode() == nil {
                mode = .setPasscode
            } else {
                mode = .unlock
            }
            isLocked = true
        } catch {
            mode = .setPasscode
            isLocked = true
            errorMessage = "Keychain unavailable; set passcode again."
        }
    }

    func setPasscode(passcode: String, confirm: String) {
        errorMessage = nil
        guard Self.isValidPasscode(passcode) else {
            errorMessage = "Passcode must be 4-8 digits."
            return
        }
        guard passcode == confirm else {
            errorMessage = "Passcodes do not match."
            return
        }
        do {
            try Keychain.writePasscode(passcode)
            passcodeInput = ""
            confirmInput = ""
            mode = .unlock
            isLocked = false
        } catch {
            errorMessage = "Failed to store passcode."
        }
    }

    func unlock(passcode: String) {
        errorMessage = nil
        do {
            guard let stored = try Keychain.readPasscode() else {
                mode = .setPasscode
                errorMessage = "No passcode set. Create one."
                return
            }
            guard passcode == stored else {
                errorMessage = "Incorrect passcode."
                return
            }
            passcodeInput = ""
            confirmInput = ""
            isLocked = false
            mode = .unlock
        } catch {
            errorMessage = "Failed to read passcode."
        }
    }

    func lock() {
        isLocked = true
        errorMessage = nil
        passcodeInput = ""
        confirmInput = ""
    }

    func onScenePhaseChange(_ phase: ScenePhase) {
        if phase != .active {
            lock()
        }
    }

    func resetPasscodeForRecovery() {
        do {
            try Keychain.deletePasscode()
            mode = .setPasscode
            lock()
        } catch {
            errorMessage = "Failed to reset passcode."
        }
    }

    static func isValidPasscode(_ value: String) -> Bool {
        guard value.count >= 4, value.count <= 8 else {
            return false
        }
        return value.allSatisfy(\.isNumber)
    }
}
