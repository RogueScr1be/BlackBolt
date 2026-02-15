import AppKit
import SwiftUI

struct OperatorLockView: View {
    @ObservedObject var lock: OperatorLock

    private var canSubmit: Bool {
        switch lock.mode {
        case .setPasscode:
            return OperatorLock.isValidPasscode(lock.passcodeInput)
                && OperatorLock.isValidPasscode(lock.confirmInput)
                && lock.passcodeInput == lock.confirmInput
        case .unlock:
            return OperatorLock.isValidPasscode(lock.passcodeInput)
        }
    }

    var body: some View {
        VStack(spacing: 20) {
            VStack(spacing: 6) {
                Text("Black Bolt")
                    .font(.title)
                    .fontWeight(.semibold)
                Text("Operator Console")
                    .foregroundColor(.secondary)
            }

            VStack(alignment: .leading, spacing: 12) {
                if lock.mode == .setPasscode {
                    SecureField("Set passcode (4-8 digits)", text: $lock.passcodeInput)
                    SecureField("Confirm passcode", text: $lock.confirmInput)
                } else {
                    SecureField("Passcode", text: $lock.passcodeInput)
                }
            }

            if let errorMessage = lock.errorMessage {
                Text(errorMessage)
                    .foregroundColor(.red)
                    .font(.callout)
            }

            HStack {
                Button("Reset") {
                    // Local recovery path: hold Option key while clicking.
                    if NSEvent.modifierFlags.contains(.option) {
                        lock.resetPasscodeForRecovery()
                    }
                }
                .font(.caption)
                .help("Hold Option while clicking to reset local passcode.")

                Spacer()

                Button(lock.mode == .setPasscode ? "Set Passcode" : "Unlock") {
                    if lock.mode == .setPasscode {
                        lock.setPasscode(passcode: lock.passcodeInput, confirm: lock.confirmInput)
                    } else {
                        lock.unlock(passcode: lock.passcodeInput)
                    }
                }
                .keyboardShortcut(.defaultAction)
                .disabled(!canSubmit)
            }
        }
        .padding(24)
        .frame(minWidth: 420, maxWidth: 460)
    }
}
