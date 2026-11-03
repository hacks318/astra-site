package com.astra.assistant.mobile

import android.os.Bundle
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private val Background = Color(0xFF080A12)
private val Panel = Color(0xFF11121C)
private val Purple = Color(0xFFB493FA)
private val Muted = Color(0xFF9998AA)
private data class ChatMessage(val role: String, val content: String)
private data class AiSettings(
    val provider: String,
    val endpoint: String,
    val model: String,
    val apiKey: String
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val preferences = getSharedPreferences("astra-mobile", MODE_PRIVATE)
        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    primary = Purple,
                    background = Background,
                    surface = Panel,
                    onBackground = Color(0xFFF3F2FA),
                    onSurface = Color(0xFFF3F2FA)
                )
            ) {
                AstraScreen(preferences)
            }
        }
    }
}

@Composable
private fun AstraScreen(preferences: android.content.SharedPreferences) {
    val messages = remember { mutableStateListOf<ChatMessage>() }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    var input by rememberSaveable { mutableStateOf("") }
    var educationMode by rememberSaveable {
        mutableStateOf(preferences.getBoolean("education-mode", false))
    }
    var settings by remember {
        mutableStateOf(readSettings(preferences))
    }
    var showSettings by rememberSaveable { mutableStateOf(false) }
    var isSending by rememberSaveable { mutableStateOf(false) }
    var error by rememberSaveable { mutableStateOf("") }

    LaunchedEffect(messages.size, isSending) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.lastIndex)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFF111020), Background, Color(0xFF080A12))
                )
            )
            .imePadding()
            .padding(WindowInsets.safeDrawing.asPaddingValues())
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 20.dp, end = 16.dp, top = 14.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(Color(0xFF271A3B), RoundedCornerShape(13.dp)),
                contentAlignment = Alignment.Center
            ) {
                Image(
                    painter = painterResource(R.drawable.astra_mark),
                    contentDescription = null,
                    modifier = Modifier.size(26.dp)
                )
            }
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("astra.", fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Text(if (educationMode) "Aprender a se proteger" else "Sua assistente", color = Muted, fontSize = 11.sp)
            }
            TextButton(onClick = { showSettings = true }) {
                Text("⚙", color = Muted, fontSize = 20.sp)
            }
        }
        Divider(color = Color(0xFF232333))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 13.dp)
                .background(
                    if (educationMode) Color(0xFF142331) else Panel,
                    RoundedCornerShape(13.dp)
                )
                .padding(horizontal = 14.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Modo Educação", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                Text("Segurança digital defensiva", color = Muted, fontSize = 11.sp)
            }
            Switch(
                checked = educationMode,
                onCheckedChange = {
                    educationMode = it
                    preferences.edit().putBoolean("education-mode", it).apply()
                }
            )
        }

        if (messages.isEmpty()) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 22.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Box(
                    modifier = Modifier
                        .size(92.dp)
                        .background(
                            Brush.radialGradient(listOf(Color(0xFFCEB6FF), Color(0xFF6035BD), Color(0xFF19132B))),
                            CircleShape
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Image(
                        painter = painterResource(R.drawable.astra_mark),
                        contentDescription = null,
                        modifier = Modifier.size(54.dp)
                    )
                }
                Spacer(Modifier.height(20.dp))
                Text(
                    if (educationMode) "Segurança digital\nsem mistério."
                    else "Oi, eu sou a Astra.",
                    textAlign = TextAlign.Center,
                    fontSize = 27.sp,
                    fontWeight = FontWeight.SemiBold,
                    lineHeight = 32.sp
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    if (educationMode) "Aprenda a identificar golpes e proteger suas contas."
                    else "Converse, aprenda e tire suas ideias do papel.",
                    color = Muted,
                    textAlign = TextAlign.Center,
                    fontSize = 13.sp,
                    lineHeight = 20.sp
                )
                Spacer(Modifier.height(24.dp))
                if (educationMode) {
                    SuggestionButton("Reconhecer uma mensagem de phishing") {
                        sendEducationPrompt(
                            "Explique como reconhecer uma tentativa de phishing com exemplos fictícios e dicas seguras para alunos.",
                            settings, messages, true, { isSending = it }, { error = it }, scope
                        )
                    }
                    Spacer(Modifier.height(9.dp))
                    SuggestionButton("Preparar uma aula de segurança digital") {
                        sendEducationPrompt(
                            "Monte um plano de aula de 30 minutos sobre segurança de senhas e autenticação em duas etapas para adolescentes, com objetivo, atividade e perguntas de revisão.",
                            settings, messages, true, { isSending = it }, { error = it }, scope
                        )
                    }
                    Spacer(Modifier.height(9.dp))
                    SuggestionButton("Criar um quiz seguro") {
                        sendEducationPrompt(
                            "Crie um quiz de 5 perguntas para alunos sobre privacidade e segurança digital. Use situações fictícias e inclua o gabarito explicado no final.",
                            settings, messages, true, { isSending = it }, { error = it }, scope
                        )
                    }
                } else {
                    SuggestionButton("Me ajude a organizar meu dia") {
                        input = "Me ajude a organizar meu dia"
                    }
                    Spacer(Modifier.height(9.dp))
                    SuggestionButton("Me conte uma curiosidade") {
                        input = "Me conte uma curiosidade interessante"
                    }
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                state = listState,
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 18.dp)
            ) {
                items(messages) { message ->
                    MessageBubble(message)
                }
                if (isSending) {
                    item { Text("A Astra está pensando...", color = Muted, fontSize = 12.sp) }
                }
            }
        }

        if (error.isNotBlank()) {
            Text(
                error,
                color = Color(0xFFFFA9A9),
                fontSize = 12.sp,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp)
            )
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp)
                .padding(bottom = 8.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Panel, RoundedCornerShape(17.dp))
                    .padding(start = 15.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                BasicTextField(
                    value = input,
                    onValueChange = { input = it },
                    modifier = Modifier
                        .weight(1f)
                        .padding(vertical = 10.dp),
                    enabled = !isSending,
                    textStyle = TextStyle(color = Color(0xFFF3F2FA), fontSize = 14.sp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                    decorationBox = { inner ->
                        if (input.isEmpty()) {
                            Text("Escreva para a Astra...", color = Muted, fontSize = 14.sp)
                        }
                        inner()
                    }
                )
                Button(
                    onClick = {
                        val text = input.trim()
                        if (text.isNotEmpty() && !isSending) {
                            input = ""
                            error = ""
                            sendMessage(text, settings, messages, educationMode, { isSending = it }, { error = it }, scope)
                        }
                    },
                    enabled = input.isNotBlank() && !isSending,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Purple, contentColor = Background),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 15.dp, vertical = 10.dp)
                ) {
                    if (isSending) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    } else {
                        Text("↑", fontSize = 19.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
            Text(
                "Não envie senhas, códigos ou dados pessoais. Confira informações importantes.",
                color = Muted,
                fontSize = 10.sp,
                lineHeight = 14.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp, bottom = 2.dp)
            )
        }
    }

    if (showSettings) {
        SettingsDialog(
            initial = settings,
            preferences = preferences,
            onDismiss = { showSettings = false },
            onSave = {
                saveSettings(preferences, it)
                settings = it
                showSettings = false
            }
        )
    }
}

@Composable
private fun SuggestionButton(label: String, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFD8CCF2))
    ) {
        Text(label, fontSize = 12.sp, textAlign = TextAlign.Center)
    }
}

@Composable
private fun MessageBubble(message: ChatMessage) {
    val isUser = message.role == "user"
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
    ) {
        Surface(
            color = if (isUser) Color(0xFF242038) else Panel,
            shape = RoundedCornerShape(
                topStart = 15.dp,
                topEnd = 15.dp,
                bottomEnd = if (isUser) 4.dp else 15.dp,
                bottomStart = if (isUser) 15.dp else 4.dp
            ),
            modifier = Modifier.fillMaxWidth(0.88f)
        ) {
            Text(
                message.content,
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 11.dp),
                color = Color(0xFFE2DFEC),
                fontSize = 13.sp,
                lineHeight = 20.sp
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SettingsDialog(
    initial: AiSettings,
    preferences: android.content.SharedPreferences,
    onDismiss: () -> Unit,
    onSave: (AiSettings) -> Unit
) {
    var provider by rememberSaveable { mutableStateOf(initial.provider) }
    var endpoint by rememberSaveable { mutableStateOf(initial.endpoint) }
    var model by rememberSaveable { mutableStateOf(initial.model) }
    var apiKey by rememberSaveable { mutableStateOf("") }
    var clearKey by rememberSaveable { mutableStateOf(false) }
    var validationError by rememberSaveable { mutableStateOf("") }
    val isOllama = provider == "ollama"

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Conectar sua IA") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("A Astra não inclui uma chave de API. Para usar uma API, informe seu endereço HTTPS e sua chave. Ollama pode usar o servidor local do computador.", color = Muted, fontSize = 12.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterButton("Ollama", isOllama) {
                        provider = "ollama"
                        val ollamaSettings = readProviderSettings(preferences, "ollama")
                        endpoint = ollamaSettings.first
                        model = ollamaSettings.second
                    }
                    FilterButton("API", !isOllama) {
                        provider = "openai"
                        val apiSettings = readProviderSettings(preferences, "openai")
                        endpoint = apiSettings.first
                        model = apiSettings.second
                    }
                }
                SettingsField(
                    value = endpoint,
                    onChange = { endpoint = it },
                    label = if (isOllama) "Endereço do Ollama" else "Endereço da API"
                )
                if (isOllama) {
                    Text(
                        "Informe http://IP-DO-COMPUTADOR:11434 e o nome de um modelo instalado. O endereço fica salvo neste celular; 127.0.0.1 aponta para o próprio celular. Os dois dispositivos precisam estar na mesma rede Wi-Fi. Não exponha o Ollama à internet.",
                        color = Muted,
                        fontSize = 11.sp,
                        lineHeight = 15.sp
                    )
                }
                SettingsField(value = model, onChange = { model = it }, label = "Modelo")
                if (!isOllama) {
                    BasicTextField(
                        value = apiKey,
                        onValueChange = { apiKey = it; clearKey = false },
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Background, RoundedCornerShape(9.dp))
                            .padding(12.dp),
                        textStyle = TextStyle(color = Color.White, fontSize = 13.sp),
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        decorationBox = { inner ->
                            if (apiKey.isEmpty()) Text("Chave de API (opcional se já salva)", color = Muted, fontSize = 12.sp)
                            inner()
                        }
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        androidx.compose.material3.Checkbox(
                            checked = clearKey,
                            onCheckedChange = { clearKey = it; if (it) apiKey = "" }
                        )
                        Text("Remover chave salva", color = Muted, fontSize = 12.sp)
                    }
                }
                if (validationError.isNotBlank()) {
                    Text(validationError, color = Color(0xFFFFA9A9), fontSize = 12.sp)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val parsed = runCatching { URL(endpoint.trim()) }.getOrNull()
                if (parsed == null || parsed.protocol !in listOf("https", "http")) {
                    validationError = "Informe um endereço http:// ou https:// válido."
                } else if (model.isBlank()) {
                    validationError = "Informe o nome do modelo."
                } else if (!isOllama && apiKey.isBlank() && initial.apiKey.isBlank()) {
                    validationError = "Informe a chave da API."
                } else if (!isOllama && parsed.protocol != "https") {
                    validationError = "Use HTTPS para proteger sua chave da API."
                } else {
                    onSave(
                        AiSettings(
                            provider = provider,
                            endpoint = endpoint.trim().trimEnd('/'),
                            model = model.trim(),
                            apiKey = when {
                                clearKey -> ""
                                apiKey.isNotBlank() -> apiKey.trim()
                                else -> initial.apiKey
                            }
                        )
                    )
                }
            }) { Text("Salvar", color = Purple) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar", color = Muted) } }
    )
}

@Composable
private fun FilterButton(label: String, selected: Boolean, onClick: () -> Unit) {
    if (selected) {
        Button(onClick = onClick, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF35264D))) {
            Text(label, color = Color.White)
        }
    } else {
        OutlinedButton(onClick = onClick) { Text(label, color = Muted) }
    }
}

@Composable
private fun SettingsField(value: String, onChange: (String) -> Unit, label: String) {
    BasicTextField(
        value = value,
        onValueChange = onChange,
        modifier = Modifier
            .fillMaxWidth()
            .background(Background, RoundedCornerShape(9.dp))
            .padding(12.dp),
        textStyle = TextStyle(color = Color.White, fontSize = 13.sp),
        singleLine = true,
        decorationBox = { inner ->
            if (value.isEmpty()) Text(label, color = Muted, fontSize = 12.sp)
            inner()
        }
    )
}

private fun sendEducationPrompt(
    text: String,
    settings: AiSettings,
    messages: MutableList<ChatMessage>,
    educationMode: Boolean,
    setSending: (Boolean) -> Unit,
    setError: (String) -> Unit,
    scope: kotlinx.coroutines.CoroutineScope
) {
    if (messages.isNotEmpty()) return
    sendMessage(text, settings, messages, educationMode, setSending, setError, scope)
}

private fun sendMessage(
    text: String,
    settings: AiSettings,
    messages: MutableList<ChatMessage>,
    educationMode: Boolean,
    setSending: (Boolean) -> Unit,
    setError: (String) -> Unit,
    scope: kotlinx.coroutines.CoroutineScope
) {
    if (text.isBlank()) return
    messages.add(ChatMessage("user", text))
    val requestHistory = messages.toList()
    setSending(true)
    setError("")
    scope.launch {
        try {
            val reply = withContext(Dispatchers.IO) {
                requestAssistantReply(settings, requestHistory, educationMode)
            }
            messages.add(ChatMessage("assistant", reply))
        } catch (error: Exception) {
            setError(error.message ?: "Não foi possível conectar à IA.")
        } finally {
            setSending(false)
        }
    }
}

private fun requestAssistantReply(
    settings: AiSettings,
    history: List<ChatMessage>,
    educationMode: Boolean
): String {
    val systemPrompt = buildString {
        append("Você é Astra, uma assistente prestativa e acolhedora. Responda em português brasileiro, seja clara e não invente detalhes.")
        if (educationMode) {
            append(
                "\n\nModo Educação: ensine segurança digital defensiva a alunos e professores com linguagem apropriada e situações fictícias. Priorize identificar phishing e golpes, proteger contas, privacidade e autenticação em duas etapas. Crie planos de aula, atividades seguras e quizzes. Nunca peça senhas, códigos de verificação, dados pessoais ou que alguém abra links suspeitos. Não ensine invasão, exploração de sistemas, malware, roubo de credenciais, evasão ou contorno de proteções. Recuse esses pedidos brevemente e redirecione para prevenção."
            )
        }
    }
    val conversation = JSONArray().put(
        JSONObject().put("role", "system").put("content", systemPrompt)
    )
    history.takeLast(10).forEach { message ->
        conversation.put(JSONObject().put("role", message.role).put("content", message.content.take(6000)))
    }

    val isOllama = settings.provider == "ollama"
    if (!isOllama && URL(settings.endpoint).protocol != "https") {
        throw IllegalStateException("Use HTTPS para proteger sua chave da API.")
    }
    val url = if (isOllama) {
        "${settings.endpoint}/api/chat"
    } else {
        "${settings.endpoint}/chat/completions"
    }
    val payload = if (isOllama) {
        JSONObject()
            .put("model", settings.model)
            .put("messages", conversation)
            .put("stream", false)
    } else {
        JSONObject()
            .put("model", settings.model)
            .put("messages", conversation)
            .put("stream", false)
    }

    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 15_000
        readTimeout = 90_000
        doOutput = true
        setRequestProperty("Content-Type", "application/json")
        if (!isOllama) {
            if (settings.apiKey.isBlank()) throw IllegalStateException("Configure uma chave da API em Configurações.")
            setRequestProperty("Authorization", "Bearer ${settings.apiKey}")
        }
    }
    try {
        connection.outputStream.use {
            it.write(payload.toString().toByteArray(StandardCharsets.UTF_8))
        }
        val responseCode = connection.responseCode
        val responseStream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
        val responseText = responseStream?.bufferedReader()?.use { it.readText() }.orEmpty()
        if (responseCode !in 200..299) {
            throw IllegalStateException("A API respondeu $responseCode: ${responseText.take(300)}")
        }
        val json = JSONObject(responseText)
        val content = if (isOllama) {
            json.optJSONObject("message")?.optString("content").orEmpty()
        } else {
            json.optJSONArray("choices")
                ?.optJSONObject(0)
                ?.optJSONObject("message")
                ?.optString("content")
                .orEmpty()
        }
        if (content.isBlank()) throw IllegalStateException("A IA retornou uma resposta vazia.")
        return content
    } finally {
        connection.disconnect()
    }
}

private fun readSettings(preferences: android.content.SharedPreferences): AiSettings {
    val provider = preferences.getString("provider", "ollama") ?: "ollama"
    val providerSettings = readProviderSettings(preferences, provider)
    return AiSettings(
        provider = provider,
        endpoint = providerSettings.first,
        model = providerSettings.second,
        apiKey = decryptApiKey(preferences.getString("api-key", null))
    )
}

private fun readProviderSettings(
    preferences: android.content.SharedPreferences,
    provider: String
): Pair<String, String> {
    val isOllama = provider == "ollama"
    val endpointKey = if (isOllama) "ollama-endpoint" else "openai-endpoint"
    val modelKey = if (isOllama) "ollama-model" else "openai-model"
    val defaultEndpoint = if (isOllama) "http://127.0.0.1:11434" else "https://api.openai.com/v1"
    val defaultModel = if (isOllama) "qwen2.5:3b" else "gpt-4o-mini"
    val legacyProvider = preferences.getString("provider", "ollama")
    val legacyEndpoint = if (legacyProvider == provider) preferences.getString("endpoint", null) else null
    val legacyModel = if (legacyProvider == provider) preferences.getString("model", null) else null
    return Pair(
        preferences.getString(endpointKey, null) ?: legacyEndpoint ?: defaultEndpoint,
        preferences.getString(modelKey, null) ?: legacyModel ?: defaultModel
    )
}

private fun saveSettings(preferences: android.content.SharedPreferences, settings: AiSettings) {
    val previousProvider = preferences.getString("provider", "ollama") ?: "ollama"
    if (previousProvider != settings.provider) {
        val previousPrefix = if (previousProvider == "ollama") "ollama" else "openai"
        val migration = preferences.edit()
        if (!preferences.contains("$previousPrefix-endpoint")) {
            preferences.getString("endpoint", null)?.let {
                migration.putString("$previousPrefix-endpoint", it)
            }
        }
        if (!preferences.contains("$previousPrefix-model")) {
            preferences.getString("model", null)?.let {
                migration.putString("$previousPrefix-model", it)
            }
        }
        migration.apply()
    }
    val prefix = if (settings.provider == "ollama") "ollama" else "openai"
    preferences.edit()
        .putString("provider", settings.provider)
        .putString("endpoint", settings.endpoint)
        .putString("model", settings.model)
        .putString("$prefix-endpoint", settings.endpoint)
        .putString("$prefix-model", settings.model)
        .apply()
    if (settings.apiKey.isNotBlank()) {
        preferences.edit().putString("api-key", encryptApiKey(settings.apiKey)).apply()
    } else if (settings.provider == "openai") {
        preferences.edit().remove("api-key").apply()
    }
}

private fun getOrCreateEncryptionKey(): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (keyStore.getKey("astra-api-key", null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
        KeyGenParameterSpec.Builder(
            "astra-api-key",
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .build()
    )
    return generator.generateKey()
}

private fun encryptApiKey(value: String): String {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, getOrCreateEncryptionKey())
    val ciphertext = cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8))
    return Base64.encodeToString(cipher.iv + ciphertext, Base64.NO_WRAP)
}

private fun decryptApiKey(value: String?): String {
    if (value.isNullOrBlank()) return ""
    return runCatching {
        val encrypted = Base64.decode(value, Base64.NO_WRAP)
        val iv = encrypted.copyOfRange(0, 12)
        val ciphertext = encrypted.copyOfRange(12, encrypted.size)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateEncryptionKey(), GCMParameterSpec(128, iv))
        String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8)
    }.getOrDefault("")
}
