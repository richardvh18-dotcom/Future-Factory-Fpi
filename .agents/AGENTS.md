# Agent Rules

## Internationalization (i18n)
- **Always use `react-i18next`**: Whenever you create or modify React components that contain user-facing text, you MUST wrap the text in the `useTranslation` hook (e.g., `t('key', 'Default text')`). 
- **No literal strings**: Do NOT use hardcoded literal strings for user-facing UI elements.
- **Example**: Instead of `<div>Hallo</div>`, use `<div>{t('greeting', 'Hallo')}</div>`.

## Documentation & Tracking
- **Conversation Summary**: Every single modification, addition, or bug fix made to the codebase MUST be documented and tracked in `docs/CONVERSATION_SUMMARY.md`. Ensure this file is kept up to date at the end of every task or session.

## Deployments & Versioning
- **Version Bumping**: Every time a deployment is performed, the application version MUST be bumped (e.g., in `package.json` or `.env`) to ensure that clients automatically refresh and fetch the latest version.
