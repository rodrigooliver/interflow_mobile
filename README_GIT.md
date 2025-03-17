# Interflow Mobile - Repositório Git

Este é o repositório oficial do aplicativo Interflow Mobile, uma versão WebView otimizada do Interflow para dispositivos móveis.

## Como clonar este repositório

```bash
git clone git@github.com:rodrigooliver/interflow_mobile.git
cd interflow_mobile
```

## Instalação de dependências

Após clonar o repositório, instale as dependências:

```bash
# Instalar dependências do Node.js
npm install

# Para iOS, instalar dependências do CocoaPods
cd ios && pod install && cd ..
```

## Branches

- `main`: Branch principal do projeto, contém o código estável
- `develop`: Branch de desenvolvimento, onde novas funcionalidades são integradas
- `feature/*`: Branches para desenvolvimento de novas funcionalidades
- `bugfix/*`: Branches para correção de bugs
- `release/*`: Branches para preparação de releases

## Fluxo de trabalho para contribuições

1. Clone o repositório
2. Crie uma branch a partir da `develop` para sua funcionalidade ou correção
   ```bash
   git checkout develop
   git pull
   git checkout -b feature/nome-da-funcionalidade
   ```
3. Faça suas alterações e commits
   ```bash
   git add .
   git commit -m "Descrição clara das alterações"
   ```
4. Envie sua branch para o repositório remoto
   ```bash
   git push -u origin feature/nome-da-funcionalidade
   ```
5. Crie um Pull Request para a branch `develop`

## Convenções de commit

Utilizamos convenções de commit para manter o histórico organizado:

- `feat`: Nova funcionalidade
- `fix`: Correção de bug
- `docs`: Alterações na documentação
- `style`: Alterações que não afetam o código (formatação, etc.)
- `refactor`: Refatoração de código
- `test`: Adição ou correção de testes
- `chore`: Alterações em arquivos de build, configurações, etc.

Exemplo:
```
feat: adiciona suporte a notificações silenciosas
```

## Releases

As releases são criadas a partir da branch `main` e seguem o versionamento semântico (MAJOR.MINOR.PATCH).

## Configuração do ambiente de desenvolvimento

Consulte o arquivo [SETUP.md](./SETUP.md) para instruções detalhadas sobre como configurar o ambiente de desenvolvimento.

## Documentação

- [README.md](./README.md): Documentação principal do projeto
- [SETUP.md](./SETUP.md): Instruções detalhadas de configuração
- [RESUMO.md](./RESUMO.md): Resumo do projeto e próximos passos 