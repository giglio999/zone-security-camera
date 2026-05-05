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

## Deploy

Configuração comum:

```text
Build command: npm run build
Output directory: dist
```

Defina `VITE_ZONE_ACCESS_CODE` nas variáveis de ambiente do provedor de deploy.

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
