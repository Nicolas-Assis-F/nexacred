export async function api<T>(path:string,body?:unknown,method?:string):Promise<T>{
 const response=await fetch(`/api${path}`,{method:method??(body?'POST':'GET'),headers:body instanceof FormData?{}:{'content-type':'application/json'},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
 if(response.status===401){window.location.href='/login';throw new Error('Sessão expirada');}
 const data:unknown=await response.json();
 if(!response.ok){const m=(data as {message?:string|string[]}).message;throw new Error(Array.isArray(m)?m.join(', '):m??'Não foi possível concluir');}
 return data as T;
}
