import Foundation
import XCTest
import Security

@testable import BlackBoltOperator

// MARK: - Mock Keychain Item

struct MockKeychainItem {
    let account: String
    let service: String
    let password: Data
    let attributes: [String: Any]
    let creationDate: Date
    var expirationDate: Date?
    let accessControl: SecAccessControl?

    var isExpired: Bool {
        guard let expiration = expirationDate else { return false }
        return Date() > expiration
    }

    func matches(query: [String: Any]) -> Bool {
        if let account = query[kSecAttrAccount as String] as? String {
            if self.account != account { return false }
        }

        if let service = query[kSecAttrService as String] as? String {
            if self.service != service { return false }
        }

        if let type = query[kSecClass as String] as? String {
            if type != kSecClassGenericPassword as String { return false }
        }

        return true
    }
}

// MARK: - Mock Keychain

actor MockKeychain {
    private var items: [MockKeychainItem] = []
    private var shouldSimulateErrors: Bool = false
    private var accessDeniedAccounts: Set<String> = []
    private var creationCounter: Int = 0
    private let queue = DispatchQueue(label: "com.test.keychain", attributes: .concurrent)

    // MARK: - Lifecycle

    init() {
        items = []
    }

    func reset() {
        items.removeAll()
        shouldSimulateErrors = false
        accessDeniedAccounts.removeAll()
        creationCounter = 0
    }

    // MARK: - Error Simulation

    func enableErrorSimulation() {
        shouldSimulateErrors = true
    }

    func disableErrorSimulation() {
        shouldSimulateErrors = false
    }

    func denyAccess(to account: String) {
        accessDeniedAccounts.insert(account)
    }

    func allowAccess(to account: String) {
        accessDeniedAccounts.remove(account)
    }

    // MARK: - Item Management

    func add(
        password: Data,
        for account: String,
        service: String,
        attributes: [String: Any] = [:],
        expirationDate: Date? = nil,
        accessControl: SecAccessControl? = nil
    ) -> OSStatus {
        if shouldSimulateErrors {
            return Int32(bitPattern: 0x80001002) // errSecDuplicateItem
        }

        if accessDeniedAccounts.contains(account) {
            return Int32(bitPattern: 0x80001000) // errSecUnimplemented
        }

        // Check for duplicates
        if items.contains(where: { $0.account == account && $0.service == service }) {
            return Int32(bitPattern: 0x80001002) // errSecDuplicateItem
        }

        creationCounter += 1
        let item = MockKeychainItem(
            account: account,
            service: service,
            password: password,
            attributes: attributes,
            creationDate: Date(),
            expirationDate: expirationDate,
            accessControl: accessControl
        )
        items.append(item)
        return errSecSuccess
    }

    func update(
        password: Data,
        for account: String,
        service: String
    ) -> OSStatus {
        if shouldSimulateErrors {
            return Int32(bitPattern: 0x80001001) // errSecItemNotFound
        }

        if accessDeniedAccounts.contains(account) {
            return Int32(bitPattern: 0x80001000) // errSecUnimplemented
        }

        guard let index = items.firstIndex(where: { $0.account == account && $0.service == service }) else {
            return Int32(bitPattern: 0x80001001) // errSecItemNotFound
        }

        var item = items[index]
        item = MockKeychainItem(
            account: item.account,
            service: item.service,
            password: password,
            attributes: item.attributes,
            creationDate: item.creationDate,
            expirationDate: item.expirationDate,
            accessControl: item.accessControl
        )
        items[index] = item
        return errSecSuccess
    }

    func delete(
        account: String,
        service: String
    ) -> OSStatus {
        if shouldSimulateErrors {
            return Int32(bitPattern: 0x80001001) // errSecItemNotFound
        }

        if accessDeniedAccounts.contains(account) {
            return Int32(bitPattern: 0x80001000) // errSecUnimplemented
        }

        guard let index = items.firstIndex(where: { $0.account == account && $0.service == service }) else {
            return Int32(bitPattern: 0x80001001) // errSecItemNotFound
        }

        items.remove(at: index)
        return errSecSuccess
    }

    // MARK: - Query Operations

    func retrieve(
        account: String,
        service: String
    ) -> (status: OSStatus, password: Data?) {
        if shouldSimulateErrors {
            return (Int32(bitPattern: 0x80001001), nil) // errSecItemNotFound
        }

        if accessDeniedAccounts.contains(account) {
            return (Int32(bitPattern: 0x80001000), nil) // errSecUnimplemented
        }

        guard let item = items.first(where: { $0.account == account && $0.service == service }) else {
            return (Int32(bitPattern: 0x80001001), nil) // errSecItemNotFound
        }

        if item.isExpired {
            return (Int32(bitPattern: 0x80001001), nil) // errSecItemNotFound (treat expired as not found)
        }

        return (errSecSuccess, item.password)
    }

    func retrieveAll(
        service: String
    ) -> (status: OSStatus, items: [(account: String, password: Data)]) {
        if shouldSimulateErrors {
            return (Int32(bitPattern: 0x80001001), []) // errSecItemNotFound
        }

        let matching = items.filter { $0.service == service && !$0.isExpired }
        let results = matching.map { ($0.account, $0.password) }

        return (errSecSuccess, results)
    }

    func exists(
        account: String,
        service: String
    ) -> Bool {
        guard let item = items.first(where: { $0.account == account && $0.service == service }) else {
            return false
        }

        return !item.isExpired
    }

    // MARK: - State Inspection

    func itemCount() -> Int {
        return items.count
    }

    func allItems() -> [MockKeychainItem] {
        return items
    }

    func accounts(for service: String) -> [String] {
        return items
            .filter { $0.service == service && !$0.isExpired }
            .map { $0.account }
    }

    // MARK: - Expiration Management

    func setExpiration(
        for account: String,
        service: String,
        date: Date
    ) -> OSStatus {
        guard let index = items.firstIndex(where: { $0.account == account && $0.service == service }) else {
            return Int32(bitPattern: 0x80001001) // errSecItemNotFound
        }

        var item = items[index]
        item = MockKeychainItem(
            account: item.account,
            service: item.service,
            password: item.password,
            attributes: item.attributes,
            creationDate: item.creationDate,
            expirationDate: date,
            accessControl: item.accessControl
        )
        items[index] = item
        return errSecSuccess
    }

    func clearExpiredItems() -> Int {
        let countBefore = items.count
        items.removeAll { $0.isExpired }
        return countBefore - items.count
    }

    // MARK: - Test Assertions

    func assertItemExists(
        account: String,
        service: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        if !exists(account: account, service: service) {
            XCTFail("Expected keychain item to exist for account: \(account), service: \(service)", 
                    file: file, line: line)
        }
    }

    func assertItemNotExists(
        account: String,
        service: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        if exists(account: account, service: service) {
            XCTFail("Expected keychain item to not exist for account: \(account), service: \(service)", 
                    file: file, line: line)
        }
    }

    func assertItemCount(
        _ count: Int,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let actual = itemCount()
        if actual != count {
            XCTFail("Expected \(count) keychain items, got \(actual)", file: file, line: line)
        }
    }

    func assertPassword(
        _ expectedPassword: Data,
        for account: String,
        service: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let (status, password) = retrieve(account: account, service: service)
        guard status == errSecSuccess else {
            XCTFail("Failed to retrieve password: \(status)", file: file, line: line)
            return
        }

        guard let actual = password else {
            XCTFail("Retrieved nil password for account: \(account)", file: file, line: line)
            return
        }

        if actual != expectedPassword {
            XCTFail("Password mismatch for account: \(account)", file: file, line: line)
        }
    }
}
