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
