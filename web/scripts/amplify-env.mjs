import {writeFileSync} from 'node:fs';
// Only non-secret deployment identifiers are copied. Never persist AWS credentials.
const keys=['TOPTRUMPS_TABLE_NAME','TOPTRUMPS_AWS_REGION'];
const values=keys.map(key=>{const value=process.env[key];if(!value||!/^[A-Za-z0-9_.-]+$/.test(value))throw Error('Set '+key+' in Amplify environment variables before building.');return key+'='+value;});
writeFileSync('.env.production',values.join('\n')+'\n',{mode:0o600});
