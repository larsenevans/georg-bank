import Foundation

struct WidgetSnapshot: Codable, Equatable {
    var version: Int
    var updatedAt: String
    var profile: Profile
    var money: Money
    var dailyLimit: DailyLimit
    var settings: Settings
    var deepLink: DeepLink

    struct Profile: Codable, Equatable {
        var displayName: String
        var gender: String
        var greetingStyle: String
    }

    struct LastPayment: Codable, Equatable {
        var id: String
        var amountCents: Int
        var label: String
        var createdAt: String
    }

    struct Money: Codable, Equatable {
        var currency: String
        var balanceCents: Int
        var lastPayment: LastPayment?
    }

    struct DailyLimit: Codable, Equatable {
        var limitCents: Int
        var usedCents: Int
        var remainingCents: Int
        var windowEndsAt: String
    }

    struct Settings: Codable, Equatable {
        var notificationsEnabled: Bool
        var notifyOnPayment: Bool
        var notifyOnLimit80: Bool
        var notifyOnLimit100: Bool
        var widgetTheme: String
        var showBalance: Bool
        var showLastPayment: Bool
        var showDailyLimit: Bool
        var compactMode: Bool
    }

    struct DeepLink: Codable, Equatable {
        var openPohyby: String
        var openDashboard: String
        var openSettings: String
    }

    static let placeholder = WidgetSnapshot(
        version: 1,
        updatedAt: ISO8601DateFormatter().string(from: Date()),
        profile: Profile(displayName: "Business účet L", gender: "male", greetingStyle: "informal"),
        money: Money(
            currency: "EUR",
            balanceCents: 666_000,
            lastPayment: LastPayment(
                id: "demo",
                amountCents: -12_500,
                label: "Demo platba",
                createdAt: ISO8601DateFormatter().string(from: Date())
            )
        ),
        dailyLimit: DailyLimit(
            limitCents: 666_000,
            usedCents: 12_500,
            remainingCents: 653_500,
            windowEndsAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(86_400))
        ),
        settings: Settings(
            notificationsEnabled: false,
            notifyOnPayment: true,
            notifyOnLimit80: true,
            notifyOnLimit100: true,
            widgetTheme: "dark",
            showBalance: true,
            showLastPayment: true,
            showDailyLimit: true,
            compactMode: false
        ),
        deepLink: DeepLink(
            openPohyby: "george://pohyby",
            openDashboard: "george://dashboard2",
            openSettings: "george://settings/widget"
        )
    )
}

enum WidgetSnapshotStore {
    static func defaults() -> UserDefaults? {
        UserDefaults(suiteName: AppGroupConstants.suiteName)
    }

    static func load() -> WidgetSnapshot? {
        guard let defaults = defaults(),
              let data = defaults.data(forKey: AppGroupConstants.snapshotKey) else {
            return nil
        }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }

    static func loadOrPlaceholder() -> WidgetSnapshot {
        load() ?? .placeholder
    }

    static func save(_ snapshot: WidgetSnapshot) throws {
        guard let defaults = defaults() else {
            throw NSError(
                domain: "WidgetSnapshotStore",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "App Group UserDefaults unavailable"]
            )
        }
        let data = try JSONEncoder().encode(snapshot)
        defaults.set(data, forKey: AppGroupConstants.snapshotKey)
    }

    static func saveJSONString(_ json: String) throws {
        guard let data = json.data(using: .utf8) else {
            throw NSError(
                domain: "WidgetSnapshotStore",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "Invalid UTF-8 JSON"]
            )
        }
        let snapshot = try JSONDecoder().decode(WidgetSnapshot.self, from: data)
        try save(snapshot)
    }
}
