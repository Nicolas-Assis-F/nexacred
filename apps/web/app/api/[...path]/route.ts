import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function proxy(request:NextRequest,{params}:{params:Promise<{path:string[]}>}){
 const {path}=await params;const route=path.join('/');
 if(request.method!=='GET'){
  const origin=request.headers.get('origin');const allowed=process.env.WEB_URL??'http://localhost:3000';
  if(origin!==allowed)return NextResponse.json({message:'Origem inválida'},{status:403});
 }
 const jar=await cookies();
 if(route==='auth/logout'){jar.delete('nexacred_token');return NextResponse.json({ok:true});}
 const token=jar.get('nexacred_token')?.value;
 if(!token&&route!=='auth/login')return NextResponse.json({message:'Faça login'},{status:401});
 const headers:Record<string,string>={};if(token)headers.authorization=`Bearer ${token}`;
 const type=request.headers.get('content-type');if(type)headers['content-type']=type;
 const options:RequestInit & {duplex?:'half'}={method:request.method,headers,cache:'no-store'};
 if(request.method!=='GET'&&request.method!=='HEAD'){options.body=request.body;options.duplex='half';}
 try{
  const response=await fetch(`${process.env.API_URL??'http://api:3001'}/${route}${request.nextUrl.search}`,options);
  if(route==='auth/login'&&response.ok){const result=await response.json() as {accessToken:string;user:unknown};jar.set('nexacred_token',result.accessToken,{httpOnly:true,secure:process.env.COOKIE_SECURE==='true',sameSite:'strict',path:'/',maxAge:8*3600});return NextResponse.json({user:result.user});}
  return new NextResponse(response.body,{status:response.status,headers:{'content-type':response.headers.get('content-type')??'application/json','cache-control':'no-store'}});
 }catch{return NextResponse.json({message:'API indisponível. Verifique os serviços.'},{status:503});}
}
export {proxy as GET,proxy as POST,proxy as PATCH,proxy as DELETE};
