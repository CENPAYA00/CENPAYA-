import { describe,it } from "node:test";
import assert from "node:assert/strict";
import { handleEngineeringRoutes } from "../.test-build/engineering.js";

const user=(id,role="user")=>({id,role,account_status:"active",banned:0});
function envWithFirst(firstRows=[]){
 const calls=[];
 const DB={prepare(sql){let values=[];return{
  bind(...args){values=args;return this;},
  async first(){calls.push({kind:"first",sql,values});return firstRows.shift()??null;},
  async all(){calls.push({kind:"all",sql,values});return {results:[]};},
  async run(){calls.push({kind:"run",sql,values});return {meta:{changes:1}};}
 };}};
 return {DB,calls};
}
void describe("D1 engineering workspace authorization",()=>{
 void it("requires an authenticated session for engineering routes",async()=>{
  const env=envWithFirst();
  const response=await handleEngineeringRoutes(new Request("https://worker.test/api/engineering/profile"),env,{path:"/api/engineering/profile",method:"GET",user:null});
  assert.equal(response.status,401);
  assert.equal(env.calls.length,0);
 });
 void it("does not expose the appointment roster to ordinary users",async()=>{
  const env=envWithFirst();
  const response=await handleEngineeringRoutes(new Request("https://worker.test/api/admin/engineering/users"),env,{path:"/api/admin/engineering/users",method:"GET",user:user("member-1")});
  assert.equal(response.status,403);
  assert.equal(env.calls.length,0);
 });
 void it("does not allow ordinary accounts into internal team chat",async()=>{
  const env=envWithFirst([{role:"user"},null,null]);
  const response=await handleEngineeringRoutes(new Request("https://worker.test/api/team/chat/conversations"),env,{path:"/api/team/chat/conversations",method:"GET",user:user("member-1")});
  assert.equal(response.status,403);
 });
 void it("denies message reads to accounts outside the conversation",async()=>{
  const env=envWithFirst([null]);
  const response=await handleEngineeringRoutes(new Request("https://worker.test/api/team/chat/conversations/11111111-1111-4111-8111-111111111111/messages"),env,{path:"/api/team/chat/conversations/11111111-1111-4111-8111-111111111111/messages",method:"GET",user:user("member-1")});
  assert.equal(response.status,403);
 });
});
