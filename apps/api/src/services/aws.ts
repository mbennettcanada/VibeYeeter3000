export async function listEcrImageTags(_repositoryName: string): Promise<string[]> {
  // TODO: use ECR client to list image tags
  return [];
}

export async function putSecretValue(_secretName: string, _value: string): Promise<void> {
  // TODO: use Secrets Manager client to create/update a secret value
}

export async function listSecretKeys(_appId: string): Promise<string[]> {
  // TODO: list secret names under the app's Secrets Manager path
  return [];
}

export async function listBackups(_bucket: string, _prefix: string): Promise<string[]> {
  // TODO: use S3 client to list backup object keys
  return [];
}
