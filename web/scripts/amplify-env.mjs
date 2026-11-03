import {writeFileSync} from 'node:fs';
// Only non-secret deployment identifiers are copied. Never persist AWS credentials.
// The SSR runtime does not receive Amplify console variables, so they are written to .env.production.
const required=['TOPTRUMPS_TABLE_NAME','TOPTRUMPS_AWS_REGION'];
const optional=['TOPTRUMPS_CHALLENGES','TOPTRUMPS_CHALLENGE_TABLE_NAME','TOPTRUMPS_CHALLENGE_SECRET_ARN','TOPTRUMPS_CHALLENGE_INVITE_DAYS','TOPTRUMPS_CHALLENGE_RESULT_DAYS','TOPTRUMPS_GUEST_INACTIVITY_DAYS'];
const safe=/^[A-Za-z0-9_.:\/-]+$/;
const lines=[];
for(const key of required){const value=process.env[key];if(!value||!safe.test(value))throw Error('Set '+key+' in Amplify environment variables before building.');lines.push(key+'='+value);}
for(const key of optional){const value=process.env[key];if(!value)continue;if(!safe.test(value))throw Error(key+' contains unsupported characters.');lines.push(key+'='+value);}
if(process.env.TOPTRUMPS_CHALLENGES==='1'){
  for(const key of ['TOPTRUMPS_CHALLENGE_TABLE_NAME','TOPTRUMPS_CHALLENGE_SECRET_ARN'])if(!process.env[key])throw Error('TOPTRUMPS_CHALLENGES=1 needs '+key+'.');
}
writeFileSync('.env.production',lines.join('\n')+'\n',{mode:0o600});
