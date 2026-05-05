# Zone

Sistema web de câmera de segurança inteligente para ambientes com baixo fluxo de pessoas.

## Recursos

- Detecção de pessoas em tempo real pela câmera.
- Tracking básico com ID por pessoa.
- Detecção complementar por rosto para casos de pessoa parcialmente visível.
- Zona restrita desenhável.
- Alertas visuais para intrusão, pessoa parada e movimento fora do horário.
- Opção de alerta sonoro para intrusão.
- Gate de acesso por código configurado via variável de ambiente.
- Headers de segurança para Vercel e Netlify.

## Rodar localmente

1. Instale as dependências:

```powershell
npm install
```

2. Crie um arquivo `.env.local` baseado em `.env.example`:

```powershell
Copy-Item .env.example .env.local
```

3. Edite `.env.local` e defina um código forte:

```text
VITE_ZONE_ACCESS_CODE="use-um-codigo-longo-e-privado"
```

4. Rode o app:

```powershell
npm run dev
```

## Deploy no GitHub Pages

Este projeto usa Vite/React. Por isso, o GitHub Pages deve publicar a pasta `dist` gerada pelo build, não os arquivos `src` diretamente. O workflow em `.github/workflows/deploy-pages.yml` faz isso automaticamente.

### Passo 1: Repositório

O repositório deve estar no GitHub como:

```text
https://github.com/giglio999/zone-security-camera
```

Se criar outro repositório, ajuste `VITE_BASE_PATH` no workflow para o nome dele.

### Passo 2: Configurar o código de acesso

No GitHub:

1. Abra o repositório.
2. Vá em `Settings`.
3. Entre em `Secrets and variables` > `Actions`.
4. Clique em `New repository secret`.
5. Crie o secret:

```text
Name: VITE_ZONE_ACCESS_CODE
Value: use-um-codigo-longo-e-privado
```

### Passo 3: Ativar GitHub Pages

No repositório:

1. Vá em `Settings`.
2. Clique em `Pages`.
3. Em `Source`, selecione `GitHub Actions`.
4. Salve.

### Passo 4: Enviar alterações

```powershell
git add .
git commit -m "Configure GitHub Pages deploy"
git push
```

O deploy será executado automaticamente pela aba `Actions`.

### Passo 5: Acessar

Depois de 1 a 2 minutos, o sistema deve ficar disponível em:

```text
https://giglio999.github.io/zone-security-camera/
```

## Deploy em Vercel ou Netlify

Configuração comum:

```text
Build command: npm run build
Output directory: dist
```

Defina `VITE_ZONE_ACCESS_CODE` nas variáveis de ambiente do provedor.

## Segurança

- Use HTTPS. Vercel e Netlify fornecem HTTPS automaticamente.
- `vercel.json` e `public/_headers` configuram CSP, HSTS, anti-clickjacking e Permissions-Policy.
- O código de acesso é uma barreira básica para deploy estático. Para produção real, use autenticação no servidor ou proteção de acesso do provedor.
- Eventos ficam somente no navegador. Para auditoria real, use backend e banco de dados.

## Verificações

```powershell
npm run lint
npm run build
npm run audit
```
