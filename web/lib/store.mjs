import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
let client;
const local=new Map();
function config(){const table=process.env.TOPTRUMPS_TABLE_NAME;if(!table)throw Error('Round storage is not configured. Set TOPTRUMPS_TABLE_NAME in AWS Amplify.');client??=DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.TOPTRUMPS_AWS_REGION||'eu-west-2'}));return {table,client};}
function isLocal(){return process.env.TOPTRUMPS_LOCAL_STATE==='1'&&process.env.NODE_ENV!=='production';}
export async function read(id){if(isLocal())return local.get(id)||null;const {table,client}=config();const r=await client.send(new GetCommand({TableName:table,Key:{id},ConsistentRead:true}));return r.Item||null;}
export async function compareAndSet(record,expectedVersion){
 if(isLocal()){const current=local.get(record.id);if((current?.version??null)!==expectedVersion)return false;local.set(record.id,record);return true;}
 const {table,client}=config();try{await client.send(new PutCommand({TableName:table,Item:record,ConditionExpression:expectedVersion===null?'attribute_not_exists(id)':'#v = :version',...(expectedVersion===null?{}:{ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':version':expectedVersion}})}));return true;}catch(e){if(e?.name==='ConditionalCheckFailedException')return false;throw e;}
}
