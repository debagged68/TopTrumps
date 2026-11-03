// Production signing-secret loader. Reads the secret named by TOPTRUMPS_CHALLENGE_SECRET_ARN
// from AWS Secrets Manager at runtime and keeps it only in memory.
//
// The SDK package is loaded dynamically so the computer game builds and runs without it.
// To enable challenges in production, add the dependency:
//   npm install --save-exact @aws-sdk/client-secrets-manager@<same version as client-dynamodb>
// Until then this loader fails closed and challenge routes report "unavailable".
export async function secretsManagerLoader(env = process.env) {
  const secretId = env.TOPTRUMPS_CHALLENGE_SECRET_ARN;
  if (!secretId) return null;
  const packageName = '@aws-sdk/client-secrets-manager';
  let sdk;
  try {
    sdk = await import(/* webpackIgnore: true */ packageName);
  } catch {
    console.error('Challenge secret unavailable: @aws-sdk/client-secrets-manager is not installed.');
    return null;
  }
  const client = new sdk.SecretsManagerClient({ region: env.TOPTRUMPS_AWS_REGION });
  const result = await client.send(new sdk.GetSecretValueCommand({ SecretId: secretId }));
  return result.SecretString ?? null;
}
