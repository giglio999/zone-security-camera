# Zone

Zone é um sistema web de câmera de segurança inteligente voltado para ambientes com baixo fluxo de pessoas, como escritórios, escolas no período noturno e setores administrativos. O sistema usa a câmera do navegador para detectar pessoas em tempo real, manter um ID por pessoa acompanhada e disparar alertas visuais e sonoros conforme regras simples de segurança.

## Principais recursos

- Detecção de pessoas em tempo real pela câmera.
- Tracking básico com ID estável por pessoa.
- Detecção complementar por rosto para reconhecer pessoas parcialmente visíveis.
- Zona restrita desenhável diretamente sobre o vídeo.
- Alerta de pessoa parada por tempo configurável.
- Modo fora de horário, que alerta quando qualquer pessoa é detectada.
- Indicador azul para movimento sem pessoa detectada.
- Lista simples de eventos com tipo de alerta, horário e ID.
- Opção de som para alertas de intrusão.
- Tela de acesso protegida por código configurado via variável de ambiente.

## Arquitetura do projeto

O Zone é uma aplicação frontend construída com React e Vite. Toda a análise de vídeo acontece no navegador, sem envio das imagens para um backend próprio.

Estrutura principal:

- `src/App.tsx`: interface principal, painel de regras, eventos, status do sistema e controle de acesso.
- `src/components/CameraTracker.tsx`: captura da câmera, detecção, tracking, desenho da zona restrita e disparo das regras.
- `src/components/trackingUtils.ts`: associação entre detecções e pessoas já rastreadas, mantendo IDs.
- `src/components/KalmanFilter.ts`: suavização das bounding boxes e predição em pequenas perdas de detecção.
- `src/components/motionUtils.ts`: detecção simples de movimento sem pessoa.
- `public/_headers`: headers de segurança para Netlify.
- `vercel.json`: headers de segurança para Vercel.
- `.github/workflows/deploy-pages.yml`: pipeline de build e publicação no GitHub Pages.

Tecnologias usadas:

- React 19
- Vite
- TypeScript
- Tailwind CSS
- TensorFlow.js
- COCO-SSD
- BlazeFace
- Lucide React
- GitHub Actions
- GitHub Pages

## Implantação

A aplicação foi hospedada no GitHub Pages:

```text
https://giglio999.github.io/zone-security-camera/
```

O deploy é feito automaticamente com GitHub Actions. A cada push na branch `main`, o workflow:

1. Instala as dependências com `npm ci`.
2. Executa auditoria de dependências com `npm run audit`.
3. Executa a checagem TypeScript com `npm run lint`.
4. Gera a build de produção com `npm run build`.
5. Publica a pasta `dist` no GitHub Pages.

Como o projeto usa Vite, o build define o caminho base:

```text
VITE_BASE_PATH=/zone-security-camera/
```

O código de acesso do sistema é configurado no GitHub como secret do Actions:

```text
VITE_ZONE_ACCESS_CODE
```

## Rodar localmente

1. Instale as dependências:

```powershell
npm install
```

2. Crie o arquivo `.env.local`:

```powershell
Copy-Item .env.example .env.local
```

3. Configure um código de acesso:

```text
VITE_ZONE_ACCESS_CODE="use-um-codigo-longo-e-privado"
```

4. Rode o projeto:

```powershell
npm run dev
```

## Segurança

- O acesso ao painel exige `VITE_ZONE_ACCESS_CODE`.
- A câmera depende da permissão explícita do navegador.
- Headers de segurança foram configurados para Vercel e Netlify.
- O GitHub Pages usa HTTPS automaticamente.
- O histórico de eventos fica apenas no navegador.

Observação: por ser uma aplicação frontend estática, o código de acesso é uma barreira básica para demonstração e uso controlado. Para produção real, o ideal é usar autenticação em servidor, SSO, API gateway ou proteção de acesso do provedor.

## Verificações

```powershell
npm run lint
npm run build
npm run audit
```
