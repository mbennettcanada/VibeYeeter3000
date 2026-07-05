# Templates

Mustache templates for files generated into app repos (workflow files,
Dockerfile, Helm values, `backend.tf`, etc.) go here. Templates use
`{{variable}}` interpolation and are rendered by `repo-ops.ts` when pushing
files to a registered app's GitHub repo.
