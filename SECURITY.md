# Security Notes

## Implemented

- Access gate controlled by `VITE_ZONE_ACCESS_CODE`.
- Camera permission is limited by the browser and `Permissions-Policy`.
- Security headers for Vercel (`vercel.json`) and Netlify (`public/_headers`).
- Strict CSP with no object embedding and no third-party framing.
- Dependency audit currently reports zero vulnerabilities.
- `.env*` files are ignored, except `.env.example`.

## Limitations

- This is a client-side application. A frontend access code is useful for a demo or controlled deploy, but it is not equivalent to server-side authentication.
- Event history is stored in memory only. It is not tamper-proof and is not an audit log.
- For real production use, protect the deployment with provider auth, SSO, a backend session system, or an API gateway.
- In GitHub Pages, `VITE_ZONE_ACCESS_CODE` is embedded in the frontend bundle during build. Treat it as a basic access barrier, not as a strong secret.

## Recommended Deployment Settings

- Require HTTPS.
- Set `VITE_ZONE_ACCESS_CODE` as a private environment variable.
- Keep the repository private if the access code or deployment context is sensitive.
- Run `npm run audit` before each deploy.
