#!/usr/bin/env bash
set -euo pipefail
# Run after connecting this repository's main branch to a NEW Amplify app.
# Usage: AWS_PROFILE=oast-cottage bash scripts/deploy-aws.sh <Amplify-App-ID> <region>
# Add ENABLE_CHALLENGES=1 to switch friend challenges on (needs @aws-sdk/client-secrets-manager installed).
app_id=${1:?Supply the NEW TopTrumps Amplify app ID}
region=${2:?Supply the AWS region of the Amplify app and state stack, e.g. eu-north-1}
stack_name=toptrumps-state
repo_root=$(cd "$(dirname "$0")/.." && pwd)
export AWS_PAGER=''
command -v aws >/dev/null || { echo 'Install AWS CLI v2 first.' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'Python 3 is required.' >&2; exit 1; }
aws sts get-caller-identity --region "$region" --query Arn --output text
repository=$(aws amplify get-app --app-id "$app_id" --region "$region" --query app.repository --output text)
case "$repository" in
  https://github.com/debagged68/TopTrumps|https://github.com/debagged68/TopTrumps.git) ;;
  *) echo 'Refusing to change an app that is not connected to debagged68/TopTrumps.' >&2; exit 1 ;;
esac
aws cloudformation deploy --template-file "$repo_root/infra/toptrumps-state.yaml" --stack-name "$stack_name" --capabilities CAPABILITY_IAM --region "$region" --no-fail-on-empty-changeset
state_table=$(aws cloudformation describe-stacks --stack-name "$stack_name" --region "$region" --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue | [0]" --output text)
challenge_table=$(aws cloudformation describe-stacks --stack-name "$stack_name" --region "$region" --query "Stacks[0].Outputs[?OutputKey=='ChallengeTableName'].OutputValue | [0]" --output text)
challenge_secret=$(aws cloudformation describe-stacks --stack-name "$stack_name" --region "$region" --query "Stacks[0].Outputs[?OutputKey=='ChallengeSecretArn'].OutputValue | [0]" --output text)
compute_role=$(aws cloudformation describe-stacks --stack-name "$stack_name" --region "$region" --query "Stacks[0].Outputs[?OutputKey=='ComputeRoleArn'].OutputValue | [0]" --output text)
# Merge existing branch settings; never overwrite unrelated application variables.
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
aws amplify get-branch --app-id "$app_id" --branch-name main --region "$region" --output json > "$work_dir/branch.json"
python3 - "$work_dir" "$app_id" "$state_table" "$region" "$compute_role" "$challenge_table" "$challenge_secret" "${ENABLE_CHALLENGES:-}" <<'PY'
import json,sys
from pathlib import Path
folder,app,table,region,role,challenge_table,challenge_secret,enable=sys.argv[1:]
variables=json.loads(Path(folder,'branch.json').read_text())['branch'].get('environmentVariables',{})
variables.update(TOPTRUMPS_TABLE_NAME=table,TOPTRUMPS_AWS_REGION=region,AMPLIFY_MONOREPO_APP_ROOT='web')
variables.pop('TOPTRUMPS_LOCAL_STATE',None)
if challenge_table not in ('','None') and challenge_secret not in ('','None'):
    variables.update(TOPTRUMPS_CHALLENGE_TABLE_NAME=challenge_table,TOPTRUMPS_CHALLENGE_SECRET_ARN=challenge_secret)
if enable=='1':
    variables['TOPTRUMPS_CHALLENGES']='1'
elif enable=='0':
    variables.pop('TOPTRUMPS_CHALLENGES',None)
Path(folder,'update.json').write_text(json.dumps({'appId':app,'branchName':'main','environmentVariables':variables,'computeRoleArn':role,'enableAutoBuild':True,'enablePullRequestPreview':False,'framework':'Next.js - SSR'}))
PY
# Framework detection runs before the build; set app-level root as well as branch root.
aws amplify get-app --app-id "$app_id" --region "$region" --output json > "$work_dir/app.json"
python3 - "$work_dir" "$app_id" "$repo_root" <<'PY'
import json,sys
from pathlib import Path
folder,app,root=sys.argv[1:]
variables=json.loads(Path(folder,'app.json').read_text())['app'].get('environmentVariables',{})
variables['AMPLIFY_MONOREPO_APP_ROOT']='web'
Path(folder,'app-update.json').write_text(json.dumps({'appId':app,'platform':'WEB_COMPUTE','environmentVariables':variables,'buildSpec':Path(root,'amplify.yml').read_text()}))
PY
aws amplify update-app --cli-input-json "file://$work_dir/app-update.json" --region "$region" --query app.appId --output text
aws amplify update-branch --cli-input-json "file://$work_dir/update.json" --region "$region" --query branch.branchName --output text
job_id=$(aws amplify start-job --app-id "$app_id" --branch-name main --job-type RELEASE --region "$region" --query jobSummary.jobId --output text)
echo "Deployment started. Job: $job_id"
for attempt in $(seq 1 120); do
  status=$(aws amplify get-job --app-id "$app_id" --branch-name main --job-id "$job_id" --region "$region" --query job.summary.status --output text)
  case "$status" in
    SUCCEED) domain=$(aws amplify get-app --app-id "$app_id" --region "$region" --query app.defaultDomain --output text); echo "Live mobile link: https://main.$domain"; exit 0 ;;
    FAILED|CANCELLED) echo "Deployment $status. Inspect Amplify job $job_id logs." >&2; exit 1 ;;
  esac
  echo "Build status: $status"
  sleep 10
done
echo "Deployment still running; check Amplify job $job_id." >&2
exit 2
