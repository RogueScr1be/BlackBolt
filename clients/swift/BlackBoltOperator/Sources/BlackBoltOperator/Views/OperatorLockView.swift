import AppKit
import SwiftUI

struct OperatorLockView: View {
    private enum Field: Hashable {
        case passcode
        case confirm
    }

    @ObservedObject var lock: OperatorLock
    @FocusState private var focusedField: Field?

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
                Text(lock.mode == .setPasscode ? "Set Passcode" : "Unlock")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            VStack(alignment: .leading, spacing: 12) {
                if lock.mode == .setPasscode {
                    SecureField("Set passcode (4-8 digits)", text: $lock.passcodeInput)
                        .focused($focusedField, equals: .passcode)
                    SecureField("Confirm passcode", text: $lock.confirmInput)
                        .focused($focusedField, equals: .confirm)
                } else {
                    SecureField("Passcode", text: $lock.passcodeInput)
                        .focused($focusedField, equals: .passcode)
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
        .contentShape(Rectangle())
        .onTapGesture {
            focusPrimaryField()
        }
        .onAppear {
            focusPrimaryField()
        }
        .onChange(of: lock.mode) { _, _ in
            focusPrimaryField()
        }
    }

    private func focusPrimaryField() {
        DispatchQueue.main.async {
            focusedField = .passcode
        }
    }
}
