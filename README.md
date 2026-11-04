# Astra

Assistente de IA para Windows com conversa por texto e voz, IA local opcional e Modo Educação para segurança digital. O núcleo pulsa em roxo enquanto escuta e fica azul enquanto a assistente responde.

## Instalar no Windows

Com Node.js instalado, abra o PowerShell nesta pasta e execute:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

O script instala as dependências, gera o instalador e abre o assistente de instalação por usuário. Para iniciar durante o desenvolvimento, use `npm start`.

## Site de download

O site estático fica em `site/` e inclui o instalador Windows atual. Para publicá-lo mundialmente sem manter um servidor próprio, envie o projeto para um repositório público do GitHub com branch `main` e habilite **Settings → Pages → Source: GitHub Actions**. O workflow em `.github/workflows/deploy-site.yml` publica a pasta automaticamente; o GitHub fornece o endereço público `https://<usuario>.github.io/<repositorio>/`.

O endereço público só é criado depois que o projeto estiver em um repositório hospedado e o workflow terminar. Um domínio próprio é opcional.

## API própria para os apps móveis

O backend da Astra fica em `api/` e usa um modelo open-source executado pelo Ollama no próprio servidor; ele não envia conversas para uma API de IA de terceiros. O Docker Compose mantém o modelo e a API em containers separados, publica apenas HTTPS pelo Caddy e limita o uso por IP e o número de respostas simultâneas. O modelo inicial é `qwen2.5:3b`, adequado para testar em uma máquina ARM com CPU, mas mais lento que um serviço com GPU.

Para tentar manter a API ligada sem mensalidade, use uma VM elegível ao Oracle Cloud Always Free. A Oracle informa até 2 OCPUs ARM e 12 GB de RAM dentro dos limites gratuitos, sem GPU; o modelo pode responder devagar. Capacidade gratuita não é garantida e a Oracle pode reclamar VMs consideradas ociosas, então isso não garante disponibilidade permanente. O cadastro exige verificação de identidade e cartão; não selecione recursos pagos.

1. Crie uma conta no [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/).
2. No console, crie uma VM Ubuntu ARM64 (`VM.Standard.A1.Flex`) com até 2 OCPUs e 12 GB de memória, dentro do limite Always Free. Guarde a chave SSH privada somente no seu computador.
3. Nas regras de entrada da rede da VM, permita TCP `22` somente do seu IP e TCP `80`/`443` para acesso à API. Não libere `11434` nem `8080`.
4. Conecte por SSH e execute:

   ```bash
   sudo apt-get update
   sudo apt-get install -y git
   sudo git clone --depth 1 https://github.com/hacks318/astra-site.git /opt/astra-site
   cd /opt/astra-site
   sudo bash api/deploy-vm.sh api.<IP-PUBLICO>.nip.io
   ```

   Troque `<IP-PUBLICO>` pelo IPv4 público real da VM. `nip.io` fornece o DNS gratuito desse endereço; o Caddy configura HTTPS automaticamente.

O script instala Docker, baixa `qwen2.5:3b` e inicia a API. O GitHub Pages não executa esse backend. A conta Oracle e a VM precisam ser criadas antes de definir o endereço HTTPS final no Android e iOS; os apps ainda não estão ligados à API, pois não há um servidor público. A API deve ser validada com `npm run test:api`.

## Usar a IA local

Em **Configurações**, selecione **Neste computador (Ollama)**. O padrão usa `http://127.0.0.1:11434` e o modelo `qwen2.5:3b`. A Astra tenta iniciar o servidor Ollama instalado no Windows se ele não estiver ativo. Use **Testar conexão** para confirmar que o servidor e o modelo estão disponíveis. A conversa é enviada ao Ollama local e não requer chave de API nem um serviço externo.

Também é possível selecionar uma API compatível com OpenAI. Nesse modo, informe o endereço, modelo e chave; a chave é protegida com a criptografia de credenciais do Windows.

As respostas são exibidas em fluxo assim que o modelo as gera. No Ollama, a Astra mantém o modelo aquecido por 10 minutos, limita o contexto recente e pede respostas curtas e organizadas.

## Conectar à LG webOS

Use **Conectar à TV** para pesquisar TVs LG webOS anunciadas na rede local. A Astra envia solicitações SSDP pelas interfaces IPv4 privadas e informa quantas respostas recebeu. Se a rede bloquear multicast/SSDP, digite o IPv4 privado da TV para tentar a conexão direta. Aprove a solicitação de pareamento na tela dela; o fluxo SSAP padrão usa aprovação na TV, não um PIN enviado ao computador.

Depois do pareamento, a Astra pode abrir aplicativos instalados, enviar play/pausa e digitar texto no campo atualmente selecionado na TV. “Coloque uma música no Spotify” abre o Spotify e envia play/retomar; para escolher uma música específica, abra a busca do Spotify na TV, envie o nome pelo painel da Astra e confirme. A Astra não navega sozinha por todas as telas do aplicativo.

O reconhecimento de voz depende do suporte do Chromium e da permissão de microfone do Windows. Se não estiver disponível, a conversa por texto continua funcionando.

## Modo Educação: segurança digital

Ative **Modo Educação** no topo da janela para receber explicações defensivas sobre phishing, golpes, privacidade e proteção de contas. Os atalhos na tela inicial geram atividades fictícias, quizzes e planos de aula para professores. Não use mensagens ou dados reais de alunos; o modo não orienta invasões, roubo de credenciais, malware ou evasão de proteções. Para atividades escolares, um professor deve revisar o material antes de aplicá-lo.

## Astra para Android

O app Android inicial fica em `mobile/` e inclui conversa por texto, Modo Educação e configuração de Ollama ou API compatível com OpenAI. O provedor, endereço e modelo ficam salvos no celular; as configurações de Ollama e da API são mantidas separadamente. A chave da API fica criptografada pelo Android Keystore; o histórico da conversa não é persistido. Para usar o Ollama no computador, configure-o para aceitar conexões da rede local, conecte celular e computador ao mesmo Wi-Fi e informe no app o IP local do computador na porta `11434` (por exemplo, `http://192.168.1.20:11434`) e o nome de um modelo instalado. `127.0.0.1` aponta para o próprio celular, não para o computador. Não exponha o Ollama à internet. APIs de terceiros recebem as mensagens enviadas ao conversar.

O workflow **Build Astra Android APK** compila o projeto no GitHub Actions e publica o APK de depuração como artefato da execução. O APK de depuração serve para testes; uma versão assinada para distribuição pública requer uma chave de assinatura de lançamento protegida.

## Astra para iOS

O protótipo iOS fica em `ios/` e inclui chat, Modo Educação, conexão com Ollama ou API compatível e configurações salvas no aparelho. A chave da API é guardada no Keychain. Para usar Ollama no computador, conecte o iPhone e o computador à mesma rede Wi-Fi e informe o IP local do computador e a porta `11434`; não exponha o servidor à internet.

O workflow **Build Astra iOS** verifica a compilação para o simulador e publica o app como artefato de teste. Para instalar em um iPhone ou publicar na App Store, ainda é necessário assinar o app com uma conta Apple Developer; a compilação do simulador não é instalável em um iPhone.
