import { addDays } from './date';
export type ParsedExpense = { amountCents: number; kind: 'expense' | 'income'; note: string; date: string };
export function guessCategory(note: string, categories: readonly { name: string; keywords: readonly string[] }[]): string | null {
 const text = note.toLowerCase(); return categories.find(c => c.keywords.some(k => text.includes(k.toLowerCase())))?.name ?? null;
}
export function parseExpense(input: string, today: string): ParsedExpense | null {
 const text = input.trim();
 const searchable = text.replace(/\b\d{1,2}-\d{1,2}\b/, '');
 if (/(?:^|\s)[+-]?\d+\.\d{3,}(?:\s|$)/.test(searchable)) return null;
 const amountMatch = searchable.match(/(?<![\d.])([+-]?)\s*(?:¥\s*)?(\d+(?:\.\d{1,2})?)(?![\d.])\s*(?:元|块)?/);
 if (!amountMatch) return null;
 const amountCents = Math.round(Number(amountMatch[2])*100);
 if (!Number.isFinite(amountCents) || amountCents <= 0) return null;
 let date = today;
 if (/前天/.test(text)) date = addDays(today,-2);
 else if (/昨天/.test(text)) date = addDays(today,-1);
 else { const md=text.match(/\b(\d{1,2})-(\d{1,2})\b/); if(md){const [,month,day]=md;const year=Number(today.slice(0,4));const candidate=`${year}-${month?.padStart(2,'0')}-${day?.padStart(2,'0')}`;const parsed=new Date(`${candidate}T00:00:00Z`);if(parsed.toISOString().slice(0,10)!==candidate)return null;date=candidate;} }
 const kind:ParsedExpense['kind']=/(收入|工资|报销|收款|\+)/.test(text)||amountMatch[1]==='+'?'income':'expense';
 const note=searchable.replace(amountMatch[0],'').replace(/今天|昨天|前天|收入|支出|\b\d{1,2}-\d{1,2}\b/g,'').trim();
 if(!note)return null;
 return {amountCents,kind,note,date};
}
