import {describe,it,expect} from 'vitest';
import {classify} from './domain.js';
import {normalizeBrazilianPhone,normalizeCpf} from './normalization.js';
describe('inbound classification',()=>{
 it.each(['SAIR','parar, por favor','Quero CANCELAR','REMOVER!','Não quero receber','NAO QUERO'])('suppresses %s',text=>expect(classify(text)).toBe('OPT_OUT'));
 it('handles negative intent before the positive substring',()=>expect(classify('não tenho interesse')).toBe('NOT_INTERESTED'));
 it('hands questions to humans',()=>expect(classify('qual a taxa?')).toBe('WAITING_HUMAN'));
 it('does not confuse a national DDD 55 with the country code',()=>expect(normalizeBrazilianPhone('55999998888')).toBe('+5555999998888'));
 it('preserves CPF leading zeros',()=>expect(normalizeCpf('012.345.678-90')).toBe('01234567890'));
});
