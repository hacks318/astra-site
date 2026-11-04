import Foundation
import Security
import SwiftUI

private enum AstraStyle {
    static let background = Color(red: 8.0 / 255, green: 10.0 / 255, blue: 18.0 / 255)
    static let panel = Color(red: 17.0 / 255, green: 18.0 / 255, blue: 28.0 / 255)
    static let purple = Color(red: 180.0 / 255, green: 147.0 / 255, blue: 250.0 / 255)
    static let blue = Color(red: 115.0 / 255, green: 204.0 / 255, blue: 1)
    static let muted = Color(red: 153.0 / 255, green: 152.0 / 255, blue: 170.0 / 255)
}

private enum AIProvider: String, CaseIterable, Identifiable {
    case astra
    case ollama
    case openAI = "openai"

    var id: String { rawValue }
    var title: String {
        switch self {
        case .astra: "Astra"
        case .ollama: "Ollama"
        case .openAI: "API compatível"
        }
    }
    var defaultEndpoint: String {
        switch self {
        case .astra: "http://192.168.1.3:8080/v1"
        case .ollama: ""
        case .openAI: "https://api.openai.com/v1"
        }
    }
    var defaultModel: String {
        self == .openAI ? "gpt-4o-mini" : "qwen2.5:3b"
    }
}

private struct ChatMessage: Identifiable {
    let id = UUID()
    let role: String
    let content: String
}

private struct AISettings {
    let provider: AIProvider
    let endpoint: String
    let model: String
    let apiKey: String

    static func load() -> AISettings {
        let defaults = UserDefaults.standard
        let savedProvider = AIProvider(rawValue: defaults.string(forKey: "astra.provider") ?? "") ?? .astra
        let savedPrefix = savedProvider.rawValue
        let savedEndpoint = defaults.string(forKey: "astra.\(savedPrefix).endpoint") ?? savedProvider.defaultEndpoint
        let migrateToAstra = savedProvider == .ollama &&
            ["", "http://127.0.0.1:11434", "http://localhost:11434"]
                .contains(savedEndpoint.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
        let provider = migrateToAstra ? AIProvider.astra : savedProvider
        let prefix = provider.rawValue
        let endpoint = provider == .astra && savedProvider == .ollama
            ? provider.defaultEndpoint
            : defaults.string(forKey: "astra.\(prefix).endpoint") ?? provider.defaultEndpoint
        return AISettings(
            provider: provider,
            endpoint: endpoint,
            model: defaults.string(forKey: "astra.\(prefix).model") ?? provider.defaultModel,
            apiKey: KeychainStore.read() ?? ""
        )
    }
}

@main
struct AstraApp: App {
    var body: some Scene {
        WindowGroup {
            AstraView()
                .preferredColorScheme(.dark)
        }
    }
}

private struct AstraView: View {
    @State private var messages: [ChatMessage] = []
    @State private var input = ""
    @AppStorage("astra.education-mode") private var educationMode = false
    @State private var showingSettings = false
    @State private var isSending = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(Color.white.opacity(0.08))

            HStack(spacing: 8) {
                Circle()
                    .fill(Color(red: 139.0 / 255, green: 216.0 / 255, blue: 168.0 / 255))
                    .frame(width: 7, height: 7)
                Text("Pronta para conversar")
                    .font(.caption)
                    .foregroundStyle(AstraStyle.muted)
                Spacer()
                Button {
                    educationMode.toggle()
                } label: {
                    HStack(spacing: 6) {
                        Text("◇")
                        Text(educationMode ? "Educação ativa" : "Modo Educação")
                    }
                    .font(.caption.weight(.medium))
                    .foregroundStyle(educationMode ? AstraStyle.blue : Color(red: 188.0 / 255, green: 184.0 / 255, blue: 202.0 / 255))
                    .padding(.horizontal, 10)
                    .frame(height: 34)
                    .background(educationMode ? Color.blue.opacity(0.12) : AstraStyle.panel)
                    .overlay {
                        RoundedRectangle(cornerRadius: 9)
                            .stroke(educationMode ? AstraStyle.blue.opacity(0.55) : Color(red: 52.0 / 255, green: 48.0 / 255, blue: 68.0 / 255), lineWidth: 1)
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 9))
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(Color.red.opacity(0.85))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 8)
            }

            if messages.isEmpty {
                welcome
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(messages) { message in
                                messageBubble(message).id(message.id)
                            }
                            if isSending {
                                HStack {
                                    ProgressView().tint(AstraStyle.purple)
                                    Text("A Astra está pensando...").font(.caption).foregroundStyle(AstraStyle.muted)
                                    Spacer()
                                }
                                .padding(.horizontal, 20)
                            }
                        }
                        .padding(.vertical, 16)
                    }
                    .onChange(of: messages.count) { _, _ in
                        if let last = messages.last { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }
            }

            composer
        }
        .background(AstraStyle.background.ignoresSafeArea())
        .sheet(isPresented: $showingSettings) {
            SettingsView()
        }
    }

    private var header: some View {
        HStack {
            Image("AstraLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 132, height: 40, alignment: .leading)
            Spacer()
            Button {
                messages.removeAll()
                errorMessage = nil
            } label: {
                Image(systemName: "plus.message")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(AstraStyle.purple)
                    .frame(width: 38, height: 42)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Nova conversa")
            Button { showingSettings = true } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 19, weight: .medium))
                    .foregroundStyle(AstraStyle.muted)
                    .frame(width: 42, height: 42)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Configurações")
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
        .padding(.bottom, 10)
    }

    private var welcome: some View {
        VStack(spacing: 14) {
            Spacer()
            AstraOrb()
                .frame(width: 190, height: 190)
            Text(educationMode ? "APRENDER A SE PROTEGER" : "SUA ASSISTENTE, DO SEU JEITO")
                .font(.system(size: 9, weight: .bold, design: .default))
                .tracking(1.8)
                .foregroundStyle(educationMode ? AstraStyle.blue : Color(red: 155.0 / 255, green: 139.0 / 255, blue: 189.0 / 255))
            Text(welcomeTitle)
                .font(.system(size: 28, weight: .semibold))
                .multilineTextAlignment(.center)
            Text(educationMode
                 ? "Aprenda a reconhecer golpes, proteger suas contas e ensinar segurança digital com responsabilidade."
                 : "Estou aqui para conversar, ajudar com ideias ou simplesmente fazer companhia.")
                .font(.subheadline)
                .foregroundStyle(AstraStyle.muted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 310)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 9) {
                    ForEach(Array(suggestions.enumerated()), id: \.offset) { _, suggestion in
                        Button {
                            send(suggestion.prompt)
                        } label: {
                            HStack(spacing: 6) {
                                Text(educationMode ? "◇" : "✳")
                                Text(suggestion.title)
                            }
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(educationMode ? AstraStyle.blue : AstraStyle.purple)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 10)
                                .background(educationMode ? Color(red: 17.0 / 255, green: 28.0 / 255, blue: 40.0 / 255) : Color(red: 16.0 / 255, green: 17.0 / 255, blue: 27.0 / 255))
                                .overlay {
                                    RoundedRectangle(cornerRadius: 8)
                                        .stroke(educationMode ? Color(red: 53.0 / 255, green: 80.0 / 255, blue: 106.0 / 255) : Color(red: 40.0 / 255, green: 38.0 / 255, blue: 56.0 / 255), lineWidth: 1)
                                }
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                    }
                }
                .padding(.horizontal, 20)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.vertical, 6)
    }

    private var composer: some View {
        VStack(spacing: 0) {
            HStack(alignment: .bottom, spacing: 10) {
                TextField("Escreva uma mensagem...", text: $input, axis: .vertical)
                    .lineLimit(1...5)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(AstraStyle.panel)
                    .clipShape(RoundedRectangle(cornerRadius: 13))
                    .disabled(isSending)
                    .onSubmit { send(input) }

                Button { send(input) } label: {
                    Group {
                        if isSending {
                            ProgressView().tint(Color.black)
                        } else {
                            Image(systemName: "arrow.up").font(.system(size: 16, weight: .bold))
                        }
                    }
                    .foregroundStyle(Color.black)
                    .frame(width: 46, height: 46)
                    .background(AstraStyle.purple)
                    .clipShape(RoundedRectangle(cornerRadius: 13))
                }
                .disabled(isSending || input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("Enviar mensagem")
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 4)
            .background(AstraStyle.background)

            Text("A Astra pode cometer erros. Confira informações importantes.")
                .font(.system(size: 10))
                .foregroundStyle(AstraStyle.muted)
                .frame(maxWidth: .infinity)
                .padding(.bottom, 10)
                .background(AstraStyle.background)
        }
    }

    private func messageBubble(_ message: ChatMessage) -> some View {
        HStack {
            if message.role == "assistant" {
                Image("AstraMark")
                    .resizable()
                    .scaledToFit()
                    .padding(5)
                    .frame(width: 27, height: 27)
                    .background(Color(red: 39.0 / 255, green: 26.0 / 255, blue: 59.0 / 255))
                    .clipShape(RoundedRectangle(cornerRadius: 9))
            } else {
                Spacer(minLength: 38)
            }
            Text(message.content)
                .font(.subheadline)
                .lineSpacing(4)
                .foregroundStyle(Color(red: 226.0 / 255, green: 223.0 / 255, blue: 236.0 / 255))
                .padding(.horizontal, 14)
                .padding(.vertical, 11)
                .frame(maxWidth: 320, alignment: .leading)
                .background(message.role == "user" ? Color(red: 23.0 / 255, green: 22.0 / 255, blue: 36.0 / 255) : AstraStyle.panel)
                .overlay {
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(message.role == "user" ? Color(red: 51.0 / 255, green: 48.0 / 255, blue: 71.0 / 255) : Color(red: 36.0 / 255, green: 36.0 / 255, blue: 50.0 / 255), lineWidth: 1)
                }
                .clipShape(RoundedRectangle(cornerRadius: 12))
            if message.role == "assistant" {
                Spacer(minLength: 26)
            }
        }
        .padding(.horizontal, 20)
    }

    private var suggestions: [(title: String, prompt: String)] {
        if educationMode {
            return [
                ("Reconhecer phishing", "Explique como reconhecer uma tentativa de phishing com exemplos fictícios e dicas seguras para alunos."),
                ("Preparar uma aula", "Monte um plano de aula de 30 minutos sobre segurança de senhas e autenticação em duas etapas para adolescentes, com objetivo, atividade e perguntas de revisão."),
                ("Fazer um quiz", "Crie um quiz de 5 perguntas para alunos sobre privacidade e segurança digital. Use situações fictícias e inclua o gabarito explicado no final.")
            ]
        }
        return [
            ("Organizar meu dia", "Me ajude a organizar meu dia"),
            ("Uma curiosidade", "Me conte uma curiosidade interessante"),
            ("Uma ideia criativa", "Me ajude a ter uma ideia criativa")
        ]
    }

    private var welcomeTitle: AttributedString {
        if educationMode {
            return AttributedString("Segurança digital\nsem mistério.")
        }
        var title = AttributedString("Oi, eu sou a Astra.")
        if let range = title.range(of: "Astra.") {
            title[range].foregroundColor = AstraStyle.purple
        }
        return title
    }

    private func send(_ text: String) {
        let content = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty, !isSending else { return }
        let settings = AISettings.load()
        input = ""
        errorMessage = nil
        messages.append(ChatMessage(role: "user", content: content))
        isSending = true

        Task {
            defer { isSending = false }
            do {
                let reply = try await AstraClient.reply(
                    settings: settings,
                    history: Array(messages.suffix(10)),
                    educationMode: educationMode
                )
                messages.append(ChatMessage(role: "assistant", content: reply))
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

private struct AstraOrb: View {
    @State private var isPulsing = false

    var body: some View {
        ZStack {
            Circle()
                .fill(Color.purple.opacity(0.11))
                .frame(width: 188, height: 188)
                .blur(radius: 12)
            Circle()
                .fill(Color.purple.opacity(0.07))
                .frame(width: 158, height: 158)
                .overlay {
                    Circle()
                        .stroke(Color(red: 190.0 / 255, green: 155.0 / 255, blue: 1).opacity(0.42), lineWidth: 1)
                }
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color(red: 243.0 / 255, green: 217.0 / 255, blue: 1),
                            Color(red: 205.0 / 255, green: 161.0 / 255, blue: 1),
                            Color(red: 153.0 / 255, green: 102.0 / 255, blue: 251.0 / 255),
                            Color(red: 88.0 / 255, green: 52.0 / 255, blue: 174.0 / 255),
                            Color(red: 17.0 / 255, green: 16.0 / 255, blue: 29.0 / 255)
                        ],
                        center: UnitPoint(x: 0.34, y: 0.29),
                        startRadius: 2,
                        endRadius: 65
                    )
                )
                .frame(width: 112, height: 112)
                .overlay(alignment: .topLeading) {
                    Ellipse()
                        .fill(Color.white.opacity(0.42))
                        .frame(width: 34, height: 14)
                        .blur(radius: 8)
                        .offset(x: 24, y: 18)
                }
                .shadow(color: AstraStyle.purple.opacity(0.38), radius: 25)
                .scaleEffect(isPulsing ? 1.06 : 0.96)
        }
        .frame(width: 190, height: 190)
        .onAppear {
            withAnimation(.easeInOut(duration: 1.8).repeatForever(autoreverses: true)) {
                isPulsing = true
            }
        }
        .accessibilityLabel("Esfera luminosa da Astra")
    }
}

private struct SettingsDraft {
    var provider: AIProvider
    var astraEndpoint: String
    var astraModel: String
    var ollamaEndpoint: String
    var ollamaModel: String
    var apiEndpoint: String
    var apiModel: String

    init() {
        let defaults = UserDefaults.standard
        let savedProvider = AIProvider(rawValue: defaults.string(forKey: "astra.provider") ?? "") ?? .astra
        let savedOllamaEndpoint = defaults.string(forKey: "astra.ollama.endpoint") ?? AIProvider.ollama.defaultEndpoint
        let migrateToAstra = savedProvider == .ollama &&
            ["", "http://127.0.0.1:11434", "http://localhost:11434"]
                .contains(savedOllamaEndpoint.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
        provider = migrateToAstra ? .astra : savedProvider
        astraEndpoint = defaults.string(forKey: "astra.astra.endpoint") ?? AIProvider.astra.defaultEndpoint
        astraModel = defaults.string(forKey: "astra.astra.model") ?? AIProvider.astra.defaultModel
        ollamaEndpoint = ["http://127.0.0.1:11434", "http://localhost:11434"].contains(savedOllamaEndpoint.trimmingCharacters(in: CharacterSet(charactersIn: "/"))) ? "" : savedOllamaEndpoint
        ollamaModel = defaults.string(forKey: "astra.ollama.model") ?? AIProvider.ollama.defaultModel
        apiEndpoint = defaults.string(forKey: "astra.openai.endpoint") ?? AIProvider.openAI.defaultEndpoint
        apiModel = defaults.string(forKey: "astra.openai.model") ?? AIProvider.openAI.defaultModel
    }

    var endpoint: String {
        get {
            switch provider {
            case .astra: astraEndpoint
            case .ollama: ollamaEndpoint
            case .openAI: apiEndpoint
            }
        }
        set {
            switch provider {
            case .astra: astraEndpoint = newValue
            case .ollama: ollamaEndpoint = newValue
            case .openAI: apiEndpoint = newValue
            }
        }
    }
    var model: String {
        get {
            switch provider {
            case .astra: astraModel
            case .ollama: ollamaModel
            case .openAI: apiModel
            }
        }
        set {
            switch provider {
            case .astra: astraModel = newValue
            case .ollama: ollamaModel = newValue
            case .openAI: apiModel = newValue
            }
        }
    }
}

private struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var draft = SettingsDraft()
    @State private var apiKey = ""
    @State private var removeKey = false
    @State private var validationError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Provedor de IA") {
                    Text("Astra usa o modelo próprio no computador conectado à rede. Mantenha o PC ligado e os aparelhos no mesmo Wi-Fi.")
                        .font(.footnote)
                        .foregroundStyle(AstraStyle.muted)
                    Picker("Provedor", selection: $draft.provider) {
                        ForEach(AIProvider.allCases) { provider in
                            Text(provider.title).tag(provider)
                        }
                    }
                    .pickerStyle(.segmented)
                    TextField(
                        draft.provider == .astra ? "http://192.168.1.3:8080/v1" : draft.provider == .ollama ? "http://192.168.1.20:11434" : "Endereço do servidor",
                        text: $draft.endpoint
                    )
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    if draft.provider != .astra {
                        TextField("Modelo instalado", text: $draft.model)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }

                    if draft.provider == .astra {
                        Text("API própria da Astra, sem chave. Endereço padrão deste computador: http://192.168.1.3:8080/v1. iPhone e computador precisam estar no mesmo Wi-Fi, com o PC ligado e o Ollama ativo.")
                            .font(.footnote)
                            .foregroundStyle(AstraStyle.muted)
                    } else if draft.provider == .ollama {
                        Text("No computador, permita conexões do Ollama pela rede local. Informe o IP do computador e a porta 11434 (ex.: http://192.168.1.20:11434), além de um modelo instalado. iPhone e computador precisam estar no mesmo Wi-Fi. 127.0.0.1 aponta para o próprio iPhone. Não exponha o Ollama à internet.")
                            .font(.footnote)
                            .foregroundStyle(AstraStyle.muted)
                    } else if draft.provider == .openAI {
                        SecureField("Chave da API", text: $apiKey)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        Toggle("Remover chave salva", isOn: $removeKey)
                    }
                }

                Section {
                    Text("O endereço e o modelo de cada provedor são guardados separadamente neste aparelho. A chave da API fica no Keychain protegido deste aparelho. O histórico do chat não é salvo.")
                        .font(.footnote)
                        .foregroundStyle(AstraStyle.muted)
                }

                if let validationError {
                    Section {
                        Text(validationError).foregroundStyle(.red)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(AstraStyle.background)
            .navigationTitle("Conectar sua IA")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvar") { save() }.fontWeight(.semibold)
                }
            }
        }
        .tint(AstraStyle.purple)
    }

    private func save() {
        let endpoint = draft.endpoint.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: endpoint),
              let scheme = url.scheme?.lowercased(),
              ["http", "https"].contains(scheme),
              url.host != nil else {
            validationError = "Informe um endereço http:// ou https:// válido."
            return
        }
        if draft.provider == .astra, !isPrivateIPv4(url.host ?? "") {
            validationError = "A API própria da Astra só aceita um endereço IPv4 privado da rede local."
            return
        }
        if draft.provider == .ollama, ["localhost", "127.0.0.1", "::1"].contains(url.host?.lowercased() ?? "") {
            validationError = "127.0.0.1 é o próprio iPhone. Informe o IP local do computador que está rodando o Ollama."
            return
        }
        guard !draft.model.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            validationError = "Informe o nome do modelo."
            return
        }
        if draft.provider == .astra, scheme != "http" {
            validationError = "Na rede local, use o endereço HTTP do servidor Astra."
            return
        }
        if draft.provider == .openAI {
            guard scheme == "https" else {
                validationError = "Use HTTPS para proteger sua chave da API."
                return
            }
            guard removeKey || !apiKey.isEmpty || KeychainStore.read() != nil else {
                validationError = "Informe a chave da API."
                return
            }
        }

        if removeKey {
            KeychainStore.delete()
        } else if !apiKey.isEmpty, !KeychainStore.save(apiKey) {
            validationError = "Não foi possível guardar a chave com segurança neste aparelho."
            return
        }
        let defaults = UserDefaults.standard
        defaults.set(draft.provider.rawValue, forKey: "astra.provider")
        defaults.set(draft.astraEndpoint.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/")), forKey: "astra.astra.endpoint")
        defaults.set(draft.astraModel.trimmingCharacters(in: .whitespacesAndNewlines), forKey: "astra.astra.model")
        defaults.set(draft.ollamaEndpoint.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/")), forKey: "astra.ollama.endpoint")
        defaults.set(draft.ollamaModel.trimmingCharacters(in: .whitespacesAndNewlines), forKey: "astra.ollama.model")
        defaults.set(draft.apiEndpoint.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/")), forKey: "astra.openai.endpoint")
        defaults.set(draft.apiModel.trimmingCharacters(in: .whitespacesAndNewlines), forKey: "astra.openai.model")
        dismiss()
    }
}

private enum AstraClient {
    static func reply(settings: AISettings, history: [ChatMessage], educationMode: Bool) async throws -> String {
        let endpoint = settings.endpoint.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !endpoint.isEmpty else {
            let hint: String
            switch settings.provider {
            case .astra:
                hint = "Confira se o computador da Astra está ligado no mesmo Wi-Fi."
            case .ollama:
                hint = "Configure o endereço do Ollama em Ajustes usando o IP local do computador."
            case .openAI:
                hint = "Configure o endereço da API em Ajustes."
            }
            throw AstraError.message(hint)
        }
        let path = settings.provider == .ollama ? "/api/chat" : "/chat/completions"
        guard let url = URL(string: endpoint + path) else {
            throw AstraError.message("O endereço do servidor é inválido.")
        }
        if settings.provider == .astra, !isPrivateIPv4(url.host ?? "") {
            throw AstraError.message("A API própria da Astra só pode ser acessada em um endereço IPv4 privado da rede local.")
        }
        if settings.provider == .ollama, ["localhost", "127.0.0.1", "::1"].contains(url.host?.lowercased() ?? "") {
            throw AstraError.message("127.0.0.1 aponta para o próprio iPhone. Em Ajustes > Ollama, informe o IP do computador (ex.: http://192.168.1.20:11434). Os dois aparelhos precisam estar no mesmo Wi-Fi e o Ollama deve aceitar conexões da rede local.")
        }
        if settings.provider == .astra, url.scheme != "http" {
            throw AstraError.message("Na rede local, use o endereço HTTP do servidor Astra.")
        }
        if settings.provider == .openAI, url.scheme != "https" {
            throw AstraError.message("Use HTTPS para proteger sua chave da API.")
        }
        if settings.provider == .openAI, settings.apiKey.isEmpty {
            throw AstraError.message("Configure a chave da API nas configurações.")
        }

        var prompt = "Você é Astra, uma assistente prestativa e acolhedora. Responda em português brasileiro, com clareza e sem inventar detalhes."
        if educationMode {
            prompt += "\n\nModo Educação: ensine segurança digital defensiva com situações fictícias e linguagem apropriada. Priorize identificar phishing, golpes, proteção de contas, privacidade e autenticação em duas etapas. Crie atividades seguras, quizzes e planos de aula. Não peça senhas, códigos de verificação, links suspeitos nem dados pessoais. Não ensine invasões, malware, roubo de credenciais ou evasão de proteções; recuse brevemente e redirecione para prevenção."
        }
        let apiMessages: [[String: String]] =
            [["role": "system", "content": prompt]] +
            history.map { ["role": $0.role, "content": String($0.content.prefix(6000))] }
        let body: [String: Any] = [
            "model": settings.model,
            "messages": apiMessages,
            "stream": false,
            "educationMode": educationMode
        ]
        var request = URLRequest(url: url, timeoutInterval: 90)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if settings.provider == .openAI {
            request.setValue("Bearer \(settings.apiKey)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AstraError.message("O servidor retornou uma resposta inválida.")
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            let detail = String(data: data, encoding: .utf8).map { String($0.prefix(250)) } ?? ""
            throw AstraError.message("O servidor respondeu \(httpResponse.statusCode): \(detail)")
        }
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let content: String?
        if settings.provider == .ollama {
            content = (json?["message"] as? [String: Any])?["content"] as? String
        } else {
            let choices = json?["choices"] as? [[String: Any]]
            content = (choices?.first?["message"] as? [String: Any])?["content"] as? String
        }
        guard let content, !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw AstraError.message("A IA retornou uma resposta vazia.")
        }
        return content
    }
}

private enum AstraError: LocalizedError {
    case message(String)
    var errorDescription: String? {
        if case let .message(text) = self { return text }
        return nil
    }
}

private func isPrivateIPv4(_ host: String) -> Bool {
    let octets = host.split(separator: ".").compactMap { UInt8($0) }
    guard octets.count == 4 else { return false }
    return octets[0] == 10 ||
        (octets[0] == 172 && (16...31).contains(octets[1])) ||
        (octets[0] == 192 && octets[1] == 168)
}

private enum KeychainStore {
    private static let service = "com.astra.assistant.ios"
    private static let account = "api-key"

    static func read() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func save(_ value: String) -> Bool {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            return SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil) == errSecSuccess
        }
        return status == errSecSuccess
    }

    static func delete() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }
}

private struct AstraButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(AstraStyle.background)
            .padding(.horizontal, 16)
            .padding(.vertical, 11)
            .background(AstraStyle.purple.opacity(configuration.isPressed ? 0.75 : 1))
            .clipShape(RoundedRectangle(cornerRadius: 11))
    }
}
