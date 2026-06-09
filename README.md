# Project Document Library

Project Document Library is a NAS-friendly engineering document management system for PDF version control, online preview, change notice tracking, and Docker deployment.

The application is designed for one Docker instance per project. Deploy multiple containers with separate data directories when you need to manage multiple projects.

## Features

- Upload PDF documents and parse filenames in the form `Document-Code Rev.version title.pdf`.
- Upload change notices and link them to the main document code with `Document-Code-XG-number title.pdf`.
- Track the current active version for each document code.
- Keep historical versions and related change notices.
- Mark documents obsolete and restore them when needed.
- Search by document code, title, version, change notice, or original filename.
- Preview PDFs online.
- Export the current active document list as CSV.

## Docker Deployment

```bash
docker compose up -d --build
```

Then open:

```text
http://NAS-IP:3000
```

Important environment variables:

- `APP_PROJECT_NAME`: Project name shown in the UI.
- `DATA_DIR`: Container data root. Default: `/data`.
- `AUTH_SECRET`: Long random secret used for signing sessions and encrypting settings.
- `ADMIN_EMAIL`: Initial administrator email.
- `ADMIN_PASSWORD_HASH`: Initial administrator password hash.

Persistent directories:

- `/data/files`: Uploaded PDF files.
- `/data/db`: SQLite database.

For another project, copy the service and use a different port and data directory:

```yaml
ports:
  - "3001:3000"
volumes:
  - ./data/project-b/files:/data/files
  - ./data/project-b/db:/data/db
```

## Filename Rules

Version file example:

```text
LYG-2010-CC-N105 Rev.0 Factory basement structural layout.pdf
```

Parsed fields:

- Document code: `LYG-2010-CC-N105`
- Version: `Rev.0`
- Title: `Factory basement structural layout`

Change notice example:

```text
LYG-VW50-Z0-011-XG-001 Welding impact test temperature change notice.pdf
```

Parsed fields:

- Document code: `LYG-VW50-Z0-011`
- Change number: `XG-001`
- Title: `Welding impact test temperature change notice`

The main document version must exist before uploading a related change notice.

## Security Notes

- Do not commit `.env.local`, SQLite databases, uploaded PDFs, logs, or build output.
- Use HTTPS when exposing the system through a NAS reverse proxy.
- Generate strong secrets for production deployments.
- Keep `DATA_DIR` backed up.
