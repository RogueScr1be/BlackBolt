import XCTest
import Security

@testable import BlackBoltOperator

final class KeychainTests: BaseOperatorTestCase {
    var keychain: MockKeychain!

    override func setUp() {
        super.setUp()
        keychain = MockKeychain()
    }

    override func tearDown() {
        super.tearDown()
        Task {
            await keychain.reset()
        }
    }

    // MARK: - Create/Add Tests

    func testAddValidCredential() async throws {
        let account = "test-user"
        let service = "BlackBoltOperator"
        let password = Data("test-password".utf8)

        let status = await keychain.add(
            password: password,
            for: account,
            service: service
        )

        XCTAssertEqual(status, errSecSuccess)
        
        let exists = await keychain.exists(account: account, service: service)
        XCTAssertTrue(exists)
    }

    func testAddDuplicateCredential() async throws {
        let account = "test-user"
        let service = "BlackBoltOperator"
        let password = Data("test-password".utf8)

        // Add first time
        let firstStatus = await keychain.add(
            password: password,
            for: account,
            service: service
        )
        XCTAssertEqual(firstStatus, errSecSuccess)

        // Try to add duplicate
        let duplicateStatus = await keychain.add(
            password: password,
            for: account,
            service: service
        )
        XCTAssertNotEqual(duplicateStatus, errSecSuccess)
    }

    func testAddMultipleCredentials() async throws {
        let credentials = [
            ("user1", "service1", "pass1"),
            ("user2", "service2", "pass2"),
            ("user3", "service3", "pass3")
        ]

        for (account, service, password) in credentials {
            let status = await keychain.add(
                password: Data(password.utf8),
                for: account,
                service: service
            )
            XCTAssertEqual(status, errSecSuccess)
        }

        let itemCount = await keychain.itemCount()
        XCTAssertEqual(itemCount, 3)
    }

    func testAddWithDifferentLengthPasswords() async throws {
        let testCases = [
            ("user1", "a"),           // 1 char
            ("user2", "ab"),          // 2 chars
            ("user3", String(repeating: "x", count: 1000)),  // 1000 chars
        ]

        for (account, password) in testCases {
            let status = await keychain.add(
                password: Data(password.utf8),
                for: account,
                service: "TestService"
            )
            XCTAssertEqual(status, errSecSuccess)
        }
    }

    func testAddCredentialWithSpecialCharacters() async throws {
        let specialPasswords = [
            "!@#$%^&*()",
            "パスワード",
            "🔐🔑🗝️",
            "\n\t\r",
        ]

        for (index, password) in specialPasswords.enumerated() {
            let status = await keychain.add(
                password: Data(password.utf8),
                for: "user-\(index)",
                service: "TestService"
            )
            XCTAssertEqual(status, errSecSuccess)
        }
    }

    // MARK: - Read/Retrieve Tests

    func testRetrieveValidCredential() async throws {
        let account = "test-user"
        let service = "BlackBoltOperator"
        let expectedPassword = Data("test-password".utf8)

        let addStatus = await keychain.add(
            password: expectedPassword,
            for: account,
            service: service
        )
        XCTAssertEqual(addStatus, errSecSuccess)

        let (status, password) = await keychain.retrieve(account: account, service: service)
        XCTAssertEqual(status, errSecSuccess)
        XCTAssertEqual(password, expectedPassword)
    }

    func testRetrieveNonexistentCredential() async throws {
        let (status, password) = await keychain.retrieve(
            account: "nonexistent",
            service: "NonexistentService"
        )
        XCTAssertNotEqual(status, errSecSuccess)
        XCTAssertNil(password)
    }

    func testRetrieveAllCredentials() async throws {
        let credentials = [
            ("user1", "password1"),
            ("user2", "password2"),
            ("user3", "password3")
        ]

        for (account, password) in credentials {
            let status = await keychain.add(
                password: Data(password.utf8),
                for: account,
                service: "CommonService"
            )
            XCTAssertEqual(status, errSecSuccess)
        }

        let (status, items) = await keychain.retrieveAll(service: "CommonService")
        XCTAssertEqual(status, errSecSuccess)
        XCTAssertEqual(items.count, 3)
    }

    func testRetrieveWithDifferentServices() async throws {
        await keychain.add(password: Data("pass1".utf8), for: "user1", service: "Service1")
        await keychain.add(password: Data("pass2".utf8), for: "user1", service: "Service2")

        let (status1, password1) = await keychain.retrieve(account: "user1", service: "Service1")
        let (status2, password2) = await keychain.retrieve(account: "user1", service: "Service2")

        XCTAssertEqual(status1, errSecSuccess)
        XCTAssertEqual(status2, errSecSuccess)
        XCTAssertEqual(password1, Data("pass1".utf8))
        XCTAssertEqual(password2, Data("pass2".utf8))
    }

    // MARK: - Update Tests

    func testUpdateValidCredential() async throws {
        let account = "test-user"
        let service = "BlackBoltOperator"
        let originalPassword = Data("original".utf8)
        let newPassword = Data("updated".utf8)

        // Add original
        let addStatus = await keychain.add(
            password: originalPassword,
            for: account,
            service: service
        )
        XCTAssertEqual(addStatus, errSecSuccess)

        // Update
        let updateStatus = await keychain.update(
            password: newPassword,
            for: account,
            service: service
        )
        XCTAssertEqual(updateStatus, errSecSuccess)

        // Verify update
        let (status, password) = await keychain.retrieve(account: account, service: service)
        XCTAssertEqual(status, errSecSuccess)
        XCTAssertEqual(password, newPassword)
    }

    func testUpdateNonexistentCredential() async throws {
        let status = await keychain.update(
            password: Data("new".utf8),
            for: "nonexistent",
            service: "NonexistentService"
        )
        XCTAssertNotEqual(status, errSecSuccess)
    }

    func testUpdateWithLongerPassword() async throws {
        let account = "test"
        let service = "TestService"

        await keychain.add(password: Data("short".utf8), for: account, service: service)

        let longPassword = String(repeating: "x", count: 5000)
        let updateStatus = await keychain.update(
            password: Data(longPassword.utf8),
            for: account,
            service: service
        )
        XCTAssertEqual(updateStatus, errSecSuccess)
    }

    // MARK: - Delete Tests

    func testDeleteValidCredential() async throws {
        let account = "test-user"
        let service = "BlackBoltOperator"

        let addStatus = await keychain.add(
            password: Data("password".utf8),
            for: account,
            service: service
        )
        XCTAssertEqual(addStatus, errSecSuccess)

        let deleteStatus = await keychain.delete(account: account, service: service)
        XCTAssertEqual(deleteStatus, errSecSuccess)

        let exists = await keychain.exists(account: account, service: service)
        XCTAssertFalse(exists)
    }

    func testDeleteNonexistentCredential() async throws {
        let status = await keychain.delete(account: "nonexistent", service: "NonexistentService")
        XCTAssertNotEqual(status, errSecSuccess)
    }

    func testDeleteDoesNotAffectOthers() async throws {
        await keychain.add(password: Data("pass1".utf8), for: "user1", service: "Service")
        await keychain.add(password: Data("pass2".utf8), for: "user2", service: "Service")

        let deleteStatus = await keychain.delete(account: "user1", service: "Service")
        XCTAssertEqual(deleteStatus, errSecSuccess)

        let user2Exists = await keychain.exists(account: "user2", service: "Service")
        XCTAssertTrue(user2Exists)
    }

    // MARK: - Expiration Tests

    func testSetExpirationDate() async throws {
        let account = "test-user"
        let service = "TestService"

        await keychain.add(password: Data("password".utf8), for: account, service: service)

        let futureDate = Date().addingTimeInterval(3600) // 1 hour from now
        let status = await keychain.setExpiration(
            for: account,
            service: service,
            date: futureDate
        )
        XCTAssertEqual(status, errSecSuccess)

        let exists = await keychain.exists(account: account, service: service)
        XCTAssertTrue(exists)
    }

    func testExpiredCredentialNotRetrievable() async throws {
        let account = "test-user"
        let service = "TestService"

        await keychain.add(password: Data("password".utf8), for: account, service: service)

        let pastDate = Date().addingTimeInterval(-3600) // 1 hour ago
        await keychain.setExpiration(for: account, service: service, date: pastDate)

        let (status, password) = await keychain.retrieve(account: account, service: service)
        XCTAssertNotEqual(status, errSecSuccess)
        XCTAssertNil(password)
    }

    func testClearExpiredItems() async throws {
        // Add non-expired item
        await keychain.add(password: Data("active".utf8), for: "active-user", service: "Service")

        // Add expired item
        await keychain.add(password: Data("expired".utf8), for: "expired-user", service: "Service")
        await keychain.setExpiration(
            for: "expired-user",
            service: "Service",
            date: Date().addingTimeInterval(-1)
        )

        let clearedCount = await keychain.clearExpiredItems()
        XCTAssertEqual(clearedCount, 1)

        let activeExists = await keychain.exists(account: "active-user", service: "Service")
        XCTAssertTrue(activeExists)

        let expiredExists = await keychain.exists(account: "expired-user", service: "Service")
        XCTAssertFalse(expiredExists)
    }

    // MARK: - Access Control Tests

    func testDenyAccessToAccount() async throws {
        let account = "restricted-user"
        let service = "TestService"

        await keychain.add(password: Data("password".utf8), for: account, service: service)
        await keychain.denyAccess(to: account)

        let (status, _) = await keychain.retrieve(account: account, service: service)
        XCTAssertNotEqual(status, errSecSuccess)
    }

    func testAllowAccessAfterDenial() async throws {
        let account = "restricted-user"
        let service = "TestService"

        await keychain.add(password: Data("password".utf8), for: account, service: service)
        await keychain.denyAccess(to: account)
        await keychain.allowAccess(to: account)

        let (status, password) = await keychain.retrieve(account: account, service: service)
        XCTAssertEqual(status, errSecSuccess)
        XCTAssertEqual(password, Data("password".utf8))
    }

    // MARK: - Concurrent Access Tests

    func testConcurrentAdds() async throws {
        let accounts = (0..<10).map { "user-\($0)" }

        await withTaskGroup(of: Void.self) { group in
            for account in accounts {
                group.addTask {
                    let status = await self.keychain.add(
                        password: Data("password".utf8),
                        for: account,
                        service: "ConcurrentService"
                    )
                    XCTAssertEqual(status, errSecSuccess)
                }
            }
        }

        let count = await keychain.itemCount()
        XCTAssertEqual(count, 10)
    }

    func testConcurrentReads() async throws {
        // Setup
        for i in 0..<5 {
            await keychain.add(
                password: Data("password-\(i)".utf8),
                for: "user-\(i)",
                service: "Service"
            )
        }

        // Concurrent reads
        await withTaskGroup(of: Void.self) { group in
            for i in 0..<5 {
                group.addTask {
                    let (status, _) = await self.keychain.retrieve(
                        account: "user-\(i)",
                        service: "Service"
                    )
                    XCTAssertEqual(status, errSecSuccess)
                }
            }
        }
    }

    // MARK: - State Inspection Tests

    func testItemCount() async throws {
        let initialCount = await keychain.itemCount()
        XCTAssertEqual(initialCount, 0)

        for i in 0..<5 {
            await keychain.add(
                password: Data("pass".utf8),
                for: "user-\(i)",
                service: "Service"
            )
        }

        let finalCount = await keychain.itemCount()
        XCTAssertEqual(finalCount, 5)
    }

    func testListAccounts() async throws {
        let service = "TestService"
        let accounts = ["alice", "bob", "charlie"]

        for account in accounts {
            await keychain.add(
                password: Data("password".utf8),
                for: account,
                service: service
            )
        }

        let listedAccounts = await keychain.accounts(for: service)
        XCTAssertEqual(Set(listedAccounts), Set(accounts))
    }

    // MARK: - Error Simulation Tests

    func testErrorSimulation() async throws {
        await keychain.enableErrorSimulation()

        let status = await keychain.add(
            password: Data("password".utf8),
            for: "test-user",
            service: "TestService"
        )
        XCTAssertNotEqual(status, errSecSuccess)

        await keychain.disableErrorSimulation()

        let successStatus = await keychain.add(
            password: Data("password".utf8),
            for: "test-user-2",
            service: "TestService"
        )
        XCTAssertEqual(successStatus, errSecSuccess)
    }

    // MARK: - Integration Tests

    func testCompleteLifecycle() async throws {
        let account = "lifecycle-test"
        let service = "LifecycleService"
        let initialPassword = Data("initial".utf8)
        let updatedPassword = Data("updated".utf8)

        // Create
        var status = await keychain.add(
            password: initialPassword,
            for: account,
            service: service
        )
        XCTAssertEqual(status, errSecSuccess)

        // Read
        var (retrieveStatus, password) = await keychain.retrieve(account: account, service: service)
        XCTAssertEqual(retrieveStatus, errSecSuccess)
        XCTAssertEqual(password, initialPassword)

        // Update
        status = await keychain.update(
            password: updatedPassword,
            for: account,
            service: service
        )
        XCTAssertEqual(status, errSecSuccess)

        // Verify update
        (retrieveStatus, password) = await keychain.retrieve(account: account, service: service)
        XCTAssertEqual(retrieveStatus, errSecSuccess)
        XCTAssertEqual(password, updatedPassword)

        // Delete
        status = await keychain.delete(account: account, service: service)
        XCTAssertEqual(status, errSecSuccess)

        // Verify deletion
        let exists = await keychain.exists(account: account, service: service)
        XCTAssertFalse(exists)
    }

    // MARK: - Edge Case Tests

    func testEmptyPassword() async throws {
        let status = await keychain.add(
            password: Data(),
            for: "empty-password-user",
            service: "Service"
        )
        XCTAssertEqual(status, errSecSuccess)

        let (retrieveStatus, password) = await keychain.retrieve(
            account: "empty-password-user",
            service: "Service"
        )
        XCTAssertEqual(retrieveStatus, errSecSuccess)
        XCTAssertEqual(password, Data())
    }

    func testLargePassword() async throws {
        let largePassword = Data(repeating: 0xFF, count: 1_000_000) // 1MB

        let status = await keychain.add(
            password: largePassword,
            for: "large-password-user",
            service: "Service"
        )
        XCTAssertEqual(status, errSecSuccess)

        let (retrieveStatus, password) = await keychain.retrieve(
            account: "large-password-user",
            service: "Service"
        )
        XCTAssertEqual(retrieveStatus, errSecSuccess)
        XCTAssertEqual(password, largePassword)
    }
}
