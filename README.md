# Astra

Assistente de IA para Windows com conversa por texto e voz, IA local opcional e Modo Educação para segurança digital. O núcleo pulsa em roxo enquanto escuta e fica azul enquanto a assistente responde.

## Instalar no Windows

Com Node.js instalado, abra o PowerShell nesta pasta e execute:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

O script instala as dependências, gera o instalador e abre o assistente de instalação por usuário. Para iniciar durante o desenvolvimento, use `npm start`.

## Site de download

O site fica em `site/`. O GitHub Pages publica a versão estática para downloads; a implantação da API também serve esse mesmo site no endereço do seu servidor, com a página mobile e a API no mesmo domínio.

No servidor próprio, abra `https://<dominio-da-api>/` para downloads e `https://<dominio-da-api>/chat.html` para conversar no celular.

## Conta Astra e conversas sincronizadas

O site móvel em `site/chat.html` e o app Windows podem entrar na mesma conta Astra. Crie a conta no site mobile e informe o mesmo endereço da API e as mesmas credenciais no botão **Entrar e sincronizar** do app Windows. Conversas feitas com a conta conectada ficam salvas na API e aparecem nos dois dispositivos. Sem uma API publicada, o site funciona somente em desenvolvimento/local; conversas sem login continuam apenas no computador.

Publique a API seguindo os passos abaixo antes de criar a conta. No site servido pelo próprio backend, o endereço da API é preenchido automaticamente. No app Windows, use o endereço do servidor com `/v1` no final. As senhas são armazenadas com hash e salt; tokens de sessão têm validade de 30 dias. Ainda não há recuperação de senha, então mantenha a senha em local seguro. O histórico fica no volume Docker `astra_data`; faça backup desse volume junto com os dados do servidor.

## API própria para os apps móveis

O backend da Astra fica em `api/` e usa Ollama por padrão. Opcionalmente, pode encaminhar conversas para a API OpenAI. Nesse modo, `OPENAI_API_KEY` fica somente no ambiente do servidor; nunca coloque essa chave no APK, no site ou no repositório. O Docker Compose publica HTTPS pelo Caddy e limita o uso por IP e o número de respostas simultâneas. Configure também limites de uso e orçamento no projeto OpenAI do servidor.

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
5. O site com a API ficará em `https://api.<IP-PUBLICO>.nip.io/`; abra `/chat.html` no celular. No Windows, informe `https://api.<IP-PUBLICO>.nip.io/v1`. Crie a conta em qualquer um dos apps e use as mesmas credenciais no outro.

Se não quiser criar uma conta de nuvem agora, execute `powershell -ExecutionPolicy Bypass -File .\api\start-local.ps1` no Windows da Astra. O celular e o computador devem estar na mesma rede Wi-Fi e o computador precisa permanecer ligado. O app móvel vem configurado para usar `http://192.168.1.3:8080/v1` sem chave; se o IP do computador mudar, atualize-o em **Configurações → Astra**. Essa opção funciona somente na rede local e não mantém a IA acessível quando o PC está desligado.

## Usar a IA local

Em **Configurações**, selecione **Neste computador (Ollama)**. O padrão usa `http://127.0.0.1:11434` e o modelo `qwen2.5:3b`. A Astra tenta iniciar o servidor Ollama instalado no Windows se ele não estiver ativo. Use **Testar conexão** para confirmar que o servidor e o modelo estão disponíveis. A conversa é enviada ao Ollama local e não requer chave de API nem um serviço externo.

No servidor, configure `ASTRA_PROVIDER=openai`, `OPENAI_MODEL=gpt-4o-mini` e `OPENAI_API_KEY` no arquivo `.env` privado; depois reinicie os containers com `docker compose up -d`. A chave não é enviada ao app. O modo OpenAI só funciona quando o backend HTTPS está publicado e a chave de servidor tem acesso ao modelo selecionado.

As respostas são exibidas em fluxo assim que o modelo as gera. No Ollama, a Astra mantém o modelo aquecido por 10 minutos, limita o contexto recente e pede respostas curtas e organizadas.

## Conectar à LG webOS

Use **Conectar à TV** para pesquisar TVs LG webOS anunciadas na rede local. A Astra envia solicitações SSDP pelas interfaces IPv4 privadas e informa quantas respostas recebeu. Se a rede bloquear multicast/SSDP, digite o IPv4 privado da TV para tentar a conexão direta. Aprove a solicitação de pareamento na tela dela; o fluxo SSAP padrão usa aprovação na TV, não um PIN enviado ao computador.

Depois do pareamento, a Astra pode abrir aplicativos instalados, enviar play/pausa e digitar texto no campo atualmente selecionado na TV. “Coloque uma música no Spotify” abre o Spotify e envia play/retomar; para escolher uma música específica, abra a busca do Spotify na TV, envie o nome pelo painel da Astra e confirme. A Astra não navega sozinha por todas as telas do aplicativo.

O reconhecimento de voz depende do suporte do Chromium e da permissão de microfone do Windows. Se não estiver disponível, a conversa por texto continua funcionando.

## Modo Educação: segurança digital

Ative **Modo Educação** no topo da janela para receber explicações defensivas sobre phishing, golpes, privacidade e proteção de contas. Os atalhos na tela inicial geram atividades fictícias, quizzes e planos de aula para professores. Não use mensagens ou dados reais de alunos; o modo não orienta invasões, roubo de credenciais, malware ou evasão de proteções. Para atividades escolares, um professor deve revisar o material antes de aplicá-lo.

## Astra para Android

O app Android inclui o provedor **Astra**, que usa o backend sem pedir nem armazenar uma chave OpenAI. Para usar um computador na rede local, informe o endereço HTTP privado e mantenha os aparelhos no mesmo Wi-Fi; para acessar pela internet móvel, use o endereço HTTPS do backend publicado. HTTP fora de um IPv4 privado é recusado. Também é possível escolher Ollama na rede local. O histórico da conversa não é persistido. Para preencher automaticamente o endereço HTTPS no APK distribuído, defina a variável de repositório `ASTRA_API_BASE_URL` no GitHub (por exemplo, `https://api.seu-dominio/v1`) antes de executar o workflow Android; essa URL não é secreta.

O site escolhe o arquivo Android pelo tipo de dispositivo informado pelo navegador. Isso distingue Android de Windows, mas não identifica individualmente quem baixou; o site estático não cria contas nem rastreia pessoas. A chave OpenAI não pode ser criada e embutida no celular com segurança: todas as instalações Android usam a mesma API do servidor, que protege a credencial e precisa ter limites de orçamento e uso configurados.

O workflow **Build Astra Android APK** compila o projeto no GitHub Actions, publica o APK de depuração como artefato da execução e atualiza o download Android no GitHub Pages. O APK de depuração serve para testes; uma versão assinada para distribuição pública requer uma chave de assinatura de lançamento protegida.

## Astra para iOS

O protótipo iOS inclui chat, Modo Educação, conexão à API própria da Astra na rede local ou publicada com HTTPS, além de Ollama e API compatível. Para uso local, informe o endereço HTTP privado e mantenha os aparelhos no mesmo Wi-Fi; para acesso pela internet móvel, use o endereço HTTPS publicado. As configurações ficam salvas no aparelho; a chave de API compatível é guardada no Keychain.

O workflow **Build Astra iOS** verifica a compilação para o simulador e publica o app como artefato de teste. Para instalar em um iPhone ou publicar na App Store, ainda é necessário assinar o app com uma conta Apple Developer; a compilação do simulador não é instalável em um iPhone.
